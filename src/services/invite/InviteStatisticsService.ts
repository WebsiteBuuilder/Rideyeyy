import { Prisma, InviteStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../../lib/prisma';

// ═══════════════════════════════════════════════════════════════════════════
//  InviteStatisticsService — owns the InviteUserStats aggregate (always
//  recomputable from source rows) and produces guild-level analytics.
// ═══════════════════════════════════════════════════════════════════════════

const DAY_MS = 24 * 60 * 60 * 1000;

export interface GuildInviteStats {
  totalJoins: number;
  verified: number;
  fake: number;
  pending: number;
  rewardsPaid: number;
  rcDistributed: string;
  avgVerificationMinutes: number | null;
  dailyGrowth: number;
  weeklyGrowth: number;
  monthlyGrowth: number;
  topInviters: { userId: string; verified: number; rcEarned: string }[];
  topCodes: { code: string; uses: number; inviterId: string | null }[];
}

export class InviteStatisticsService {
  /** Recompute the truth-based fields of a user's aggregate from source rows. */
  async recomputeUserStats(guildId: string, userId: string): Promise<void> {
    const [verified, fake, pending, lifetime, rewardAgg, milestonesCompleted, lastVerified] =
      await Promise.all([
        prisma.inviteJoin.count({
          where: { guildId, inviterUserId: userId, status: { in: [InviteStatus.VERIFIED, InviteStatus.REWARDED] } },
        }),
        prisma.inviteJoin.count({ where: { guildId, inviterUserId: userId, status: InviteStatus.FAKE } }),
        prisma.inviteJoin.count({ where: { guildId, inviterUserId: userId, status: InviteStatus.PENDING } }),
        prisma.inviteJoin.count({ where: { guildId, inviterUserId: userId } }),
        prisma.inviteReward.aggregate({ where: { guildId, inviterUserId: userId }, _sum: { amount: true } }),
        prisma.inviteMilestoneAward.count({ where: { guildId, userId } }),
        prisma.inviteJoin.findFirst({
          where: { guildId, inviterUserId: userId, status: { in: [InviteStatus.VERIFIED, InviteStatus.REWARDED] } },
          orderBy: { verifiedAt: 'desc' },
          select: { verifiedAt: true },
        }),
      ]);

    const rcEarned = rewardAgg._sum.amount ?? new Prisma.Decimal(0);

    await prisma.inviteUserStats.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: {
        guildId,
        userId,
        verified,
        fake,
        pending,
        lifetime,
        rcEarned,
        milestonesCompleted,
        lastInviteAt: lastVerified?.verifiedAt ?? null,
      },
      update: {
        verified,
        fake,
        pending,
        lifetime,
        rcEarned,
        milestonesCompleted,
        lastInviteAt: lastVerified?.verifiedAt ?? null,
      },
    });
  }

  /** Maintain rolling counters + streak when an invite becomes verified. */
  async registerVerifiedInvite(guildId: string, userId: string): Promise<void> {
    const existing = await prisma.inviteUserStats.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: { lastInviteAt: true, streak: true },
    });
    const within2Days =
      existing?.lastInviteAt != null && Date.now() - existing.lastInviteAt.getTime() <= 2 * DAY_MS;
    const streak = within2Days ? (existing?.streak ?? 0) + 1 : 1;

    await prisma.inviteUserStats.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId, weeklyCount: 1, monthlyCount: 1, streak },
      update: { weeklyCount: { increment: 1 }, monthlyCount: { increment: 1 }, streak },
    });
  }

  async getGuildStats(guildId: string): Promise<GuildInviteStats> {
    const now = Date.now();
    const [totalJoins, verified, fake, pending, rewardsPaid, rcAgg, topStats, topCodes, daily, weekly, monthly, rewardedJoins] =
      await Promise.all([
        prisma.inviteJoin.count({ where: { guildId } }),
        prisma.inviteJoin.count({ where: { guildId, status: { in: [InviteStatus.VERIFIED, InviteStatus.REWARDED] } } }),
        prisma.inviteJoin.count({ where: { guildId, status: InviteStatus.FAKE } }),
        prisma.inviteJoin.count({ where: { guildId, status: InviteStatus.PENDING } }),
        prisma.inviteReward.count({ where: { guildId } }),
        prisma.inviteReward.aggregate({ where: { guildId }, _sum: { amount: true } }),
        prisma.inviteUserStats.findMany({
          where: { guildId },
          orderBy: [{ verified: 'desc' }, { rcEarned: 'desc' }],
          take: 5,
          select: { userId: true, verified: true, rcEarned: true },
        }),
        prisma.inviteCode.findMany({
          where: { guildId },
          orderBy: { uses: 'desc' },
          take: 5,
          select: { code: true, uses: true, inviterId: true },
        }),
        prisma.inviteJoin.count({ where: { guildId, joinedAt: { gte: new Date(now - DAY_MS) } } }),
        prisma.inviteJoin.count({ where: { guildId, joinedAt: { gte: new Date(now - 7 * DAY_MS) } } }),
        prisma.inviteJoin.count({ where: { guildId, joinedAt: { gte: new Date(now - 30 * DAY_MS) } } }),
        prisma.inviteJoin.findMany({
          where: { guildId, status: InviteStatus.REWARDED, verifiedAt: { not: null } },
          select: { joinedAt: true, verifiedAt: true },
          take: 500,
          orderBy: { verifiedAt: 'desc' },
        }),
      ]);

    let avgVerificationMinutes: number | null = null;
    if (rewardedJoins.length > 0) {
      const totalMs = rewardedJoins.reduce(
        (sum, j) => sum + ((j.verifiedAt as Date).getTime() - j.joinedAt.getTime()),
        0
      );
      avgVerificationMinutes = Math.round(totalMs / rewardedJoins.length / 60000);
    }

    return {
      totalJoins,
      verified,
      fake,
      pending,
      rewardsPaid,
      rcDistributed: (rcAgg._sum.amount ?? new Prisma.Decimal(0)).toString(),
      avgVerificationMinutes,
      dailyGrowth: daily,
      weeklyGrowth: weekly,
      monthlyGrowth: monthly,
      topInviters: topStats.map((s) => ({ userId: s.userId, verified: s.verified, rcEarned: s.rcEarned.toString() })),
      topCodes,
    };
  }

  toDecimal(value: string): Decimal {
    return new Decimal(value);
  }
}
