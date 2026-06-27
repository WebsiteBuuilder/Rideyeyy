"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InviteStatisticsService = void 0;
const client_1 = require("@prisma/client");
const decimal_js_1 = __importDefault(require("decimal.js"));
const prisma_1 = require("../../lib/prisma");
// ═══════════════════════════════════════════════════════════════════════════
//  InviteStatisticsService — owns the InviteUserStats aggregate (always
//  recomputable from source rows) and produces guild-level analytics.
// ═══════════════════════════════════════════════════════════════════════════
const DAY_MS = 24 * 60 * 60 * 1000;
class InviteStatisticsService {
    /** Recompute the truth-based fields of a user's aggregate from source rows. */
    async recomputeUserStats(guildId, userId) {
        const [verified, fake, pending, lifetime, rewardAgg, milestonesCompleted, lastVerified] = await Promise.all([
            prisma_1.prisma.inviteJoin.count({
                where: { guildId, inviterUserId: userId, status: { in: [client_1.InviteStatus.VERIFIED, client_1.InviteStatus.REWARDED] } },
            }),
            prisma_1.prisma.inviteJoin.count({ where: { guildId, inviterUserId: userId, status: client_1.InviteStatus.FAKE } }),
            prisma_1.prisma.inviteJoin.count({ where: { guildId, inviterUserId: userId, status: client_1.InviteStatus.PENDING } }),
            prisma_1.prisma.inviteJoin.count({ where: { guildId, inviterUserId: userId } }),
            prisma_1.prisma.inviteReward.aggregate({ where: { guildId, inviterUserId: userId }, _sum: { amount: true } }),
            prisma_1.prisma.inviteMilestoneAward.count({ where: { guildId, userId } }),
            prisma_1.prisma.inviteJoin.findFirst({
                where: { guildId, inviterUserId: userId, status: { in: [client_1.InviteStatus.VERIFIED, client_1.InviteStatus.REWARDED] } },
                orderBy: { verifiedAt: 'desc' },
                select: { verifiedAt: true },
            }),
        ]);
        const rcEarned = rewardAgg._sum.amount ?? new client_1.Prisma.Decimal(0);
        await prisma_1.prisma.inviteUserStats.upsert({
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
    async registerVerifiedInvite(guildId, userId) {
        const existing = await prisma_1.prisma.inviteUserStats.findUnique({
            where: { guildId_userId: { guildId, userId } },
            select: { lastInviteAt: true, streak: true },
        });
        const within2Days = existing?.lastInviteAt != null && Date.now() - existing.lastInviteAt.getTime() <= 2 * DAY_MS;
        const streak = within2Days ? (existing?.streak ?? 0) + 1 : 1;
        await prisma_1.prisma.inviteUserStats.upsert({
            where: { guildId_userId: { guildId, userId } },
            create: { guildId, userId, weeklyCount: 1, monthlyCount: 1, streak },
            update: { weeklyCount: { increment: 1 }, monthlyCount: { increment: 1 }, streak },
        });
    }
    async getGuildStats(guildId) {
        const now = Date.now();
        const [totalJoins, verified, fake, pending, rewardsPaid, rcAgg, topStats, topCodes, daily, weekly, monthly, rewardedJoins] = await Promise.all([
            prisma_1.prisma.inviteJoin.count({ where: { guildId } }),
            prisma_1.prisma.inviteJoin.count({ where: { guildId, status: { in: [client_1.InviteStatus.VERIFIED, client_1.InviteStatus.REWARDED] } } }),
            prisma_1.prisma.inviteJoin.count({ where: { guildId, status: client_1.InviteStatus.FAKE } }),
            prisma_1.prisma.inviteJoin.count({ where: { guildId, status: client_1.InviteStatus.PENDING } }),
            prisma_1.prisma.inviteReward.count({ where: { guildId } }),
            prisma_1.prisma.inviteReward.aggregate({ where: { guildId }, _sum: { amount: true } }),
            prisma_1.prisma.inviteUserStats.findMany({
                where: { guildId },
                orderBy: [{ verified: 'desc' }, { rcEarned: 'desc' }],
                take: 5,
                select: { userId: true, verified: true, rcEarned: true },
            }),
            prisma_1.prisma.inviteCode.findMany({
                where: { guildId },
                orderBy: { uses: 'desc' },
                take: 5,
                select: { code: true, uses: true, inviterId: true },
            }),
            prisma_1.prisma.inviteJoin.count({ where: { guildId, joinedAt: { gte: new Date(now - DAY_MS) } } }),
            prisma_1.prisma.inviteJoin.count({ where: { guildId, joinedAt: { gte: new Date(now - 7 * DAY_MS) } } }),
            prisma_1.prisma.inviteJoin.count({ where: { guildId, joinedAt: { gte: new Date(now - 30 * DAY_MS) } } }),
            prisma_1.prisma.inviteJoin.findMany({
                where: { guildId, status: client_1.InviteStatus.REWARDED, verifiedAt: { not: null } },
                select: { joinedAt: true, verifiedAt: true },
                take: 500,
                orderBy: { verifiedAt: 'desc' },
            }),
        ]);
        let avgVerificationMinutes = null;
        if (rewardedJoins.length > 0) {
            const totalMs = rewardedJoins.reduce((sum, j) => sum + (j.verifiedAt.getTime() - j.joinedAt.getTime()), 0);
            avgVerificationMinutes = Math.round(totalMs / rewardedJoins.length / 60000);
        }
        return {
            totalJoins,
            verified,
            fake,
            pending,
            rewardsPaid,
            rcDistributed: (rcAgg._sum.amount ?? new client_1.Prisma.Decimal(0)).toString(),
            avgVerificationMinutes,
            dailyGrowth: daily,
            weeklyGrowth: weekly,
            monthlyGrowth: monthly,
            topInviters: topStats.map((s) => ({ userId: s.userId, verified: s.verified, rcEarned: s.rcEarned.toString() })),
            topCodes,
        };
    }
    toDecimal(value) {
        return new decimal_js_1.default(value);
    }
}
exports.InviteStatisticsService = InviteStatisticsService;
