import { Prisma, RedemptionSource, RedemptionStatus, Redemption, ShopItem, LotteryTicket } from '@prisma/client';
import { prisma } from '../../lib/prisma';

// ═══════════════════════════════════════════════════════════════════════════
//  Repository layer — thin, typed Prisma wrappers for the referral economy.
// ═══════════════════════════════════════════════════════════════════════════

export type Db = Prisma.TransactionClient | typeof prisma;

// ── Redemptions ──────────────────────────────────────────────────────────---

export class RedemptionRepository {
  create(
    data: {
      guildId: string;
      userId: string;
      rewardKey: string;
      code?: string | null;
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
        code: data.code ?? null,
        source: data.source,
        costRc: data.costRc != null ? new Prisma.Decimal(data.costRc) : null,
      },
    });
  }

  findById(id: string, db: Db = prisma): Promise<Redemption | null> {
    return db.redemption.findUnique({ where: { id } });
  }

  findByCode(code: string, db: Db = prisma): Promise<Redemption | null> {
    return db.redemption.findUnique({ where: { code } });
  }

  findByBookingId(bookingId: string, db: Db = prisma): Promise<Redemption | null> {
    return db.redemption.findFirst({ where: { bookingId } });
  }

  listAvailable(guildId: string, userId: string, db: Db = prisma): Promise<Redemption[]> {
    return db.redemption.findMany({
      where: { guildId, userId, status: RedemptionStatus.ACTIVE },
      orderBy: { createdAt: 'asc' },
      take: 25,
    });
  }

  /** Atomically flip ACTIVE → RESERVED for a booking. */
  async reserve(id: string, userId: string, bookingId: string, db: Db = prisma): Promise<boolean> {
    const res = await db.redemption.updateMany({
      where: { id, userId, status: RedemptionStatus.ACTIVE },
      data: { status: RedemptionStatus.RESERVED, bookingId },
    });
    return res.count > 0;
  }

  /** RESERVED → ACTIVE when a booking is cancelled. */
  async releaseByBooking(bookingId: string, db: Db = prisma): Promise<boolean> {
    const res = await db.redemption.updateMany({
      where: { bookingId, status: RedemptionStatus.RESERVED },
      data: { status: RedemptionStatus.ACTIVE, bookingId: null },
    });
    return res.count > 0;
  }

  /** RESERVED → REDEEMED when a ride completes. */
  async finalizeByBooking(bookingId: string, staffId: string | null, db: Db = prisma): Promise<boolean> {
    const res = await db.redemption.updateMany({
      where: { bookingId, status: RedemptionStatus.RESERVED },
      data: {
        status: RedemptionStatus.REDEEMED,
        redeemedBy: staffId,
        redeemedAt: new Date(),
      },
    });
    return res.count > 0;
  }

  /** Atomically flip ACTIVE → REDEEMED (staff manual). */
  async markRedeemedById(id: string, guildId: string, staffId: string, db: Db = prisma): Promise<boolean> {
    const res = await db.redemption.updateMany({
      where: { id, guildId, status: RedemptionStatus.ACTIVE },
      data: { status: RedemptionStatus.REDEEMED, redeemedBy: staffId, redeemedAt: new Date() },
    });
    return res.count > 0;
  }

  /** Legacy code redemption. */
  async markRedeemedByCode(code: string, staffId: string, db: Db = prisma): Promise<boolean> {
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
    item: {
      guildId: string;
      key: string;
      label: string;
      description?: string | null;
      priceRc: number;
      rewardKey: string;
      sortOrder?: number;
      enabled?: boolean;
    },
    db: Db = prisma
  ): Promise<ShopItem> {
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

  async toggleEnabled(guildId: string, key: string, db: Db = prisma): Promise<ShopItem | null> {
    const item = await this.findByKey(guildId, key, db);
    if (!item) return null;
    return db.shopItem.update({ where: { guildId_key: { guildId, key } }, data: { enabled: !item.enabled } });
  }

  async remove(guildId: string, key: string, db: Db = prisma): Promise<boolean> {
    try {
      await db.shopItem.delete({ where: { guildId_key: { guildId, key } } });
      return true;
    } catch {
      return false;
    }
  }

  async ensureDefaults(
    guildId: string,
    items: ReadonlyArray<{ key: string; label: string; priceRc: number; rewardKey: string; sortOrder: number }>,
    db: Db = prisma
  ): Promise<void> {
    for (const i of items) {
      await db.shopItem.upsert({
        where: { guildId_key: { guildId, key: i.key } },
        create: { guildId, key: i.key, label: i.label, priceRc: i.priceRc, rewardKey: i.rewardKey, sortOrder: i.sortOrder },
        update: {},
      });
    }
  }
}

// ── Lottery ────────────────────────────────────────────────────────────────

export class LotteryRepository {
  addTickets(guildId: string, userId: string, amount: number, db: Db = prisma): Promise<void> {
    return db.lotteryTicket
      .upsert({
        where: { guildId_userId: { guildId, userId } },
        create: { guildId, userId, tickets: amount },
        update: { tickets: { increment: amount } },
      })
      .then(() => undefined);
  }

  getTickets(guildId: string, userId: string, db: Db = prisma): Promise<number> {
    return db.lotteryTicket
      .findUnique({ where: { guildId_userId: { guildId, userId } } })
      .then((r) => r?.tickets ?? 0);
  }

  async pot(guildId: string, db: Db = prisma): Promise<{ totalTickets: number; participants: number }> {
    const agg = await db.lotteryTicket.aggregate({
      where: { guildId, tickets: { gt: 0 } },
      _sum: { tickets: true },
      _count: true,
    });
    return { totalTickets: agg._sum.tickets ?? 0, participants: agg._count };
  }

  entrants(guildId: string, db: Db = prisma): Promise<{ userId: string; tickets: number }[]> {
    return db.lotteryTicket.findMany({
      where: { guildId, tickets: { gt: 0 } },
      select: { userId: true, tickets: true },
    });
  }

  lastDraw(guildId: string, db: Db = prisma) {
    return db.lotteryDraw.findFirst({ where: { guildId }, orderBy: { drawnAt: 'desc' } });
  }
}

export class ActivityRepository {
  increment(guildId: string, userId: string, db: Db = prisma): Promise<void> {
    return db.inviteActivity
      .upsert({
        where: { guildId_userId: { guildId, userId } },
        create: { guildId, userId, messageCount: 1, lastMessageAt: new Date() },
        update: { messageCount: { increment: 1 }, lastMessageAt: new Date() },
      })
      .then(() => undefined);
  }

  getMessageCount(guildId: string, userId: string, db: Db = prisma): Promise<number> {
    return db.inviteActivity
      .findUnique({ where: { guildId_userId: { guildId, userId } } })
      .then((r) => r?.messageCount ?? 0);
  }
}
