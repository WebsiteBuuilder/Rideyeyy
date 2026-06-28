import Decimal from 'decimal.js';
import type { Booking } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { BookingDraft, CreateBookingInput, IBookingService } from '../types';
import type { RedemptionService } from './economy/RedemptionService';

const ACTIVE_STATUSES = ['PENDING', 'CLAIMED'] as const;
const drafts = new Map<string, BookingDraft>();

function formatBookingNumber(n: number): string {
  return `GR-${String(n).padStart(6, '0')}`;
}

async function ensureUser(discordId: string): Promise<void> {
  await prisma.user.upsert({
    where: { discordId },
    create: { discordId },
    update: {},
  });
}

async function nextBookingNumber(): Promise<string> {
  const seq = await prisma.$transaction(async (tx) => {
    let row = await tx.bookingSequence.findUnique({ where: { id: 1 } });
    if (!row) {
      row = await tx.bookingSequence.create({ data: { id: 1, lastNumber: 0 } });
    }
    const next = row.lastNumber + 1;
    await tx.bookingSequence.update({ where: { id: 1 }, data: { lastNumber: next } });
    return next;
  });
  return formatBookingNumber(seq);
}

export class BookingService implements IBookingService {
  constructor(private readonly redemption?: RedemptionService) {}
  setDraft(userId: string, draft: BookingDraft): void {
    drafts.set(userId, draft);
  }

  getDraft(userId: string): BookingDraft | undefined {
    return drafts.get(userId);
  }

  clearDraft(userId: string): void {
    drafts.delete(userId);
  }

  async countActiveBookings(customerId: string): Promise<number> {
    return prisma.booking.count({
      where: { customerId, status: { in: [...ACTIVE_STATUSES] } },
    });
  }

  async hasDuplicateActiveRoute(
    customerId: string,
    pickup: string,
    destination: string
  ): Promise<boolean> {
    const existing = await prisma.booking.findFirst({
      where: {
        customerId,
        pickup: pickup.trim(),
        destination: destination.trim(),
        status: { in: [...ACTIVE_STATUSES] },
      },
    });
    return existing !== null;
  }

  async createBooking(input: CreateBookingInput): Promise<Booking> {
    await ensureUser(input.customerId);
    if (await this.hasDuplicateActiveRoute(input.customerId, input.pickup, input.destination)) {
      throw new Error('DUPLICATE_ROUTE');
    }
    const bookingNumber = await nextBookingNumber();

    const booking = await prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          bookingNumber,
          customerId: input.customerId,
          preferredName: input.preferredName.trim(),
          serviceType: input.serviceType,
          vehicleType: input.vehicleType ?? null,
          pickup: input.pickup.trim(),
          destination: input.destination.trim(),
          price: '0.00',
          notes: input.notes?.trim() || null,
          status: 'PENDING',
          redemptionId: input.redemptionId ?? null,
        },
      });

      if (input.redemptionId) {
        if (!this.redemption) throw new Error('REWARD_UNAVAILABLE');
        const reserved = await this.redemption.reserveForBooking(
          input.redemptionId,
          created.id,
          input.customerId,
          tx
        );
        if (!reserved) throw new Error('REWARD_UNAVAILABLE');
      }

      return created;
    });

    this.clearDraft(input.customerId);
    console.log(`[Bot] Booking Created: ${booking.bookingNumber} by ${input.customerId}`);
    return booking;
  }

  async getByBookingNumber(bookingNumber: string): Promise<Booking | null> {
    return prisma.booking.findUnique({ where: { bookingNumber } });
  }

  async claimBooking(bookingNumber: string, providerId: string): Promise<Booking | null> {
    await ensureUser(providerId);
    const result = await prisma.booking.updateMany({
      where: { bookingNumber, status: 'PENDING', providerId: null },
      data: { providerId, status: 'CLAIMED', claimedAt: new Date() },
    });
    if (result.count === 0) return null;
    const booking = await prisma.booking.findUnique({ where: { bookingNumber } });
    if (booking) console.log(`[Bot] Booking Claimed: ${bookingNumber} by ${providerId}`);
    return booking;
  }

  async completeBooking(bookingNumber: string, providerId: string): Promise<Booking | null> {
    const result = await prisma.booking.updateMany({
      where: { bookingNumber, providerId, status: 'CLAIMED' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    if (result.count === 0) return null;
    const booking = await prisma.booking.findUnique({ where: { bookingNumber } });
    if (booking) console.log(`[Bot] Booking Completed: ${bookingNumber} by ${providerId}`);
    return booking;
  }

  async cancelBooking(bookingNumber: string): Promise<Booking | null> {
    const result = await prisma.booking.updateMany({
      where: { bookingNumber, status: { in: ['PENDING', 'CLAIMED'] } },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    if (result.count === 0) return null;
    const booking = await prisma.booking.findUnique({ where: { bookingNumber } });
    if (booking) console.log(`[Bot] Booking Cancelled: ${bookingNumber}`);
    return booking;
  }

  async setRating(bookingNumber: string, rating: number): Promise<Booking | null> {
    const booking = await prisma.booking.findUnique({ where: { bookingNumber } });
    if (!booking || booking.status !== 'COMPLETED' || booking.rating !== null) return null;
    const updated = await prisma.booking.update({ where: { bookingNumber }, data: { rating } });
    console.log(`[Bot] Review Submitted: ${bookingNumber} rating=${rating}`);
    return updated;
  }

  async updateTicketRefs(bookingNumber: string, channelId: string, messageId: string): Promise<void> {
    await prisma.booking.update({ where: { bookingNumber }, data: { channelId, messageId } });
  }
}

export { formatBookingNumber };
