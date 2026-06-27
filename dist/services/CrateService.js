"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrateService = void 0;
const decimal_js_1 = __importDefault(require("decimal.js"));
const prisma_1 = require("../lib/prisma");
const wallet_1 = require("../lib/wallet");
const config_1 = require("../config");
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const CURRENCY_TYPES = ['rc', 'route_cash', 'routecash', 'cash', 'coins', 'coin', 'currency', 'money', 'balance'];
function asString(v) {
    return typeof v === 'string' && v.length > 0 ? v : undefined;
}
function coerceRarity(meta, fallback) {
    const r = meta && typeof meta['rarity'] === 'string' ? meta['rarity'].toLowerCase() : '';
    return RARITIES.includes(r) ? r : fallback;
}
function weightedPick(rows) {
    const total = rows.reduce((sum, r) => sum + Math.max(0, r.weight || 0), 0);
    if (total <= 0)
        return rows[Math.floor(Math.random() * rows.length)];
    let roll = Math.random() * total;
    for (const r of rows) {
        roll -= Math.max(0, r.weight || 0);
        if (roll < 0)
            return r;
    }
    return rows[rows.length - 1];
}
function isCurrency(rewardType) {
    const t = rewardType.toLowerCase();
    return CURRENCY_TYPES.some((c) => t.includes(c));
}
function isRole(rewardType) {
    return rewardType.toLowerCase().includes('role');
}
function describeReward(row) {
    const meta = row.reward_metadata ?? {};
    const explicit = asString(meta['description']) ?? asString(meta['label']) ?? asString(meta['name']);
    if (explicit)
        return explicit;
    if (isCurrency(row.reward_type) && row.reward_value) {
        return `${new decimal_js_1.default(row.reward_value).toFixed(0)} Route Cash`;
    }
    if (isRole(row.reward_type)) {
        return asString(meta['role_name']) ? `${meta['role_name']} role` : 'Exclusive role';
    }
    if (row.reward_value)
        return `${row.reward_type} (${row.reward_value})`;
    return row.reward_type;
}
class CrateService {
    async openCrate(userId, type, client, guildId) {
        const cost = config_1.config.crates[type];
        if (cost == null)
            throw new Error('Unknown crate type.');
        const rows = await prisma_1.prisma.$queryRaw `
      SELECT id::text AS id, reward_type, reward_value::text AS reward_value, weight, reward_metadata
      FROM crate_rewards
      WHERE crate_type = ${type}
    `;
        if (rows.length === 0)
            throw new Error('This crate has no rewards configured.');
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
        await prisma_1.prisma.$transaction(async (tx) => {
            await (0, wallet_1.adjustBalance)(tx, userId, new decimal_js_1.default(cost).neg(), 'crate_open', `${type} crate`);
            if (isCurrency(picked.reward_type) && picked.reward_value) {
                await (0, wallet_1.adjustBalance)(tx, userId, new decimal_js_1.default(picked.reward_value), 'crate_reward', `${type} crate reward`);
            }
            else if (!isRole(picked.reward_type)) {
                // Treat anything non-currency / non-role as an inventory item.
                const itemMeta = JSON.stringify({ ...(picked.reward_metadata ?? {}), description, source: `${type}_crate` });
                await tx.$executeRaw `
          INSERT INTO user_inventory (user_id, item_type, item_metadata, quantity)
          VALUES (${userId}::bigint, ${picked.reward_type}, ${itemMeta}::jsonb, 1)
        `;
            }
            await tx.$executeRaw `
        INSERT INTO crate_opens (user_id, crate_type, rc_spent, rewards_received_json, is_jackpot)
        VALUES (${userId}::bigint, ${type}, ${new decimal_js_1.default(cost).toFixed()}::numeric, ${JSON.stringify([rewardLog])}::jsonb, ${isJackpot})
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
                }
                catch {
                    /* role grant is best-effort — reward still recorded */
                }
            }
        }
        return [{ description, rarity }];
    }
    async getAllRewardsSummary() {
        const rows = await prisma_1.prisma.$queryRaw `
      SELECT crate_type, id::text AS id, reward_type, reward_value::text AS reward_value, weight, reward_metadata
      FROM crate_rewards
      ORDER BY crate_type, weight DESC
    `;
        if (rows.length === 0)
            return 'No crate rewards are configured yet.';
        const byCrate = new Map();
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
        const sections = [];
        for (const crate of sorted) {
            const list = byCrate.get(crate);
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
exports.CrateService = CrateService;
