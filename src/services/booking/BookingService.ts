import { prisma } from '../../lib/prisma';
import { generateBookingId } from '../../utils/booking/bookingId';

interface CreateBookingInput {
  userId: string;
  serviceType: string;
  orderAmount: number;
  address: string;
  deliveryTime: string;
  paymentMethod: string;
}

export class BookingService {
  async createBooking(input: CreateBookingInput): Promise<{ bookingId: string; channelName: string }> {
    try {
      const bookingId = generateBookingId();
      const booking = await prisma.booking.create({
        data: {
          bookingId,
          userId: input.userId,
          serviceType: input.serviceType,
          orderAmount: input.orderAmount,
          address: input.address,
          deliveryTime: input.deliveryTime,
          paymentMethod: input.paymentMethod,
          status: 'OPEN',
        },
      });

      const channelName = `booking-${input.userId.substring(0, 4)}-${bookingId.toLowerCase()}`;
      return { bookingId, channelName };
    } catch (err) {
      console.error('[BookingService] Create error:', err);
      throw new Error('Failed to create booking');
    }
  }

  async getBooking(bookingId: string): Promise<any> {
    try {
      return await prisma.booking.findUnique({ where: { bookingId } });
    } catch (err) {
      console.error('[BookingService] Get error:', err);
      return null;
    }
  }

  async updateStatus(bookingId: string, status: string): Promise<void> {
    try {
      await prisma.booking.update({
        where: { bookingId },
        data: { status, updatedAt: new Date() },
      });
    } catch (err) {
      console.error('[BookingService] Update status error:', err);
    }
  }

  async claimBooking(bookingId: string, providerId: string): Promise<void> {
    try {
      await prisma.booking.update({
        where: { bookingId },
        data: { providerId, status: 'CLAIMED', updatedAt: new Date() },
      });
    } catch (err) {
      console.error('[BookingService] Claim error:', err);
    }
  }

  async setRating(bookingId: string, rating: number): Promise<void> {
    try {
      await prisma.booking.update({
        where: { bookingId },
        data: { rating, updatedAt: new Date() },
      });
    } catch (err) {
      console.error('[BookingService] Rating error:', err);
    }
  }

  async getOpenBookingsForUser(userId: string): Promise<number> {
    try {
      return await prisma.booking.count({
        where: { userId, status: 'OPEN' },
      });
    } catch (err) {
      console.error('[BookingService] Count error:', err);
      return 0;
    }
  }

  async getStats(): Promise<{ open: number; claimed: number; completed: number; cancelled: number }> {
    try {
      const [open, claimed, completed, cancelled] = await Promise.all([
        prisma.booking.count({ where: { status: 'OPEN' } }),
        prisma.booking.count({ where: { status: 'CLAIMED' } }),
        prisma.booking.count({ where: { status: 'COMPLETED' } }),
        prisma.booking.count({ where: { status: 'CANCELLED' } }),
      ]);
      return { open, claimed, completed, cancelled };
    } catch (err) {
      console.error('[BookingService] Stats error:', err);
      return { open: 0, claimed: 0, completed: 0, cancelled: 0 };
    }
  }

  async isBlacklisted(userId: string): Promise<boolean> {
    try {
      const record = await prisma.bookingBlacklist.findUnique({ where: { userId } });
      return !!record;
    } catch (err) {
      console.error('[BookingService] Blacklist check error:', err);
      return false;
    }
  }

  async addBlacklist(userId: string, reason: string): Promise<void> {
    try {
      await prisma.bookingBlacklist.upsert({
        where: { userId },
        update: { reason },
        create: { userId, reason },
      });
    } catch (err) {
      console.error('[BookingService] Add blacklist error:', err);
    }
  }

  async removeBlacklist(userId: string): Promise<void> {
    try {
      await prisma.bookingBlacklist.delete({ where: { userId } });
    } catch (err) {
      console.error('[BookingService] Remove blacklist error:', err);
    }
  }
}
