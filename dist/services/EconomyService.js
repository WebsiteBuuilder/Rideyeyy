"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EconomyService = exports.DailyCooldownError = exports.InsufficientFundsError = void 0;
const decimal_js_1 = __importDefault(require("decimal.js"));
const prisma_1 = require("../lib/prisma");
const wallet_1 = require("../lib/wallet");
Object.defineProperty(exports, "InsufficientFundsError", { enumerable: true, get: function () { return wallet_1.InsufficientFundsError; } });
/** Thrown when a daily reward is on cooldown. */
class DailyCooldownError extends Error {
    constructor(nextClaimAt) {
        super('Daily reward already claimed');
        this.name = 'DailyCooldownError';
        this.nextClaimAt = nextClaimAt;
    }
}
exports.DailyCooldownError = DailyCooldownError;
class EconomyService {
    async getBalance(userId) {
        return (0, wallet_1.getBalance)(userId);
    }
    async transferBalance(fromId, toId, amount, reason) {
        if (amount.lte(0))
            throw new Error('Transfer amount must be positive.');
        await prisma_1.prisma.$transaction(async (tx) => {
            // Debit sender first — throws InsufficientFundsError if they can't cover it.
            await (0, wallet_1.adjustBalance)(tx, fromId, amount.neg(), 'transfer_out', reason);
            await (0, wallet_1.adjustBalance)(tx, toId, amount, 'transfer_in', reason);
        });
    }
    async claimDaily(userId, reward, cooldownHours, streakBonus, maxStreak) {
        const cooldownMs = cooldownHours * 60 * 60 * 1000;
        return prisma_1.prisma.$transaction(async (tx) => {
            // daily_claims.user_id is TEXT in this schema (not bigint).
            const rows = await tx.$queryRaw `
        SELECT last_claimed_at, streak FROM daily_claims WHERE user_id = ${userId} FOR UPDATE
      `;
            const now = Date.now();
            const last = rows[0]?.last_claimed_at ? new Date(rows[0].last_claimed_at).getTime() : null;
            if (last !== null && now - last < cooldownMs) {
                throw new DailyCooldownError(new Date(last + cooldownMs));
            }
            // Continue the streak if the previous claim was within two cooldown windows.
            const continuing = last !== null && now - last < cooldownMs * 2;
            const prevStreak = rows[0]?.streak ?? 0;
            const newStreak = continuing ? Math.min(prevStreak + 1, maxStreak) : 1;
            const amount = new decimal_js_1.default(reward).add(new decimal_js_1.default(newStreak - 1).mul(streakBonus));
            await tx.$executeRaw `
        INSERT INTO daily_claims (user_id, last_claimed_at, streak, total_claimed)
        VALUES (${userId}, now(), ${newStreak}, ${amount.toFixed()}::numeric)
        ON CONFLICT (user_id) DO UPDATE
          SET last_claimed_at = now(),
              streak = ${newStreak},
              total_claimed = daily_claims.total_claimed + ${amount.toFixed()}::numeric
      `;
            await (0, wallet_1.adjustBalance)(tx, userId, amount, 'daily', `Daily reward (streak ${newStreak})`);
            return { amount, streak: newStreak, nextClaimAt: new Date(now + cooldownMs) };
        });
    }
    async getUserRank(userId) {
        await (0, wallet_1.ensureWallet)(userId);
        const rows = await prisma_1.prisma.$queryRaw `
      SELECT
        (SELECT COUNT(*)::int FROM user_balances b2
           WHERE b2.balance > b1.balance) + 1 AS rank,
        (SELECT COUNT(*)::int FROM user_balances) AS total
      FROM user_balances b1
      WHERE b1.user_id = ${userId}::bigint
    `;
        return { rank: rows[0]?.rank ?? 1, total: rows[0]?.total ?? 1 };
    }
    async getTransactions(userId, limit) {
        const rows = await prisma_1.prisma.$queryRaw `
      SELECT id::text AS id, user_id::text AS user_id, amount::text AS amount,
             type, reason, created_at
      FROM transactions
      WHERE user_id = ${userId}::bigint
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
        return rows;
    }
    async getLeaderboard(limit) {
        return prisma_1.prisma.$queryRaw `
      SELECT user_id::text AS user_id, balance::text AS balance
      FROM user_balances
      ORDER BY balance DESC
      LIMIT ${limit}
    `;
    }
    async getValidInviteCount(userId) {
        // Single source of truth: the bot's own invite system. Counts invites that
        // passed verification (verified or rewarded) across all tracked guilds.
        return prisma_1.prisma.inviteJoin.count({
            where: {
                inviterUserId: userId,
                status: { in: ['VERIFIED', 'REWARDED'] },
            },
        });
    }
}
exports.EconomyService = EconomyService;
