import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import type { IProviderStatsService, ProviderStatsRow } from '../types';

function toRow(stats: {
  discordId: string;
  claims: number;
  completed: number;
  cancelled: number;
  avgRating: { toString(): string };
  revenue: { toString(): string };
}): ProviderStatsRow {
  return {
    discordId: stats.discordId,
    claims: stats.claims,
    completed: stats.completed,
    cancelled: stats.cancelled,
    avgRating: new Decimal(stats.avgRating.toString()),
    revenue: new Decimal(stats.revenue.toString()),
  };
}

async function ensureUser(discordId: string): Promise<void> {
  await prisma.user.upsert({ where: { discordId }, create: { discordId }, update: {} });
}

export class ProviderStatsService implements IProviderStatsService {
  async ensureStats(discordId: string): Promise<void> {
    await ensureUser(discordId);
    await prisma.providerStats.upsert({ where: { discordId }, create: { discordId }, update: {} });
  }

  async incrementClaims(discordId: string): Promise<void> {
    await this.ensureStats(discordId);
    await prisma.providerStats.update({ where: { discordId }, data: { claims: { increment: 1 } } });
  }

  async incrementCompleted(discordId: string, revenue: Decimal): Promise<void> {
    await this.ensureStats(discordId);
    await prisma.providerStats.update({
      where: { discordId },
      data: { completed: { increment: 1 }, revenue: { increment: revenue.toFixed(2) } },
    });
  }

  async incrementCancelled(discordId: string): Promise<void> {
    await this.ensureStats(discordId);
    await prisma.providerStats.update({ where: { discordId }, data: { cancelled: { increment: 1 } } });
  }

  async recalculateAvgRating(providerId: string): Promise<void> {
    const ratings = await prisma.booking.findMany({
      where: { providerId, status: 'COMPLETED', rating: { not: null } },
      select: { rating: true },
    });
    if (ratings.length === 0) return;
    const avg = (ratings.reduce((a, r) => a + (r.rating ?? 0), 0) / ratings.length).toFixed(2);
    await this.ensureStats(providerId);
    await prisma.providerStats.update({ where: { discordId: providerId }, data: { avgRating: avg } });
  }

  async getProviderStats(discordId: string): Promise<ProviderStatsRow> {
    await this.ensureStats(discordId);
    return toRow(await prisma.providerStats.findUniqueOrThrow({ where: { discordId } }));
  }

  async getTopProvidersByCompletedJobs(limit: number): Promise<ProviderStatsRow[]> {
    return (
      await prisma.providerStats.findMany({
        orderBy: { completed: 'desc' },
        take: limit,
        where: { completed: { gt: 0 } },
      })
    ).map(toRow);
  }

  async getTopProvidersByRevenue(limit: number): Promise<ProviderStatsRow[]> {
    return (
      await prisma.providerStats.findMany({
        orderBy: { revenue: 'desc' },
        take: limit,
        where: { revenue: { gt: 0 } },
      })
    ).map(toRow);
  }

  async getTopProvidersByAverageRating(limit: number, minCompleted = 3): Promise<ProviderStatsRow[]> {
    return (
      await prisma.providerStats.findMany({
        where: { completed: { gte: minCompleted }, avgRating: { gt: 0 } },
        orderBy: { avgRating: 'desc' },
        take: limit,
      })
    ).map(toRow);
  }
}
