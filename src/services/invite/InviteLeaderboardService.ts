import { prisma } from '../../lib/prisma';

// ═══════════════════════════════════════════════════════════════════════════
//  InviteLeaderboardService — paginated invite rankings from InviteUserStats.
//  Distinct from the RouteCash balance leaderboard.
// ═══════════════════════════════════════════════════════════════════════════

export type LeaderboardWindow = 'all' | 'weekly' | 'monthly';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  verified: number;
  count: number;
  rcEarned: string;
}

export interface LeaderboardPage {
  entries: LeaderboardEntry[];
  page: number;
  totalPages: number;
  totalUsers: number;
}

export class InviteLeaderboardService {
  async getPage(
    guildId: string,
    page: number,
    pageSize = 10,
    window: LeaderboardWindow = 'all'
  ): Promise<LeaderboardPage> {
    const orderField = window === 'weekly' ? 'weeklyCount' : window === 'monthly' ? 'monthlyCount' : 'verified';

    const where = { guildId, [orderField]: { gt: 0 } } as const;
    const totalUsers = await prisma.inviteUserStats.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);

    const rows = await prisma.inviteUserStats.findMany({
      where,
      orderBy: [{ [orderField]: 'desc' }, { rcEarned: 'desc' }],
      skip: (safePage - 1) * pageSize,
      take: pageSize,
      select: { userId: true, verified: true, weeklyCount: true, monthlyCount: true, rcEarned: true },
    });

    const entries: LeaderboardEntry[] = rows.map((r, i) => ({
      rank: (safePage - 1) * pageSize + i + 1,
      userId: r.userId,
      verified: r.verified,
      count: window === 'weekly' ? r.weeklyCount : window === 'monthly' ? r.monthlyCount : r.verified,
      rcEarned: r.rcEarned.toString(),
    }));

    return { entries, page: safePage, totalPages, totalUsers };
  }

  async getUserRank(guildId: string, userId: string): Promise<{ rank: number; total: number }> {
    const stats = await prisma.inviteUserStats.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: { verified: true },
    });
    const total = await prisma.inviteUserStats.count({ where: { guildId, verified: { gt: 0 } } });
    if (!stats || stats.verified <= 0) return { rank: 0, total };
    const ahead = await prisma.inviteUserStats.count({
      where: { guildId, verified: { gt: stats.verified } },
    });
    return { rank: ahead + 1, total };
  }
}
