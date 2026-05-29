import { randomInt } from 'crypto';
import { Pool } from 'pg';
import Decimal from 'decimal.js';
import { config } from '../config';
import { EconomyService } from './EconomyService';
import { LoggerService } from './LoggerService';
import { UserService } from './UserService';
import type { CrateType, Snowflake } from '../types';
import { assertPositive } from '../utils/math';

export interface CrateOpenReward {
  reward_type: string;
  reward_value: string | null;
  reward_metadata: Record<string, unknown> | null;
  description: string;
}

export class CrateService {
  constructor(
    private readonly pool: Pool,
    private readonly economy: EconomyService,
    private readonly user: UserService,
    private readonly logger: LoggerService
  ) {}

  getCratePrice(type: CrateType): Decimal {
    switch (type) {
      case 'bronze':
        return new Decimal(config.crates.bronze);
      case 'silver':
        return new Decimal(config.crates.silver);
      case 'gold':
        return new Decimal(config.crates.gold);
      default:
        throw new Error('Invalid crate type');
    }
  }

  async getRewardsForType(crateType: CrateType) {
    const result = await this.pool.query(
      'SELECT * FROM crate_rewards WHERE crate_type = $1 ORDER BY weight DESC',
      [crateType]
    );
    return result.rows;
  }

  async getAllRewardsSummary(): Promise<string> {
    const types: CrateType[] = ['bronze', 'silver', 'gold'];
    const lines: string[] = [];
    for (const type of types) {
      const rewards = await this.getRewardsForType(type);
      const totalWeight = rewards.reduce((s, r) => s + r.weight, 0);
      lines.push(`**${type.toUpperCase()} Crate** (${this.getCratePrice(type)} RC)`);
      for (const r of rewards) {
        const pct = ((r.weight / totalWeight) * 100).toFixed(1);
        const val = r.reward_value ? `${r.reward_value} RC` : r.reward_type;
        lines.push(`- ${r.reward_type}: ${val} (${pct}%)${r.is_jackpot ? ' 🎰' : ''}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  private pickReward(
    rewards: Array<{ reward_type: string; reward_value: string | null; reward_metadata: unknown; weight: number }>
  ) {
    const totalWeight = rewards.reduce((s, r) => s + r.weight, 0);
    let roll = randomInt(0, totalWeight);
    for (const reward of rewards) {
      roll -= reward.weight;
      if (roll < 0) return reward;
    }
    return rewards[rewards.length - 1];
  }

  async openCrate(userId: Snowflake, crateType: CrateType): Promise<CrateOpenReward[]> {
    const price = this.getCratePrice(crateType);
    assertPositive(price);

    const rewards = await this.getRewardsForType(crateType);
    if (rewards.length === 0) {
      throw new Error('No rewards configured for this crate');
    }

    const picked = this.pickReward(rewards);
    const awarded: CrateOpenReward[] = [];

    await this.economy.removeBalance(userId, price, `${crateType} Crate Purchase`, 'crate', undefined, undefined, 'crate_open');

    const description = await this.applyReward(userId, picked, crateType);
    awarded.push({
      reward_type: picked.reward_type,
      reward_value: picked.reward_value,
      reward_metadata: picked.reward_metadata as Record<string, unknown> | null,
      description,
    });

    const txResult = await this.pool.query(
      `INSERT INTO crate_opens (user_id, crate_type, rc_spent, rewards_received_json)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [userId, crateType, price.toFixed(2), JSON.stringify(awarded)]
    );

    this.logger.info('Crate opened', { userId, transactionId: txResult.rows[0].id });
    return awarded;
  }

  private async applyReward(
    userId: Snowflake,
    reward: { reward_type: string; reward_value: string | null; reward_metadata: unknown },
    crateType: CrateType
  ): Promise<string> {
    switch (reward.reward_type) {
      case 'rc_payout': {
        const amount = new Decimal(reward.reward_value ?? 0);
        if (amount.gt(0)) {
          await this.economy.addBalance(userId, amount, `${crateType} Crate RC Reward`, 'crate');
        }
        return `You won **${amount} RC**!`;
      }
      case 'discount_token':
      case 'jackpot_raffle_ticket':
        await this.pool.query(
          `INSERT INTO user_inventory (user_id, item_type, item_metadata, quantity)
           VALUES ($1, $2, $3, $4)`,
          [
            userId,
            reward.reward_type,
            reward.reward_metadata ? JSON.stringify(reward.reward_metadata) : null,
            reward.reward_value ? parseInt(reward.reward_value, 10) : 1,
          ]
        );
        return `You received a **${reward.reward_type.replace(/_/g, ' ')}**!`;
      case 'nothing':
        return 'Better luck next time — nothing this time.';
      default:
        return `You received: ${reward.reward_type}`;
    }
  }
}
