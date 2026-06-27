"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InviteLeaderboardService = void 0;
const prisma_1 = require("../../lib/prisma");
class InviteLeaderboardService {
    async getPage(guildId, page, pageSize = 10, window = 'all') {
        const orderField = window === 'weekly' ? 'weeklyCount' : window === 'monthly' ? 'monthlyCount' : 'verified';
        const where = { guildId, [orderField]: { gt: 0 } };
        const totalUsers = await prisma_1.prisma.inviteUserStats.count({ where });
        const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
        const safePage = Math.min(Math.max(1, page), totalPages);
        const rows = await prisma_1.prisma.inviteUserStats.findMany({
            where,
            orderBy: [{ [orderField]: 'desc' }, { rcEarned: 'desc' }],
            skip: (safePage - 1) * pageSize,
            take: pageSize,
            select: { userId: true, verified: true, weeklyCount: true, monthlyCount: true, rcEarned: true },
        });
        const entries = rows.map((r, i) => ({
            rank: (safePage - 1) * pageSize + i + 1,
            userId: r.userId,
            verified: r.verified,
            count: window === 'weekly' ? r.weeklyCount : window === 'monthly' ? r.monthlyCount : r.verified,
            rcEarned: r.rcEarned.toString(),
        }));
        return { entries, page: safePage, totalPages, totalUsers };
    }
    async getUserRank(guildId, userId) {
        const stats = await prisma_1.prisma.inviteUserStats.findUnique({
            where: { guildId_userId: { guildId, userId } },
            select: { verified: true },
        });
        const total = await prisma_1.prisma.inviteUserStats.count({ where: { guildId, verified: { gt: 0 } } });
        if (!stats || stats.verified <= 0)
            return { rank: 0, total };
        const ahead = await prisma_1.prisma.inviteUserStats.count({
            where: { guildId, verified: { gt: stats.verified } },
        });
        return { rank: ahead + 1, total };
    }
}
exports.InviteLeaderboardService = InviteLeaderboardService;
