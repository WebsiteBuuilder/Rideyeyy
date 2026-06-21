import type { RideRequest } from '../../types/ride';
import { prisma } from '../../lib/prisma';
import { generateRideId } from '../../utils/ride/rideId';

export interface CreateRideInput {
  customerId:    string;
  rideType:      string;
  pickup:        string;
  dropoff:       string;
  fare:          number;
  requestedTime: string;
  paymentMethod: string;
}

export class RideService {
  async createRide(input: CreateRideInput): Promise<RideRequest> {
    const rideId = await generateRideId();
    return prisma.rideRequest.create({
      data: {
        rideId,
        customerId:    input.customerId,
        rideType:      input.rideType,
        pickup:        input.pickup,
        dropoff:       input.dropoff,
        fare:          input.fare,
        requestedTime: input.requestedTime,
        paymentMethod: input.paymentMethod,
        status:        'OPEN',
      },
    });
  }

  async claimRide(rideId: string, providerId: string, channelId: string): Promise<RideRequest> {
    return prisma.rideRequest.update({
      where: { rideId },
      data:  { providerId, channelId, status: 'CLAIMED' },
    });
  }

  async updateStatus(rideId: string, status: string): Promise<RideRequest> {
    return prisma.rideRequest.update({ where: { rideId }, data: { status } });
  }

  async setChannelId(rideId: string, channelId: string): Promise<void> {
    await prisma.rideRequest.update({ where: { rideId }, data: { channelId } });
  }

  async setRating(rideId: string, rating: number): Promise<RideRequest> {
    return prisma.rideRequest.update({ where: { rideId }, data: { rating } });
  }

  async getByRideId(rideId: string): Promise<RideRequest | null> {
    return prisma.rideRequest.findUnique({ where: { rideId } });
  }

  async getActiveRidesByCustomer(customerId: string): Promise<RideRequest[]> {
    return prisma.rideRequest.findMany({
      where: {
        customerId,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
    });
  }

  async getAllActive(): Promise<RideRequest[]> {
    return prisma.rideRequest.findMany({
      where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getHistory(limit = 20): Promise<RideRequest[]> {
    return prisma.rideRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getRidesByStatus(): Promise<Record<string, number>> {
    const rows = await prisma.rideRequest.groupBy({
      by: ['status'],
      _count: { status: true },
    });
    const map: Record<string, number> = {};
    for (const r of rows) map[r.status] = r._count.status;
    return map;
  }

  async getTotalRevenue(): Promise<number> {
    const result = await prisma.rideRequest.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { fare: true },
    });
    return result._sum.fare ?? 0;
  }

  async getAverageRating(): Promise<number> {
    const result = await prisma.rideRequest.aggregate({
      where: { rating: { not: null } },
      _avg: { rating: true },
    });
    return result._avg.rating ?? 0;
  }
}

export const rideService = new RideService();
