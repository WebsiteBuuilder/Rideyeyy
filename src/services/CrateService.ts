import Decimal from 'decimal.js';
import type { Client } from 'discord.js';
import { prisma } from '../lib/prisma';
import { adjustBalance } from '../lib/wallet';
import { config } from '../config';
import type { ICrateService, CrateType, CrateReward } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
//  CRATE SERVICE — weighted drops from the existing crate_rewards table,
//  paid for from user_balances and logged to crate_opens.
// ═══════════════════════════════════════════════════════════════════════════

interface CrateRewardRow {
  id: string;
  reward_type: string;
  reward_value: string | null;
  weight: number;
  reward_metadata: Record<string, unknown> | null;
}

type Rarity = CrateReward['rarity'];
const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const CURRENCY_TYPES = ['rc', 'route_cash', 'routecash', 'cash', 'coins', 'coin', 'currency', 'money', 'balance'];

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function coerceRarity(meta: Record<string, unknown> | null, fallback: Rarity): Rarity {
  const r = meta && typeof meta['rarity'] === 'string' ? (meta['rarity'] as string).toLowerCase() : '';
  return (RARITIES as string[]).includes(r) ? (r as Rarity) : fallback;
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

function isCurrency(rewardType: string): boolean {
  const t = rewardType.toLowerCase();
  return CURRENCY_TYPES.some((c) => t.includes(c));
}

function isRole(rewardType: string): boolean {
  return rewardType.toLowerCase().includes('role');
}

function describeReward(row: CrateRewardRow): string {
  const meta = row.reward_metadata ?? {};
  const explicit = asString(meta['description']) ?? asString(meta['label']) ?? asString(meta['name']);
  if (explicit) return explicit;

  if (isCurrency(row.reward_type) && row.reward_value) {
    return `${new Decimal(row.reward_value).toFixed(0)} Route Cash`;
  }
  if (isRole(row.reward_type)) {
    return asString(meta['role_name']) ? `${meta['role_name']} role` : 'Exclusive role';
  }
  if (row.reward_value) return `${row.reward_type} (${row.reward_value})`;
  return row.reward_type;
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
    const rarity = coerceRarity(picked.reward_metadata, isRole(picked.reward_type) ? 'rare' : 'common');
    const description = describeReward(picked);
    const isJackpot = rarity === 'epic' || rarity === 'legendary';

    const rewardLog = {
      reward_id: picked.id,
      reward_type: picked.reward_type,
      reward_value: picked.reward_value,
      description,
      rarity,
    };

    // Money + logging happen atomically; the role grant (Discord API) is best-effort.
    await prisma.$transaction(async (tx) => {
      await adjustBalance(tx, userId, new Decimal(cost).neg(), 'crate_open', `${type} crate`);

      if (isCurrency(picked.reward_type) && picked.reward_value) {
        await adjustBalance(tx, userId, new Decimal(picked.reward_value), 'crate_reward', `${type} crate reward`);
      } else if (!isRole(picked.reward_type)) {
        // Treat anything non-currency / non-role as an inventory item.
        const itemMeta = JSON.stringify({ ...(picked.reward_metadata ?? {}), description, source: `${type}_crate` });
        await tx.$executeRaw`
          INSERT INTO user_inventory (user_id, item_type, item_metadata, quantity)
          VALUES (${userId}::bigint, ${picked.reward_type}, ${itemMeta}::jsonb, 1)
        `;
      }

      await tx.$executeRaw`
        INSERT INTO crate_opens (user_id, crate_type, rc_spent, rewards_received_json, is_jackpot)
        VALUES (${userId}::bigint, ${type}, ${new Decimal(cost).toFixed()}::numeric, ${JSON.stringify([rewardLog])}::jsonb, ${isJackpot})
      `;
    });

    // Best-effort Discord role grant for role rewards.
    if (isRole(picked.reward_type)) {
      const roleId = asString((picked.reward_metadata ?? {})['role_id']);
      if (roleId) {
        try {
          const guild = await client.guilds.fetch(guildId);
          const member = await guild.members.fetch(userId);
          await member.roles.add(roleId);
        } catch {
          /* role grant is best-effort — reward still recorded */
        }
      }
    }

    return [{ description, rarity }];
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
        return `> ${describeReward(r)} — \`${chance}%\``;
      });
      sections.push(`### ${crate.toUpperCase()}\n${lines.join('\n')}`);
    }
    return sections.join('\n\n');
  }
}
