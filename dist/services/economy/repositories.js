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
                code: data.code,
                source: data.source,
                costRc: data.costRc != null ? new client_1.Prisma.Decimal(data.costRc) : null,
            },
        });
    }
    findByCode(code, db = prisma_1.prisma) {
        return db.redemption.findUnique({ where: { code } });
    }
    /** Atomically flip an ACTIVE code to REDEEMED. Returns false if not active. */
    async markRedeemed(code, staffId, db = prisma_1.prisma) {
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
                priceRc: item.priceRc,
                rewardKey: item.rewardKey,
                sortOrder: item.sortOrder ?? 0,
                enabled: item.enabled ?? true,
            },
            update: {
                label: item.label,
                priceRc: item.priceRc,
                rewardKey: item.rewardKey,
                ...(item.sortOrder != null ? { sortOrder: item.sortOrder } : {}),
                ...(item.enabled != null ? { enabled: item.enabled } : {}),
            },
        });
    }
    async ensureDefaults(guildId, items, db = prisma_1.prisma) {
        await db.shopItem.createMany({
            data: items.map((i) => ({ guildId, key: i.key, label: i.label, priceRc: i.priceRc, rewardKey: i.rewardKey, sortOrder: i.sortOrder })),
            skipDuplicates: true,
        });
    }
    async remove(guildId, key, db = prisma_1.prisma) {
        const res = await db.shopItem.deleteMany({ where: { guildId, key } });
        return res.count > 0;
    }
}
exports.ShopRepository = ShopRepository;
// ── Lottery ──────────────────────────────────────────────────────────────---
class LotteryRepository {
    async addTickets(guildId, userId, amount, db = prisma_1.prisma) {
        if (amount === 0)
            return;
        await db.lotteryTicket.upsert({
            where: { guildId_userId: { guildId, userId } },
            create: { guildId, userId, tickets: Math.max(0, amount) },
            update: { tickets: { increment: amount } },
        });
    }
    async getTickets(guildId, userId, db = prisma_1.prisma) {
        const row = await db.lotteryTicket.findUnique({ where: { guildId_userId: { guildId, userId } } });
        return row?.tickets ?? 0;
    }
    entrants(guildId, db = prisma_1.prisma) {
        return db.lotteryTicket.findMany({ where: { guildId, tickets: { gt: 0 } } });
    }
    async pot(guildId, db = prisma_1.prisma) {
        const agg = await db.lotteryTicket.aggregate({
            where: { guildId, tickets: { gt: 0 } },
            _sum: { tickets: true },
            _count: { _all: true },
        });
        return { totalTickets: agg._sum.tickets ?? 0, participants: agg._count._all };
    }
    async resetAll(guildId, db = prisma_1.prisma) {
        await db.lotteryTicket.updateMany({ where: { guildId }, data: { tickets: 0 } });
    }
    createDraw(data, db = prisma_1.prisma) {
        return db.lotteryDraw.create({ data }).then(() => undefined);
    }
    lastDraw(guildId, db = prisma_1.prisma) {
        return db.lotteryDraw.findFirst({ where: { guildId }, orderBy: { drawnAt: 'desc' } });
    }
}
exports.LotteryRepository = LotteryRepository;
// ── Activity (message counts for anti-abuse) ───────────────────────────────--
class ActivityRepository {
    async increment(guildId, userId, db = prisma_1.prisma) {
        await db.inviteActivity.upsert({
            where: { guildId_userId: { guildId, userId } },
            create: { guildId, userId, messageCount: 1, lastMessageAt: new Date() },
            update: { messageCount: { increment: 1 }, lastMessageAt: new Date() },
        });
    }
    async getMessageCount(guildId, userId, db = prisma_1.prisma) {
        const row = await db.inviteActivity.findUnique({ where: { guildId_userId: { guildId, userId } } });
        return row?.messageCount ?? 0;
    }
}
exports.ActivityRepository = ActivityRepository;
