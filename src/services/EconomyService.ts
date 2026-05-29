import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';
import type { SourceSystem, TransactionType, Snowflake } from '../types';
import { LoggerService } from './LoggerService';
import { assertPositive, fromDbString, toDbString } from '../utils/math';

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
