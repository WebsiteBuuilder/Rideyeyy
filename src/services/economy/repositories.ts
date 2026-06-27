import { Prisma, RedemptionSource, RedemptionStatus, Redemption, ShopItem, LotteryTicket } from '@prisma/client';
import { prisma } from '../../lib/prisma';

// ═══════════════════════════════════════════════════════════════════════════
//  Repository layer — thin, typed Prisma wrappers for the referral economy.
//  Every method accepts an optional transaction client so callers can compose
//  atomic operations (e.g. shop purchase = balance debit + redemption insert).
// ═══════════════════════════════════════════════════════════════════════════

export type Db = Prisma.TransactionClient | typeof prisma;

// ── Redemptions ──────────────────────────────────────────────────────────---

export class RedemptionRepository {
  create(
    data: {
      guildId: string;
      userId: string;
      rewardKey: string;
      code: string;
      source: RedemptionSource;
      costRc?: number | null;
    },
    db: Db = prisma
  ): Promise<Redemption> {
    return db.redemption.create({
      data: {
        guildId: data.guildId,
        userId: data.userId,
        rewardKey: data.rewardKey,
        code: data.code,
        source: data.source,
        costRc: data.costRc != null ? new Prisma.Decimal(data.costRc) : null,
      },
    });
  }

  findByCode(code: string, db: Db = prisma): Promise<Redemption | null> {
    return db.redemption.findUnique({ where: { code } });
  }

  /** Atomically flip an ACTIVE code to REDEEMED. Returns false if not active. */
  async markRedeemed(code: string, staffId: string, db: Db = prisma): Promise<boolean> {
    const res = await db.redemption.updateMany({
      where: { code, status: RedemptionStatus.ACTIVE },
      data: { status: RedemptionStatus.REDEEMED, redeemedBy: staffId, redeemedAt: new Date() },
    });
    return res.count > 0;
  }

  listForUser(guildId: string, userId: string, status?: RedemptionStatus, db: Db = prisma): Promise<Redemption[]> {
    return db.redemption.findMany({
      where: { guildId, userId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
  }
}

// ── Shop ─────────────────────────────────────────────────────────────────---

export class ShopRepository {
  listEnabled(guildId: string, db: Db = prisma): Promise<ShopItem[]> {
    return db.shopItem.findMany({ where: { guildId, enabled: true }, orderBy: { sortOrder: 'asc' } });
  }

  listAll(guildId: string, db: Db = prisma): Promise<ShopItem[]> {
    return db.shopItem.findMany({ where: { guildId }, orderBy: { sortOrder: 'asc' } });
  }

  findByKey(guildId: string, key: string, db: Db = prisma): Promise<ShopItem | null> {
    return db.shopItem.findUnique({ where: { guildId_key: { guildId, key } } });
  }

  upsert(
    item: { guildId: string; key: string; label: string; priceRc: number; rewardKey: string; sortOrder?: number; enabled?: boolean },
    db: Db = prisma
  ): Promise<ShopItem> {
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

  async ensureDefaults(
    guildId: string,
    items: ReadonlyArray<{ key: string; label: string; priceRc: number; rewardKey: string; sortOrder: number }>,
    db: Db = prisma
  ): Promise<void> {
    await db.shopItem.createMany({
      data: items.map((i) => ({ guildId, key: i.key, label: i.label, priceRc: i.priceRc, rewardKey: i.rewardKey, sortOrder: i.sortOrder })),
      skipDuplicates: true,
    });
  }

  async remove(guildId: string, key: string, db: Db = prisma): Promise<boolean> {
    const res = await db.shopItem.deleteMany({ where: { guildId, key } });
    return res.count > 0;
  }
}

// ── Lottery ──────────────────────────────────────────────────────────────---

export class LotteryRepository {
  async addTickets(guildId: string, userId: string, amount: number, db: Db = prisma): Promise<void> {
    if (amount === 0) return;
    await db.lotteryTicket.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId, tickets: Math.max(0, amount) },
      update: { tickets: { increment: amount } },
    });
  }

  async getTickets(guildId: string, userId: string, db: Db = prisma): Promise<number> {
    const row = await db.lotteryTicket.findUnique({ where: { guildId_userId: { guildId, userId } } });
    return row?.tickets ?? 0;
  }

  entrants(guildId: string, db: Db = prisma): Promise<LotteryTicket[]> {
    return db.lotteryTicket.findMany({ where: { guildId, tickets: { gt: 0 } } });
  }

  async pot(guildId: string, db: Db = prisma): Promise<{ totalTickets: number; participants: number }> {
    const agg = await db.lotteryTicket.aggregate({
      where: { guildId, tickets: { gt: 0 } },
      _sum: { tickets: true },
      _count: { _all: true },
    });
    return { totalTickets: agg._sum.tickets ?? 0, participants: agg._count._all };
  }

  async resetAll(guildId: string, db: Db = prisma): Promise<void> {
    await db.lotteryTicket.updateMany({ where: { guildId }, data: { tickets: 0 } });
  }

  createDraw(
    data: { guildId: string; winnerUserId: string | null; totalTickets: number; participants: number; prizeKey: string; redemptionCode: string | null },
    db: Db = prisma
  ): Promise<void> {
    return db.lotteryDraw.create({ data }).then(() => undefined);
  }

  lastDraw(guildId: string, db: Db = prisma) {
    return db.lotteryDraw.findFirst({ where: { guildId }, orderBy: { drawnAt: 'desc' } });
  }
}

// ── Activity (message counts for anti-abuse) ───────────────────────────────--

export class ActivityRepository {
  async increment(guildId: string, userId: string, db: Db = prisma): Promise<void> {
    await db.inviteActivity.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId, messageCount: 1, lastMessageAt: new Date() },
      update: { messageCount: { increment: 1 }, lastMessageAt: new Date() },
    });
  }

  async getMessageCount(guildId: string, userId: string, db: Db = prisma): Promise<number> {
    const row = await db.inviteActivity.findUnique({ where: { guildId_userId: { guildId, userId } } });
    return row?.messageCount ?? 0;
  }
}
