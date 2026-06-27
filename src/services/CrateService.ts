import Decimal from 'decimal.js';
import type { Client } from 'discord.js';
import { prisma } from '../lib/prisma';
import { adjustBalance } from '../lib/wallet';
import { config } from '../config';
import type { ICrateService, CrateType, CrateReward } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
//  CRATE SERVICE — weighted drops from the existing crate_rewards table,
//  paid for from user_balances and logged to crate_opens.
//
//  Real reward_type values (from production data):
//    rc_payout              → credit reward_value Route Cash
//    nothing                → no reward
//    discount_token         → inventory item (meta.discountAmount)
//    jackpot_raffle_ticket  → inventory item, quantity = reward_value
//    cosmetic_role          → grant Discord role (meta.roleId), best-effort
// ═══════════════════════════════════════════════════════════════════════════

interface CrateRewardRow {
  id: string;
  reward_type: string;
  reward_value: string | null;
  weight: number;
  reward_metadata: Record<string, unknown> | null;
}

type Rarity = CrateReward['rarity'];

type ResolvedReward = {
  kind: 'currency' | 'item' | 'role' | 'nothing';
  description: string;
  rarity: Rarity;
  /** RC amount for currency rewards. */
  currency?: Decimal;
  /** item rows for inventory rewards. */
  itemType?: string;
  itemQuantity?: number;
  /** role id for role rewards. */
  roleId?: string;
};

function metaStr(meta: Record<string, unknown> | null, key: string): string | undefined {
  const v = meta?.[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function rcRarity(value: Decimal): Rarity {
  if (value.lte(100)) return 'common';
  if (value.lte(300)) return 'uncommon';
  if (value.lte(1000)) return 'rare';
  if (value.lte(3000)) return 'epic';
  return 'legendary';
}

function resolveReward(row: CrateRewardRow): ResolvedReward {
  const type = row.reward_type.toLowerCase();
  const meta = row.reward_metadata;
  const value = row.reward_value != null ? new Decimal(row.reward_value) : null;

  if (type === 'nothing') {
    return { kind: 'nothing', description: 'Nothing this time — better luck next crate', rarity: 'common' };
  }

  if (type === 'rc_payout' || type.includes('rc') || type.includes('payout') || type.includes('cash')) {
    const amount = value ?? new Decimal(0);
    return {
      kind: 'currency',
      currency: amount,
      description: `${amount.toFixed(0)} Route Cash`,
      rarity: rcRarity(amount),
    };
  }

  if (type.includes('role')) {
    const roleId = metaStr(meta, 'roleId') ?? metaStr(meta, 'role_id');
    return {
      kind: 'role',
      roleId,
      itemType: row.reward_type,
      itemQuantity: 1,
      description: metaStr(meta, 'roleName') ?? metaStr(meta, 'role_name') ?? 'Cosmetic role',
      rarity: 'legendary',
    };
  }

  if (type.includes('discount')) {
    const amt = metaStr(meta, 'discountAmount');
    return {
      kind: 'item',
      itemType: row.reward_type,
      itemQuantity: 1,
      description: amt ? `$${amt} discount token` : 'Discount token',
      rarity: 'uncommon',
    };
  }

  if (type.includes('raffle') || type.includes('ticket')) {
    const qty = value ? Math.max(1, Math.round(value.toNumber())) : 1;
    return {
      kind: 'item',
      itemType: row.reward_type,
      itemQuantity: qty,
      description: `${qty}× jackpot raffle ticket`,
      rarity: 'epic',
    };
  }

  // Generic fallback: treat as an inventory item.
  const qty = value ? Math.max(1, Math.round(value.toNumber())) : 1;
  return {
    kind: 'item',
    itemType: row.reward_type,
    itemQuantity: qty,
    description: metaStr(meta, 'description') ?? metaStr(meta, 'label') ?? row.reward_type.replace(/_/g, ' '),
    rarity: 'uncommon',
  };
}

function weightedPick(rows: CrateRewardRow[]): CrateRewardRow {
  const total = rows.reduce((sum, r) => sum + Math.max(0, r.weight || 0), 0);
  if (total <= 0) return rows[Math.floor(Math.random() * rows.length)]!;
  let roll = Math.random() * total;
  for (const r of rows) {
    roll -= Math.max(0, r.weight || 0);
    if (roll < 0) return r;
  }
  return rows[rows.length - 1]!;
}

function isValidSnowflake(id: string | undefined): id is string {
  return typeof id === 'string' && /^\d{16,20}$/.test(id) && id !== '0';
}

export class CrateService implements ICrateService {
  async openCrate(
    userId: string,
    type: CrateType,
    client: Client,
    guildId: string
  ): Promise<CrateReward[]> {
    const cost = (config.crates as Record<string, number>)[type];
    if (cost == null) throw new Error('Unknown crate type.');

    const rows = await prisma.$queryRaw<CrateRewardRow[]>`
      SELECT id::text AS id, reward_type, reward_value::text AS reward_value, weight, reward_metadata
      FROM crate_rewards
      WHERE crate_type = ${type}
    `;
    if (rows.length === 0) throw new Error('This crate has no rewards configured.');

    const picked = weightedPick(rows);
    const reward = resolveReward(picked);
    const isJackpot = reward.rarity === 'epic' || reward.rarity === 'legendary';

    const rewardLog = {
      reward_id: picked.id,
      reward_type: picked.reward_type,
      reward_value: picked.reward_value,
      description: reward.description,
      rarity: reward.rarity,
      is_jackpot: isJackpot,
    };

    // Money + logging happen atomically; the role grant (Discord API) is best-effort.
    await prisma.$transaction(async (tx) => {
      await adjustBalance(tx, userId, new Decimal(cost).neg(), 'crate_open', `${type} crate`);

      if (reward.kind === 'currency' && reward.currency && reward.currency.gt(0)) {
        await adjustBalance(tx, userId, reward.currency, 'crate_reward', `${type} crate: ${reward.description}`);
      } else if (reward.kind === 'item' || reward.kind === 'role') {
        const itemMeta = JSON.stringify({
          ...(picked.reward_metadata ?? {}),
          description: reward.description,
          source: `${type}_crate`,
        });
        await tx.$executeRaw`
          INSERT INTO user_inventory (user_id, item_type, item_metadata, quantity)
          VALUES (${userId}::bigint, ${reward.itemType ?? picked.reward_type}, ${itemMeta}::jsonb, ${reward.itemQuantity ?? 1})
        `;
      }

      await tx.$executeRaw`
        INSERT INTO crate_opens (user_id, crate_type, rc_spent, rewards_received_json)
        VALUES (${userId}::bigint, ${type}, ${new Decimal(cost).toFixed()}::numeric, ${JSON.stringify([rewardLog])}::jsonb)
      `;
    });

    // Best-effort Discord role grant for role rewards with a real role id.
    if (reward.kind === 'role' && isValidSnowflake(reward.roleId)) {
      try {
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        await member.roles.add(reward.roleId);
      } catch {
        /* role grant is best-effort — reward still recorded */
      }
    }

    return [{ description: reward.description, rarity: reward.rarity }];
  }

  async getAllRewardsSummary(): Promise<string> {
    const rows = await prisma.$queryRaw<(CrateRewardRow & { crate_type: string })[]>`
      SELECT crate_type, id::text AS id, reward_type, reward_value::text AS reward_value, weight, reward_metadata
      FROM crate_rewards
      ORDER BY crate_type, weight DESC
    `;
    if (rows.length === 0) return 'No crate rewards are configured yet.';

    const byCrate = new Map<string, (CrateRewardRow & { crate_type: string })[]>();
    for (const r of rows) {
      const list = byCrate.get(r.crate_type) ?? [];
      list.push(r);
      byCrate.set(r.crate_type, list);
    }

    const order = ['bronze', 'silver', 'gold'];
    const sorted = [...byCrate.keys()].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    const sections: string[] = [];
    for (const crate of sorted) {
      const list = byCrate.get(crate)!;
      const total = list.reduce((s, r) => s + Math.max(0, r.weight || 0), 0) || 1;
      const lines = list.map((r) => {
        const chance = ((Math.max(0, r.weight || 0) / total) * 100).toFixed(1);
        return `> ${resolveReward(r).description} — \`${chance}%\``;
      });
      sections.push(`### ${crate.toUpperCase()}\n${lines.join('\n')}`);
    }
    return sections.join('\n\n');
  }
}
