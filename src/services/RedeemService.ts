import { Client } from 'discord.js';
import { Pool } from 'pg';
import Decimal from 'decimal.js';
import { config } from '../config';
import { EconomyService } from './EconomyService';
import { LoggerService } from './LoggerService';
import { UserService } from './UserService';
import type { RedeemOption, Snowflake } from '../types';

const REDEEM_MAP: Record<
  RedeemOption,
  { rcCost: number; usdValue: number; tag: string }
> = {
  one_dollar_credit: {
    rcCost: config.redeem.oneDollar,
    usdValue: 1,
    tag: '| -$1 CREDIT',
  },
  two_dollar_credit: {
    rcCost: config.redeem.twoDollar,
    usdValue: 2,
    tag: '| -$2 CREDIT',
  },
  five_dollar_credit: {
    rcCost: config.redeem.fiveDollar,
    usdValue: 5,
    tag: '| -$5 CREDIT',
  },
  ten_dollar_credit: {
    rcCost: config.redeem.tenDollar,
    usdValue: 10,
    tag: '| -$10 CREDIT',
  },
  free_ride: {
    rcCost: config.redeem.freeRide,
    usdValue: 20,
    tag: '| -FREE RIDE',
  },
};

export class RedeemService {
  constructor(
    private readonly pool: Pool,
    private readonly economy: EconomyService,
    private readonly user: UserService,
    private readonly logger: LoggerService
  ) {}

  getOption(option: string): (typeof REDEEM_MAP)[RedeemOption] | null {
    if (option in REDEEM_MAP) {
      return REDEEM_MAP[option as RedeemOption];
    }
    return null;
  }

  async redeemCredit(
    client: Client,
    guildId: Snowflake,
    userId: Snowflake,
    option: RedeemOption,
    displayName: string
  ): Promise<{ taggedNickname: string; truncated: boolean }> {
    const cfg = REDEEM_MAP[option];
    const cost = new Decimal(cfg.rcCost);

    if (option === 'free_ride') {
      const existing = await this.pool.query(
        `SELECT 1 FROM redeem_transactions WHERE user_id = $1 AND redeem_option = 'free_ride'`,
        [userId]
      );
      if ((existing.rowCount ?? 0) > 0) {
        throw new Error('Free ride can only be redeemed once per lifetime');
      }
    }

    const pending = await this.pool.query(
      `SELECT 1 FROM redeem_transactions WHERE user_id = $1 AND redeem_status = 'pending'`,
      [userId]
    );
    if ((pending.rowCount ?? 0) > 0) {
      throw new Error('You already have a pending redemption. Contact staff to clear it first.');
    }

    const txId = await this.economy.removeBalance(userId, cost, `Redeem ${option}`, 'redeem', undefined, { redeemOption: option }, 'redeem');

    const { tagged, truncated } = this.user.buildTaggedNickname(displayName, cfg.tag);
    const taggedNickname = await this.user.setNickname(client, guildId, userId, tagged);

    await this.pool.query(
      `INSERT INTO redeem_transactions
        (user_id, redeem_option, rc_spent, redeem_value_usd, original_nickname, tagged_nickname, transaction_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        option,
        cost.toFixed(2),
        cfg.usdValue,
        displayName.slice(0, 32),
        taggedNickname,
        txId,
      ]
    );

    return { taggedNickname, truncated };
  }

  async clearPendingRedemption(
    client: Client,
    guildId: Snowflake,
    userId: Snowflake,
    adminId: Snowflake
  ): Promise<void> {
    const pending = await this.pool.query<{
      id: string;
      original_nickname: string | null;
    }>(
      `SELECT id, original_nickname FROM redeem_transactions
       WHERE user_id = $1 AND redeem_status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (pending.rowCount === 0) {
      throw new Error('No pending redemption found');
    }

    const row = pending.rows[0];
    if (row.original_nickname) {
      await this.user.setNickname(client, guildId, userId, row.original_nickname);
    }

    await this.pool.query(
      `UPDATE redeem_transactions SET redeem_status = 'claimed', claimed_at = NOW() WHERE id = $1`,
      [row.id]
    );

    await this.economy.recordSystemTransaction(userId, 'Redemption Cleared', { adminId });
    this.logger.info('Redemption cleared', { userId, commandName: 'admin redeem clear' });
  }
}
