import type { ProviderStats, CustomerStats } from '../../types/ride';
import { prisma } from '../../lib/prisma';

export class StatsService {
  async upsertProviderStats(
    providerId: string,
    delta: Partial<{ completedRides: number; cancelledRides: number; revenue: number; rating: number }>,
  ): Promise<void> {
    const existing = await prisma.providerStats.findUnique({ where: { providerId } });
    if (!existing) {
      await prisma.providerStats.create({
        data: {
          providerId,
          totalRides:     delta.completedRides ?? 0,
          completedRides: delta.completedRides ?? 0,
          cancelledRides: delta.cancelledRides ?? 0,
          totalRevenue:   delta.revenue ?? 0,
          averageRating:  delta.rating ?? 0,
        },
      });
      return;
    }

    const newCompleted = existing.completedRides + (delta.completedRides ?? 0);
    const newCancelled = existing.cancelledRides + (delta.cancelledRides ?? 0);
    const newRevenue   = existing.totalRevenue   + (delta.revenue ?? 0);

    let newAvgRating = existing.averageRating;
    if (delta.rating !== undefined && newCompleted > 0) {
      newAvgRating =
        (existing.averageRating * existing.completedRides + delta.rating) / newCompleted;
    }

    await prisma.providerStats.update({
      where: { providerId },
      data: {
        totalRides:     existing.totalRides + (delta.completedRides ?? 0) + (delta.cancelledRides ?? 0),
        completedRides: newCompleted,
        cancelledRides: newCancelled,
        totalRevenue:   newRevenue,
        averageRating:  newAvgRating,
      },
    });
  }

  async upsertCustomerStats(
    customerId: string,
    delta: Partial<{ totalRequests: number; completedRides: number; cancelledRides: number; spent: number }>,
  ): Promise<void> {
    const existing = await prisma.customerStats.findUnique({ where: { customerId } });
    if (!existing) {
      await prisma.customerStats.create({
        data: {
          customerId,
          totalRequests:  delta.totalRequests ?? 0,
          completedRides: delta.completedRides ?? 0,
          cancelledRides: delta.cancelledRides ?? 0,
          totalSpent:     delta.spent ?? 0,
        },
      });
      return;
    }
    await prisma.customerStats.update({
      where: { customerId },
      data: {
        totalRequests:  existing.totalRequests  + (delta.totalRequests  ?? 0),
        completedRides: existing.completedRides + (delta.completedRides ?? 0),
        cancelledRides: existing.cancelledRides + (delta.cancelledRides ?? 0),
        totalSpent:     existing.totalSpent     + (delta.spent          ?? 0),
      },
    });
  }

  async getProviderStats(providerId: string): Promise<ProviderStats | null> {
    return prisma.providerStats.findUnique({ where: { providerId } });
  }

  async getCustomerStats(customerId: string): Promise<CustomerStats | null> {
    return prisma.customerStats.findUnique({ where: { customerId } });
  }

  async getProviderLeaderboard(): Promise<ProviderStats[]> {
    return prisma.providerStats.findMany({ orderBy: { completedRides: 'desc' }, take: 10 });
  }

  async getCustomerLeaderboard(): Promise<CustomerStats[]> {
    return prisma.customerStats.findMany({ orderBy: { totalRequests: 'desc' }, take: 10 });
  }
}

export const statsService = new StatsService();
