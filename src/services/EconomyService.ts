import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { InsufficientFundsError, ensureWallet, getBalance, adjustBalance } from '../lib/wallet';
import type { IEconomyService, TransactionRow, LeaderboardRow } from '../types';

// Re-exported so existing imports (gambling) keep resolving.
export { InsufficientFundsError };

/** Thrown when a daily reward is on cooldown. */
export class DailyCooldownError extends Error {
  nextClaimAt: Date;
  constructor(nextClaimAt: Date) {
    super('Daily reward already claimed');
    this.name = 'DailyCooldownError';
    this.nextClaimAt = nextClaimAt;
  }
}

export class EconomyService implements IEconomyService {
  async getBalance(userId: string): Promise<Decimal> {
    return getBalance(userId);
  }

  async transferBalance(
    fromId: string,
    toId: string,
    amount: Decimal,
    reason: string
  ): Promise<void> {
    if (amount.lte(0)) throw new Error('Transfer amount must be positive.');
    await prisma.$transaction(async (tx) => {
      // Debit sender first — throws InsufficientFundsError if they can't cover it.
      await adjustBalance(tx, fromId, amount.neg(), 'transfer_out', reason);
      await adjustBalance(tx, toId, amount, 'transfer_in', reason);
    });
  }

  async claimDaily(
    userId: string,
    reward: number,
    cooldownHours: number,
    streakBonus: number,
    maxStreak: number
  ): Promise<{ amount: Decimal; streak: number; nextClaimAt: Date }> {
    const cooldownMs = cooldownHours * 60 * 60 * 1000;

    return prisma.$transaction(async (tx) => {
      // daily_claims.user_id is TEXT in this schema (not bigint).
      const rows = await tx.$queryRaw<{ last_claimed_at: Date | null; streak: number }[]>`
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
      const amount = new Decimal(reward).add(new Decimal(newStreak - 1).mul(streakBonus));

      await tx.$executeRaw`
        INSERT INTO daily_claims (user_id, last_claimed_at, streak, total_claimed)
        VALUES (${userId}, now(), ${newStreak}, ${amount.toFixed()}::numeric)
        ON CONFLICT (user_id) DO UPDATE
          SET last_claimed_at = now(),
              streak = ${newStreak},
              total_claimed = daily_claims.total_claimed + ${amount.toFixed()}::numeric
      `;

      await adjustBalance(tx, userId, amount, 'daily', `Daily reward (streak ${newStreak})`);

      return { amount, streak: newStreak, nextClaimAt: new Date(now + cooldownMs) };
    });
  }

  async getUserRank(userId: string): Promise<{ rank: number; total: number }> {
    await ensureWallet(userId);
    const rows = await prisma.$queryRaw<{ rank: number; total: number }[]>`
      SELECT
        (SELECT COUNT(*)::int FROM user_balances b2
           WHERE b2.balance > b1.balance) + 1 AS rank,
        (SELECT COUNT(*)::int FROM user_balances) AS total
      FROM user_balances b1
      WHERE b1.user_id = ${userId}::bigint
    `;
    return { rank: rows[0]?.rank ?? 1, total: rows[0]?.total ?? 1 };
  }

  async getTransactions(userId: string, limit: number): Promise<TransactionRow[]> {
    const rows = await prisma.$queryRaw<TransactionRow[]>`
      SELECT id::text AS id, user_id::text AS user_id, amount::text AS amount,
             type, reason, created_at
      FROM transactions
      WHERE user_id = ${userId}::bigint
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows;
  }

  async getLeaderboard(limit: number): Promise<LeaderboardRow[]> {
    return prisma.$queryRaw<LeaderboardRow[]>`
      SELECT user_id::text AS user_id, balance::text AS balance
      FROM user_balances
      ORDER BY balance DESC
      LIMIT ${limit}
    `;
  }

  async getValidInviteCount(userId: string): Promise<number> {
    // Single source of truth: the bot's own invite system. Counts invites that
    // passed verification (verified or rewarded) across all tracked guilds.
    return prisma.inviteJoin.count({
      where: {
        inviterUserId: userId,
        status: { in: ['VERIFIED', 'REWARDED'] },
      },
    });
  }
}
