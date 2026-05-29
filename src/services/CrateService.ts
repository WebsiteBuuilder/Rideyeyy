import { randomInt } from 'crypto';
import type { Client } from 'discord.js';
import { Pool, PoolClient } from 'pg';
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

interface PickedReward {
  reward_type: string;
  reward_value: string | null;
  reward_metadata: unknown;
  weight: number;
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

  private pickReward(rewards: PickedReward[]): PickedReward {
    const totalWeight = rewards.reduce((s, r) => s + r.weight, 0);
    let roll = randomInt(0, totalWeight);
    for (const reward of rewards) {
      roll -= reward.weight;
      if (roll < 0) return reward;
    }
    return rewards[rewards.length - 1];
  }

  async openCrate(
    userId: Snowflake,
    crateType: CrateType,
    client: Client,
    guildId: Snowflake
  ): Promise<CrateOpenReward[]> {
    const price = this.getCratePrice(crateType);
    assertPositive(price);

    const rewards = await this.getRewardsForType(crateType);
    if (rewards.length === 0) {
      throw new Error('No rewards configured for this crate');
    }

    const picked = this.pickReward(rewards);
    const rcReward =
      picked.reward_type === 'rc_payout' ? new Decimal(picked.reward_value ?? 0) : new Decimal(0);

    const description = this.describeReward(picked, rcReward, crateType);
    const awarded: CrateOpenReward[] = [
      {
        reward_type: picked.reward_type,
        reward_value: picked.reward_value,
        reward_metadata: picked.reward_metadata as Record<string, unknown> | null,
        description,
      },
    ];

    const cosmeticRoleId = await this.economy.runInTransaction(async (dbClient) => {
      const { purchaseTxId } = await this.economy.executeCratePurchaseOnClient(
        dbClient,
        userId,
        price,
        rcReward,
        crateType
      );

      await this.insertRewardInventory(dbClient, userId, picked, rcReward.gt(0));

      await dbClient.query(
        `INSERT INTO crate_opens (user_id, crate_type, rc_spent, rewards_received_json, transaction_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, crateType, price.toFixed(2), JSON.stringify(awarded), purchaseTxId]
      );

      if (picked.reward_type === 'cosmetic_role') {
        const meta = (picked.reward_metadata ?? {}) as { roleId?: string };
        return meta.roleId && meta.roleId !== '0' ? meta.roleId : null;
      }
      return null;
    });

    if (cosmeticRoleId) {
      await this.user.addRole(client, guildId, userId, cosmeticRoleId);
    }

    this.logger.info('Crate opened', { userId });
    return awarded;
  }

  private describeReward(
    reward: PickedReward,
    rcAmount: Decimal,
    crateType: CrateType
  ): string {
    switch (reward.reward_type) {
      case 'rc_payout':
        return `You won **${rcAmount} RC**!`;
      case 'discount_token':
      case 'jackpot_raffle_ticket':
        return `You received a **${reward.reward_type.replace(/_/g, ' ')}**!`;
      case 'cosmetic_role': {
        const meta = (reward.reward_metadata ?? {}) as { roleId?: string };
        return meta.roleId && meta.roleId !== '0'
          ? 'You unlocked a **cosmetic role**!'
          : 'You won a cosmetic reward (configure role ID in crate rewards).';
      }
      case 'nothing':
        return 'Better luck next time — nothing this time.';
      default:
        return `You received: ${reward.reward_type}`;
    }
  }

  private async insertRewardInventory(
    client: PoolClient,
    userId: Snowflake,
    reward: PickedReward,
    rcAlreadyPaid: boolean
  ): Promise<void> {
    switch (reward.reward_type) {
      case 'rc_payout':
        if (new Decimal(reward.reward_value ?? 0).gt(0) && !rcAlreadyPaid) {
          throw new Error('RC payout must be settled in executeCratePurchaseOnClient');
        }
        return;
      case 'discount_token':
      case 'jackpot_raffle_ticket': {
        await client.query(
          `INSERT INTO user_inventory (user_id, item_type, item_metadata, quantity)
           VALUES ($1, $2, $3, $4)`,
          [
            userId,
            reward.reward_type,
            reward.reward_metadata ? JSON.stringify(reward.reward_metadata) : null,
            reward.reward_value ? parseInt(reward.reward_value, 10) : 1,
          ]
        );
        return;
      }
      case 'cosmetic_role': {
        const meta = (reward.reward_metadata ?? {}) as { roleId?: string; temporary?: boolean };
        const inv = await client.query<{ id: string }>(
          `INSERT INTO user_inventory (user_id, item_type, item_metadata, quantity)
           VALUES ($1, $2, $3, 1) RETURNING id`,
          [userId, 'cosmetic_role', JSON.stringify(meta)]
        );
        const roleId = meta.roleId;
        if (roleId && roleId !== '0') {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + config.cosmeticRoles.durationDays);
          await client.query(
            `INSERT INTO role_grants (user_id, role_id, expires_at, source, inventory_id)
             VALUES ($1, $2, $3, 'crate', $4)`,
            [userId, roleId, expiresAt.toISOString(), inv.rows[0].id]
          );
        }
        return;
      }
      default:
        return;
    }
  }
}
