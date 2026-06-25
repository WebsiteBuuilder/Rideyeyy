"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingService = void 0;
exports.formatBookingNumber = formatBookingNumber;
const prisma_1 = require("../lib/prisma");
const ACTIVE_STATUSES = ['PENDING', 'CLAIMED'];
const drafts = new Map();
function formatBookingNumber(n) {
    return `GR-${String(n).padStart(6, '0')}`;
}
async function ensureUser(discordId) {
    await prisma_1.prisma.user.upsert({
        where: { discordId },
        create: { discordId },
        update: {},
    });
}
async function nextBookingNumber() {
    const seq = await prisma_1.prisma.$transaction(async (tx) => {
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
class BookingService {
    setDraft(userId, draft) {
        drafts.set(userId, draft);
    }
    getDraft(userId) {
        return drafts.get(userId);
    }
    clearDraft(userId) {
        drafts.delete(userId);
    }
    async countActiveBookings(customerId) {
        return prisma_1.prisma.booking.count({
            where: { customerId, status: { in: [...ACTIVE_STATUSES] } },
        });
    }
    async hasDuplicateActiveRoute(customerId, pickup, destination) {
        const existing = await prisma_1.prisma.booking.findFirst({
            where: {
                customerId,
                pickup: pickup.trim(),
                destination: destination.trim(),
                status: { in: [...ACTIVE_STATUSES] },
            },
        });
        return existing !== null;
    }
    async createBooking(input) {
        await ensureUser(input.customerId);
        if (await this.hasDuplicateActiveRoute(input.customerId, input.pickup, input.destination)) {
            throw new Error('DUPLICATE_ROUTE');
        }
        const bookingNumber = await nextBookingNumber();
        const booking = await prisma_1.prisma.booking.create({
            data: {
                bookingNumber,
                customerId: input.customerId,
                serviceType: input.serviceType,
                vehicleType: input.vehicleType ?? null,
                pickup: input.pickup.trim(),
                destination: input.destination.trim(),
                price: input.price.toFixed(2),
                notes: input.notes?.trim() || null,
                status: 'PENDING',
            },
        });
        this.clearDraft(input.customerId);
        console.log(`[Bot] Booking Created: ${booking.bookingNumber} by ${input.customerId}`);
        return booking;
    }
    async getByBookingNumber(bookingNumber) {
        return prisma_1.prisma.booking.findUnique({ where: { bookingNumber } });
    }
    async claimBooking(bookingNumber, providerId) {
        await ensureUser(providerId);
        const result = await prisma_1.prisma.booking.updateMany({
            where: { bookingNumber, status: 'PENDING', providerId: null },
            data: { providerId, status: 'CLAIMED', claimedAt: new Date() },
        });
        if (result.count === 0)
            return null;
        const booking = await prisma_1.prisma.booking.findUnique({ where: { bookingNumber } });
        if (booking)
            console.log(`[Bot] Booking Claimed: ${bookingNumber} by ${providerId}`);
        return booking;
    }
    async completeBooking(bookingNumber, providerId) {
        const result = await prisma_1.prisma.booking.updateMany({
            where: { bookingNumber, providerId, status: 'CLAIMED' },
            data: { status: 'COMPLETED', completedAt: new Date() },
        });
        if (result.count === 0)
            return null;
        const booking = await prisma_1.prisma.booking.findUnique({ where: { bookingNumber } });
        if (booking)
            console.log(`[Bot] Booking Completed: ${bookingNumber} by ${providerId}`);
        return booking;
    }
    async cancelBooking(bookingNumber) {
        const result = await prisma_1.prisma.booking.updateMany({
            where: { bookingNumber, status: { in: ['PENDING', 'CLAIMED'] } },
            data: { status: 'CANCELLED', cancelledAt: new Date() },
        });
        if (result.count === 0)
            return null;
        const booking = await prisma_1.prisma.booking.findUnique({ where: { bookingNumber } });
        if (booking)
            console.log(`[Bot] Booking Cancelled: ${bookingNumber}`);
        return booking;
    }
    async setRating(bookingNumber, rating) {
        const booking = await prisma_1.prisma.booking.findUnique({ where: { bookingNumber } });
        if (!booking || booking.status !== 'COMPLETED' || booking.rating !== null)
            return null;
        const updated = await prisma_1.prisma.booking.update({ where: { bookingNumber }, data: { rating } });
        console.log(`[Bot] Review Submitted: ${bookingNumber} rating=${rating}`);
        return updated;
    }
    async updateTicketRefs(bookingNumber, channelId, messageId) {
        await prisma_1.prisma.booking.update({ where: { bookingNumber }, data: { channelId, messageId } });
    }
}
exports.BookingService = BookingService;
