"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityRepository = exports.LotteryRepository = exports.ShopRepository = exports.RedemptionRepository = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
// ── Redemptions ──────────────────────────────────────────────────────────---
class RedemptionRepository {
    create(data, db = prisma_1.prisma) {
        return db.redemption.create({
            data: {
                guildId: data.guildId,
                userId: data.userId,
                rewardKey: data.rewardKey,
                code: data.code ?? null,
                source: data.source,
                costRc: data.costRc != null ? new client_1.Prisma.Decimal(data.costRc) : null,
            },
        });
    }
    findById(id, db = prisma_1.prisma) {
        return db.redemption.findUnique({ where: { id } });
    }
    findByCode(code, db = prisma_1.prisma) {
        return db.redemption.findUnique({ where: { code } });
    }
    findByBookingId(bookingId, db = prisma_1.prisma) {
        return db.redemption.findFirst({ where: { bookingId } });
    }
    listAvailable(guildId, userId, db = prisma_1.prisma) {
        return db.redemption.findMany({
            where: { guildId, userId, status: client_1.RedemptionStatus.ACTIVE },
            orderBy: { createdAt: 'asc' },
            take: 25,
        });
    }
    /** Atomically flip ACTIVE → RESERVED for a booking. */
    async reserve(id, userId, bookingId, db = prisma_1.prisma) {
        const res = await db.redemption.updateMany({
            where: { id, userId, status: client_1.RedemptionStatus.ACTIVE },
            data: { status: client_1.RedemptionStatus.RESERVED, bookingId },
        });
        return res.count > 0;
    }
    /** RESERVED → ACTIVE when a booking is cancelled. */
    async releaseByBooking(bookingId, db = prisma_1.prisma) {
        const res = await db.redemption.updateMany({
            where: { bookingId, status: client_1.RedemptionStatus.RESERVED },
            data: { status: client_1.RedemptionStatus.ACTIVE, bookingId: null },
        });
        return res.count > 0;
    }
    /** RESERVED → REDEEMED when a ride completes. */
    async finalizeByBooking(bookingId, staffId, db = prisma_1.prisma) {
        const res = await db.redemption.updateMany({
            where: { bookingId, status: client_1.RedemptionStatus.RESERVED },
            data: {
                status: client_1.RedemptionStatus.REDEEMED,
                redeemedBy: staffId,
                redeemedAt: new Date(),
            },
        });
        return res.count > 0;
    }
    /** Atomically flip ACTIVE → REDEEMED (staff manual). */
    async markRedeemedById(id, guildId, staffId, db = prisma_1.prisma) {
        const res = await db.redemption.updateMany({
            where: { id, guildId, status: client_1.RedemptionStatus.ACTIVE },
            data: { status: client_1.RedemptionStatus.REDEEMED, redeemedBy: staffId, redeemedAt: new Date() },
        });
        return res.count > 0;
    }
    /** Legacy code redemption. */
    async markRedeemedByCode(code, staffId, db = prisma_1.prisma) {
        const res = await db.redemption.updateMany({
            where: { code, status: client_1.RedemptionStatus.ACTIVE },
            data: { status: client_1.RedemptionStatus.REDEEMED, redeemedBy: staffId, redeemedAt: new Date() },
        });
        return res.count > 0;
    }
    listForUser(guildId, userId, status, db = prisma_1.prisma) {
        return db.redemption.findMany({
            where: { guildId, userId, ...(status ? { status } : {}) },
            orderBy: { createdAt: 'desc' },
            take: 25,
        });
    }
}
exports.RedemptionRepository = RedemptionRepository;
// ── Shop ─────────────────────────────────────────────────────────────────---
class ShopRepository {
    listEnabled(guildId, db = prisma_1.prisma) {
        return db.shopItem.findMany({ where: { guildId, enabled: true }, orderBy: { sortOrder: 'asc' } });
    }
    listAll(guildId, db = prisma_1.prisma) {
        return db.shopItem.findMany({ where: { guildId }, orderBy: { sortOrder: 'asc' } });
    }
    findByKey(guildId, key, db = prisma_1.prisma) {
        return db.shopItem.findUnique({ where: { guildId_key: { guildId, key } } });
    }
    upsert(item, db = prisma_1.prisma) {
        return db.shopItem.upsert({
            where: { guildId_key: { guildId: item.guildId, key: item.key } },
            create: {
                guildId: item.guildId,
                key: item.key,
                label: item.label,
                description: item.description ?? null,
                priceRc: item.priceRc,
                rewardKey: item.rewardKey,
                sortOrder: item.sortOrder ?? 0,
                enabled: item.enabled ?? true,
            },
            update: {
                label: item.label,
                description: item.description ?? null,
                priceRc: item.priceRc,
                rewardKey: item.rewardKey,
                ...(item.sortOrder !== undefined ? { sortOrder: item.sortOrder } : {}),
                ...(item.enabled !== undefined ? { enabled: item.enabled } : {}),
            },
        });
    }
    async toggleEnabled(guildId, key, db = prisma_1.prisma) {
        const item = await this.findByKey(guildId, key, db);
        if (!item)
            return null;
        return db.shopItem.update({ where: { guildId_key: { guildId, key } }, data: { enabled: !item.enabled } });
    }
    async remove(guildId, key, db = prisma_1.prisma) {
        try {
            await db.shopItem.delete({ where: { guildId_key: { guildId, key } } });
            return true;
        }
        catch {
            return false;
        }
    }
    async ensureDefaults(guildId, items, db = prisma_1.prisma) {
        for (const i of items) {
            await db.shopItem.upsert({
                where: { guildId_key: { guildId, key: i.key } },
                create: { guildId, key: i.key, label: i.label, priceRc: i.priceRc, rewardKey: i.rewardKey, sortOrder: i.sortOrder },
                update: {},
            });
        }
    }
}
exports.ShopRepository = ShopRepository;
// ── Lottery ────────────────────────────────────────────────────────────────
class LotteryRepository {
    addTickets(guildId, userId, amount, db = prisma_1.prisma) {
        return db.lotteryTicket
            .upsert({
            where: { guildId_userId: { guildId, userId } },
            create: { guildId, userId, tickets: amount },
            update: { tickets: { increment: amount } },
        })
            .then(() => undefined);
    }
    getTickets(guildId, userId, db = prisma_1.prisma) {
        return db.lotteryTicket
            .findUnique({ where: { guildId_userId: { guildId, userId } } })
            .then((r) => r?.tickets ?? 0);
    }
    async pot(guildId, db = prisma_1.prisma) {
        const agg = await db.lotteryTicket.aggregate({
            where: { guildId, tickets: { gt: 0 } },
            _sum: { tickets: true },
            _count: true,
        });
        return { totalTickets: agg._sum.tickets ?? 0, participants: agg._count };
    }
    entrants(guildId, db = prisma_1.prisma) {
        return db.lotteryTicket.findMany({
            where: { guildId, tickets: { gt: 0 } },
            select: { userId: true, tickets: true },
        });
    }
    lastDraw(guildId, db = prisma_1.prisma) {
        return db.lotteryDraw.findFirst({ where: { guildId }, orderBy: { drawnAt: 'desc' } });
    }
}
exports.LotteryRepository = LotteryRepository;
class ActivityRepository {
    increment(guildId, userId, db = prisma_1.prisma) {
        return db.inviteActivity
            .upsert({
            where: { guildId_userId: { guildId, userId } },
            create: { guildId, userId, messageCount: 1, lastMessageAt: new Date() },
            update: { messageCount: { increment: 1 }, lastMessageAt: new Date() },
        })
            .then(() => undefined);
    }
    getMessageCount(guildId, userId, db = prisma_1.prisma) {
        return db.inviteActivity
            .findUnique({ where: { guildId_userId: { guildId, userId } } })
            .then((r) => r?.messageCount ?? 0);
    }
}
exports.ActivityRepository = ActivityRepository;
