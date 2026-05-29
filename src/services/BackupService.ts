import { Pool } from 'pg';
import Decimal from 'decimal.js';
import type { Snowflake } from '../types';
import { EconomyService } from './EconomyService';
import { LoggerService } from './LoggerService';
import { fromDbString, toDbString } from '../utils/math';
import {
  TRANSACTION_TYPES_CREDIT,
  TRANSACTION_TYPES_DEBIT,
} from '../utils/constants';

interface BalanceEntry {
  userId: string;
  balance: string;
}

export class BackupService {
  constructor(
    private readonly pool: Pool,
    private readonly economy: EconomyService,
    private readonly logger: LoggerService
  ) {}

  async takeEconomySnapshot(metadata?: Record<string, unknown>): Promise<string> {
    const balances = await this.pool.query<{ user_id: string; balance: string }>(
      'SELECT user_id, balance FROM user_balances ORDER BY user_id'
    );

    const entries: BalanceEntry[] = balances.rows.map((r) => ({
      userId: r.user_id,
      balance: r.balance,
    }));

    let total = new Decimal(0);
    for (const e of entries) {
      total = total.plus(fromDbString(e.balance));
    }

    const result = await this.pool.query<{ snapshot_id: string }>(
      `INSERT INTO economy_snapshots (full_user_balances, total_rc_in_circulation, metadata)
       VALUES ($1, $2, $3) RETURNING snapshot_id`,
      [JSON.stringify(entries), toDbString(total), metadata ? JSON.stringify(metadata) : null]
    );

    const snapshotId = result.rows[0].snapshot_id;
    this.logger.info('Economy snapshot created', { transactionId: snapshotId });
    return snapshotId;
  }

  async rollbackEconomy(snapshotId: string, adminId: Snowflake): Promise<void> {
    const snap = await this.pool.query<{
      full_user_balances: BalanceEntry[];
      total_rc_in_circulation: string;
    }>('SELECT full_user_balances, total_rc_in_circulation FROM economy_snapshots WHERE snapshot_id = $1', [
      snapshotId,
    ]);

    if (snap.rowCount === 0) {
      throw new Error('Snapshot not found');
    }

    const entries: BalanceEntry[] =
      typeof snap.rows[0].full_user_balances === 'string'
        ? JSON.parse(snap.rows[0].full_user_balances as unknown as string)
        : snap.rows[0].full_user_balances;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('TRUNCATE user_balances');
      for (const entry of entries) {
        await client.query(
          'INSERT INTO user_balances (user_id, balance) VALUES ($1, $2)',
          [entry.userId, entry.balance]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await this.economy.recordSystemTransaction(
      adminId,
      `Economy Rollback to Snapshot ${snapshotId}`,
      { adminId, snapshotId, type: 'rollback' }
    );

    this.logger.warn('Economy rollback executed', { userId: adminId, transactionId: snapshotId });
  }

  async rollbackUser(userId: Snowflake, timestamp: Date, adminId: Snowflake): Promise<void> {
    const snap = await this.pool.query<{ balance: string; id: string }>(
      `SELECT balance, id FROM user_snapshots
       WHERE user_id = $1 AND timestamp <= $2
       ORDER BY timestamp DESC LIMIT 1`,
      [userId, timestamp]
    );

    if (snap.rowCount === 0) {
      throw new Error('No user snapshot found for the given timestamp');
    }

    const targetBalance = fromDbString(snap.rows[0].balance);
    await this.economy.setBalance(
      userId,
      targetBalance,
      `User Rollback to ${timestamp.toISOString()}`,
      adminId
    );

    this.logger.warn('User rollback executed', { userId, transactionId: snap.rows[0].id });
  }

  async replayEconomy(
    startTimestamp: Date,
    endTimestamp: Date | null,
    adminId: Snowflake
  ): Promise<void> {
    const params: unknown[] = [startTimestamp];
    let query = `SELECT user_id, type, amount, balance_after
                 FROM transactions
                 WHERE timestamp >= $1`;

    if (endTimestamp) {
      query += ' AND timestamp <= $2';
      params.push(endTimestamp);
    }
    query += ' ORDER BY timestamp ASC, id ASC';

    const txs = await this.pool.query<{
      user_id: string;
      type: string;
      amount: string;
      balance_after: string;
    }>(query, params);

    const balances = new Map<string, Decimal>();

    for (const tx of txs.rows) {
      const uid = tx.user_id;
      const amount = fromDbString(tx.amount);
      let current = balances.get(uid) ?? new Decimal(0);

      if (TRANSACTION_TYPES_CREDIT.has(tx.type)) {
        current = current.plus(amount);
      } else if (TRANSACTION_TYPES_DEBIT.has(tx.type)) {
        current = current.minus(amount);
      } else if (tx.type === 'system') {
        continue;
      } else {
        current = fromDbString(tx.balance_after);
      }
      balances.set(uid, current);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('TRUNCATE user_balances');
      for (const [userId, balance] of balances) {
        if (balance.isNegative()) continue;
        await client.query('INSERT INTO user_balances (user_id, balance) VALUES ($1, $2)', [
          userId,
          toDbString(balance),
        ]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await this.economy.recordSystemTransaction(
      adminId,
      `Economy Replay from ${startTimestamp.toISOString()}${endTimestamp ? ` to ${endTimestamp.toISOString()}` : ''}`,
      { adminId, startTimestamp, endTimestamp, type: 'rollback' }
    );

    this.logger.warn('Economy replay executed', { userId: adminId });
  }
}
