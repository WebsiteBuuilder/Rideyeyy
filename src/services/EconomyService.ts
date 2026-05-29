import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';
import type { RedeemOption, SourceSystem, TransactionType, Snowflake } from '../types';
import { LoggerService } from './LoggerService';
import { assertPositive, fromDbString, toDbString } from '../utils/math';
import { withTransaction } from '../database';

export class InsufficientFundsError extends Error {
  constructor(userId: Snowflake, required: Decimal, available: Decimal) {
    super(
      `Insufficient funds for user ${userId}: required ${required.toFixed(2)} RC, available ${available.toFixed(2)} RC`
    );
    this.name = 'InsufficientFundsError';
  }
}

interface RecordTxParams {
  userId: Snowflake;
  type: TransactionType;
  amount: Decimal;
  balanceBefore: Decimal;
  balanceAfter: Decimal;
  reason: string;
  sourceSystem: SourceSystem;
  metadata?: Record<string, unknown>;
  transactionBatchId?: string;
}

export class EconomyService {
  constructor(
    private readonly pool: Pool,
    private readonly logger: LoggerService
  ) {}

  async getBalance(userId: Snowflake): Promise<Decimal> {
    const result = await this.pool.query<{ balance: string }>(
      'SELECT balance FROM user_balances WHERE user_id = $1',
      [userId]
    );
    if (result.rowCount === 0) {
      return new Decimal(0);
    }
    return fromDbString(result.rows[0].balance);
  }

  async verifyBalance(userId: Snowflake, requiredAmount: Decimal): Promise<boolean> {
    const balance = await this.getBalance(userId);
    return balance.gte(requiredAmount);
  }

  async ensureUserRow(client: PoolClient, userId: Snowflake): Promise<Decimal> {
    const existing = await client.query<{ balance: string }>(
      'SELECT balance FROM user_balances WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return fromDbString(existing.rows[0].balance);
    }
    await client.query(
      'INSERT INTO user_balances (user_id, balance) VALUES ($1, 0.00) ON CONFLICT (user_id) DO NOTHING',
      [userId]
    );
    const locked = await client.query<{ balance: string }>(
      'SELECT balance FROM user_balances WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    return fromDbString(locked.rows[0].balance);
  }

  async createUserSnapshot(
    client: PoolClient,
    userId: Snowflake,
    reason: string,
    transactionId?: string
  ): Promise<void> {
    const balance = await this.ensureUserRow(client, userId);
    await client.query(
      `INSERT INTO user_snapshots (user_id, balance, reason, transaction_id)
       VALUES ($1, $2, $3, $4)`,
      [userId, toDbString(balance), reason, transactionId ?? null]
    );
  }

  private async recordTransaction(client: PoolClient, params: RecordTxParams): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO transactions
        (user_id, type, amount, balance_before, balance_after, reason, metadata, source_system, transaction_batch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        params.userId,
        params.type,
        toDbString(params.amount),
        toDbString(params.balanceBefore),
        toDbString(params.balanceAfter),
        params.reason,
        params.metadata ? JSON.stringify(params.metadata) : null,
        params.sourceSystem,
        params.transactionBatchId ?? null,
      ]
    );
    return result.rows[0].id;
  }

  private async updateBalance(
    client: PoolClient,
    userId: Snowflake,
    newBalance: Decimal
  ): Promise<void> {
    await client.query(
      'UPDATE user_balances SET balance = $1, last_updated = NOW() WHERE user_id = $2',
      [toDbString(newBalance), userId]
    );
  }

  private async mutateBalance(
    userId: Snowflake,
    mutate: (current: Decimal, client: PoolClient) => Promise<{
      newBalance: Decimal;
      type: TransactionType;
      amount: Decimal;
      reason: string;
      sourceSystem: SourceSystem;
      metadata?: Record<string, unknown>;
      transactionBatchId?: string;
    }>,
    explicitType?: TransactionType
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await this.ensureUserRow(client, userId);
      const result = await mutate(current, client);
      await this.updateBalance(client, userId, result.newBalance);
      const txId = await this.recordTransaction(client, {
        userId,
        type: explicitType ?? result.type,
        amount: result.amount,
        balanceBefore: current,
        balanceAfter: result.newBalance,
        reason: result.reason,
        sourceSystem: result.sourceSystem,
        metadata: result.metadata,
        transactionBatchId: result.transactionBatchId,
      });
      await client.query('COMMIT');
      this.logger.info('Balance mutation', {
        userId,
        transactionId: txId,
        type: result.type,
      });
      return txId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async addBalance(
    userId: Snowflake,
    amount: Decimal,
    reason: string,
    sourceSystem: SourceSystem = 'economy',
    transactionBatchId?: string,
    metadata?: Record<string, unknown>,
    transactionType: TransactionType = 'earn'
  ): Promise<string> {
    assertPositive(amount);
    return this.mutateBalance(
      userId,
      async (current) => ({
        newBalance: current.plus(amount),
        type: transactionType,
        amount,
        reason,
        sourceSystem,
        metadata,
        transactionBatchId,
      }),
      transactionType
    );
  }

  async removeBalance(
    userId: Snowflake,
    amount: Decimal,
    reason: string,
    sourceSystem: SourceSystem = 'economy',
    transactionBatchId?: string,
    metadata?: Record<string, unknown>,
    transactionType: TransactionType = 'spend'
  ): Promise<string> {
    assertPositive(amount);
    return this.mutateBalance(
      userId,
      async (current) => {
        if (current.lt(amount)) {
          throw new InsufficientFundsError(userId, amount, current);
        }
        return {
          newBalance: current.minus(amount),
          type: transactionType,
          amount,
          reason,
          sourceSystem,
          metadata,
          transactionBatchId,
        };
      },
      transactionType
    );
  }

  /** Atomically deduct bet and credit payout in one ledger transaction. */
  async executeGambleRound(
    userId: Snowflake,
    betAmount: Decimal,
    payoutAmount: Decimal,
    batchId: string,
    betReason: string,
    winReason: string,
    metadata?: Record<string, unknown>
  ): Promise<{ net: Decimal; payout: Decimal }> {
    assertPositive(betAmount);
    if (payoutAmount.isNegative()) {
      throw new Error('Payout cannot be negative');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await this.ensureUserRow(client, userId);
      if (current.lt(betAmount)) {
        throw new InsufficientFundsError(userId, betAmount, current);
      }

      let balance = current.minus(betAmount);
      await this.updateBalance(client, userId, balance);
      await this.recordTransaction(client, {
        userId,
        type: 'gamble_loss',
        amount: betAmount,
        balanceBefore: current,
        balanceAfter: balance,
        reason: betReason,
        sourceSystem: 'gamble',
        metadata,
        transactionBatchId: batchId,
      });

      if (payoutAmount.gt(0)) {
        const beforeWin = balance;
        balance = balance.plus(payoutAmount);
        await this.updateBalance(client, userId, balance);
        await this.recordTransaction(client, {
          userId,
          type: 'gamble_win',
          amount: payoutAmount,
          balanceBefore: beforeWin,
          balanceAfter: balance,
          reason: winReason,
          sourceSystem: 'gamble',
          metadata,
          transactionBatchId: batchId,
        });
      }

      await client.query('COMMIT');
      return { net: payoutAmount.minus(betAmount), payout: payoutAmount };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Atomically charge crate price and credit RC reward (within an existing transaction). */
  async executeCratePurchaseOnClient(
    client: PoolClient,
    userId: Snowflake,
    price: Decimal,
    rcReward: Decimal,
    crateType: string
  ): Promise<{ purchaseTxId: string; rewardTxId?: string }> {
    assertPositive(price);
    if (rcReward.isNegative()) {
      throw new Error('RC reward cannot be negative');
    }

    const current = await this.ensureUserRow(client, userId);
    if (current.lt(price)) {
      throw new InsufficientFundsError(userId, price, current);
    }

    let balance = current.minus(price);
    await this.updateBalance(client, userId, balance);
    const purchaseTxId = await this.recordTransaction(client, {
      userId,
      type: 'crate_open',
      amount: price,
      balanceBefore: current,
      balanceAfter: balance,
      reason: `${crateType} Crate Purchase`,
      sourceSystem: 'crate',
    });

    let rewardTxId: string | undefined;
    if (rcReward.gt(0)) {
      const beforeWin = balance;
      balance = balance.plus(rcReward);
      await this.updateBalance(client, userId, balance);
      rewardTxId = await this.recordTransaction(client, {
        userId,
        type: 'earn',
        amount: rcReward,
        balanceBefore: beforeWin,
        balanceAfter: balance,
        reason: `${crateType} Crate RC Reward`,
        sourceSystem: 'crate',
      });
    }

    return { purchaseTxId, rewardTxId };
  }

  /** Atomically debit RC and insert a pending redeem row. */
  async executeRedeemPurchase(
    client: PoolClient,
    userId: Snowflake,
    cost: Decimal,
    option: RedeemOption,
    originalNickname: string,
    usdValue: number
  ): Promise<{ txId: string; redeemId: string }> {
    assertPositive(cost);
    const current = await this.ensureUserRow(client, userId);
    if (current.lt(cost)) {
      throw new InsufficientFundsError(userId, cost, current);
    }

    const newBalance = current.minus(cost);
    await this.updateBalance(client, userId, newBalance);
    const txId = await this.recordTransaction(client, {
      userId,
      type: 'redeem',
      amount: cost,
      balanceBefore: current,
      balanceAfter: newBalance,
      reason: `Redeem ${option}`,
      sourceSystem: 'redeem',
      metadata: { redeemOption: option },
    });

    const redeemInsert = await client.query<{ id: string }>(
      `INSERT INTO redeem_transactions
        (user_id, redeem_option, rc_spent, redeem_value_usd, original_nickname, redeem_status, transaction_id)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)
       RETURNING id`,
      [userId, option, toDbString(cost), usdValue, originalNickname.slice(0, 32), txId]
    );

    return { txId, redeemId: redeemInsert.rows[0].id };
  }

  /**
   * Atomically debit bet and credit payout for blackjack.
   * When payout is zero, only the bet leg is recorded.
   */
  async executeBlackjackRound(
    userId: Snowflake,
    betAmount: Decimal,
    payoutAmount: Decimal,
    batchId: string,
    betReason: string,
    payoutReason: string,
    metadata?: Record<string, unknown>
  ): Promise<{ betTxId: string | null; payoutTxId: string | null }> {
    if (betAmount.isNegative() || payoutAmount.isNegative()) {
      throw new Error('Bet and payout cannot be negative');
    }
    if (betAmount.isZero() && payoutAmount.isZero()) {
      throw new Error('Blackjack round requires a bet or payout');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await this.ensureUserRow(client, userId);
      let balance = current;
      let betTxId: string | null = null;
      let payoutTxId: string | null = null;

      if (betAmount.gt(0)) {
        if (balance.lt(betAmount)) {
          throw new InsufficientFundsError(userId, betAmount, balance);
        }
        const before = balance;
        balance = balance.minus(betAmount);
        await this.updateBalance(client, userId, balance);
        betTxId = await this.recordTransaction(client, {
          userId,
          type: 'gamble_loss',
          amount: betAmount,
          balanceBefore: before,
          balanceAfter: balance,
          reason: betReason,
          sourceSystem: 'gamble',
          metadata,
          transactionBatchId: batchId,
        });
      }

      if (payoutAmount.gt(0)) {
        const before = balance;
        balance = balance.plus(payoutAmount);
        await this.updateBalance(client, userId, balance);
        payoutTxId = await this.recordTransaction(client, {
          userId,
          type: 'gamble_win',
          amount: payoutAmount,
          balanceBefore: before,
          balanceAfter: balance,
          reason: payoutReason,
          sourceSystem: 'gamble',
          metadata,
          transactionBatchId: batchId,
        });
      }

      await client.query('COMMIT');
      return { betTxId, payoutTxId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Credit-only blackjack payout (bet already placed). */
  async creditBlackjackPayout(
    userId: Snowflake,
    payoutAmount: Decimal,
    reason: string,
    batchId?: string,
    metadata?: Record<string, unknown>
  ): Promise<string | null> {
    if (payoutAmount.isZero()) {
      return null;
    }
    const { payoutTxId } = await this.executeBlackjackRound(
      userId,
      new Decimal(0),
      payoutAmount,
      batchId ?? randomUUID(),
      'Blackjack (no additional bet)',
      reason,
      metadata
    );
    return payoutTxId;
  }

  /** Debit-only blackjack bet. */
  async debitBlackjackBet(
    userId: Snowflake,
    betAmount: Decimal,
    reason: string,
    batchId?: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    assertPositive(betAmount);
    const { betTxId } = await this.executeBlackjackRound(
      userId,
      betAmount,
      new Decimal(0),
      batchId ?? randomUUID(),
      reason,
      'Blackjack (no payout)',
      metadata
    );
    if (!betTxId) {
      throw new Error('Failed to record blackjack bet');
    }
    return betTxId;
  }

  runInTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    return withTransaction(fn);
  }

  async setBalance(
    userId: Snowflake,
    amount: Decimal,
    reason: string,
    adminId: Snowflake,
    transactionBatchId?: string
  ): Promise<string> {
    if (amount.isNegative()) {
      throw new Error('Balance cannot be negative');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.createUserSnapshot(client, userId, 'Before Admin Adjustment');
      const current = await this.ensureUserRow(client, userId);
      const delta = amount.minus(current);
      await this.updateBalance(client, userId, amount);

      const type: TransactionType = delta.gte(0) ? 'admin_add' : 'admin_remove';
      const txId = await this.recordTransaction(client, {
        userId,
        type,
        amount: delta.abs(),
        balanceBefore: current,
        balanceAfter: amount,
        reason,
        sourceSystem: 'admin',
        metadata: { adminId },
        transactionBatchId,
      });
      await client.query('COMMIT');
      return txId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async transferBalance(
    fromUserId: Snowflake,
    toUserId: Snowflake,
    amount: Decimal,
    reason: string,
    transactionBatchId?: string
  ): Promise<void> {
    assertPositive(amount);
    if (fromUserId === toUserId) {
      throw new Error('Cannot transfer to yourself');
    }

    const batchId = transactionBatchId ?? randomUUID();
    const [first, second] = fromUserId < toUserId ? [fromUserId, toUserId] : [toUserId, fromUserId];

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.ensureUserRow(client, first);
      await this.ensureUserRow(client, second);

      const fromResult = await client.query<{ balance: string }>(
        'SELECT balance FROM user_balances WHERE user_id = $1 FOR UPDATE',
        [fromUserId]
      );
      const toResult = await client.query<{ balance: string }>(
        'SELECT balance FROM user_balances WHERE user_id = $1 FOR UPDATE',
        [toUserId]
      );

      const fromBalance = fromDbString(fromResult.rows[0].balance);
      const toBalance = fromDbString(toResult.rows[0].balance);

      if (fromBalance.lt(amount)) {
        throw new InsufficientFundsError(fromUserId, amount, fromBalance);
      }

      const newFrom = fromBalance.minus(amount);
      const newTo = toBalance.plus(amount);

      await this.updateBalance(client, fromUserId, newFrom);
      await this.updateBalance(client, toUserId, newTo);

      await this.recordTransaction(client, {
        userId: fromUserId,
        type: 'transfer_out',
        amount,
        balanceBefore: fromBalance,
        balanceAfter: newFrom,
        reason,
        sourceSystem: 'economy',
        metadata: { toUserId },
        transactionBatchId: batchId,
      });

      await this.recordTransaction(client, {
        userId: toUserId,
        type: 'transfer_in',
        amount,
        balanceBefore: toBalance,
        balanceAfter: newTo,
        reason,
        sourceSystem: 'economy',
        metadata: { fromUserId },
        transactionBatchId: batchId,
      });

      await client.query('COMMIT');
      this.logger.info('Transfer completed', { userId: fromUserId, transactionId: batchId });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getTransactions(
    userId: Snowflake,
    limit: number
  ): Promise<
    Array<{
      id: string;
      type: string;
      amount: string;
      balance_after: string;
      reason: string;
      timestamp: Date;
    }>
  > {
    const result = await this.pool.query(
      `SELECT id, type, amount, balance_after, reason, timestamp
       FROM transactions WHERE user_id = $1
       ORDER BY timestamp DESC LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  }

  async getLeaderboard(limit: number): Promise<Array<{ user_id: string; balance: string }>> {
    const result = await this.pool.query(
      `SELECT user_id, balance FROM user_balances
       ORDER BY balance DESC LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async recordAuditTransaction(
    userId: Snowflake,
    type: 'rollback' | 'admin',
    reason: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await this.ensureUserRow(client, userId);
      const txId = await this.recordTransaction(client, {
        userId,
        type,
        amount: new Decimal(0),
        balanceBefore: current,
        balanceAfter: current,
        reason,
        sourceSystem: type === 'rollback' ? 'rollback' : 'admin',
        metadata,
      });
      await client.query('COMMIT');
      return txId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async recordSystemTransaction(
    userId: Snowflake,
    reason: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await this.ensureUserRow(client, userId);
      const txId = await this.recordTransaction(client, {
        userId,
        type: 'system',
        amount: new Decimal(0),
        balanceBefore: current,
        balanceAfter: current,
        reason,
        sourceSystem: 'system',
        metadata,
      });
      await client.query('COMMIT');
      return txId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
