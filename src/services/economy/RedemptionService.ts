import { randomBytes } from 'crypto';
import { Redemption, RedemptionSource, RedemptionStatus } from '@prisma/client';
import { config } from '../../config';
import { InviteLoggingService } from '../invite/InviteLoggingService';
import { RedemptionRepository, Db } from './repositories';

// ═══════════════════════════════════════════════════════════════════════════
//  RedemptionService — rewards wallet (shop, lottery, milestones).
//  Users apply rewards during /book; staff can still redeem legacy codes.
// ═══════════════════════════════════════════════════════════════════════════

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_GROUPS = 3;
const CODE_GROUP_LEN = 4;

export interface RedeemResult {
  ok: boolean;
  redemption?: Redemption;
  reason?: 'NOT_FOUND' | 'WRONG_GUILD' | 'ALREADY_USED';
}

const SOURCE_LABEL: Record<RedemptionSource, string> = {
  SHOP: 'shop',
  MILESTONE: 'milestone',
  LOTTERY: 'lottery',
  MANUAL: 'staff',
};

export class RedemptionService {
  constructor(
    private readonly repo: RedemptionRepository,
    private readonly logging: InviteLoggingService
  ) {}

  label(rewardKey: string): string {
    return config.economy.rewardLabels[rewardKey] ?? rewardKey;
  }

  sourceLabel(source: RedemptionSource): string {
    return SOURCE_LABEL[source] ?? source.toLowerCase();
  }

  /** Legacy code generator — only used when explicitly requested. */
  generateCode(): string {
    const groups: string[] = [];
    for (let g = 0; g < CODE_GROUPS; g++) {
      const bytes = randomBytes(CODE_GROUP_LEN);
      let s = '';
      for (let i = 0; i < CODE_GROUP_LEN; i++) {
        s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
      }
      groups.push(s);
    }
    return `GR-${groups.join('-')}`;
  }

  formatRewardLine(r: Redemption): string {
    return `**${this.label(r.rewardKey)}** _(${this.sourceLabel(r.source)})_`;
  }

  async issue(
    params: { guildId: string; userId: string; rewardKey: string; source: RedemptionSource; costRc?: number | null },
    db?: Db
  ): Promise<Redemption> {
    const redemption = await this.repo.create(
      {
        guildId: params.guildId,
        userId: params.userId,
        rewardKey: params.rewardKey,
        code: null,
        source: params.source,
        costRc: params.costRc ?? null,
      },
      db
    );
    await this.logging.log({
      guildId: params.guildId,
      event: 'REDEMPTION_ISSUED',
      actorId: params.userId,
      detail: `${this.label(params.rewardKey)} (${params.source})`,
    });
    return redemption;
  }

  listAvailable(guildId: string, userId: string): Promise<Redemption[]> {
    return this.repo.listAvailable(guildId, userId);
  }

  async reserveForBooking(
    redemptionId: string,
    bookingId: string,
    userId: string,
    db?: Db
  ): Promise<boolean> {
    const ok = await this.repo.reserve(redemptionId, userId, bookingId, db);
    if (ok) {
      const row = await this.repo.findById(redemptionId, db);
      if (row) {
        await this.logging.log({
          guildId: row.guildId,
          event: 'REDEMPTION_RESERVED',
          actorId: userId,
          detail: `${this.label(row.rewardKey)} → booking ${bookingId}`,
        });
      }
    }
    return ok;
  }

  async releaseForBooking(bookingId: string): Promise<boolean> {
    const row = await this.repo.findByBookingId(bookingId);
    if (!row) return false;
    const ok = await this.repo.releaseByBooking(bookingId);
    if (ok) {
      await this.logging.log({
        guildId: row.guildId,
        event: 'REDEMPTION_RELEASED',
        targetUserId: row.userId,
        detail: `${this.label(row.rewardKey)} released (booking cancelled)`,
      });
    }
    return ok;
  }

  async finalizeForBooking(bookingId: string, staffId?: string | null): Promise<boolean> {
    const row = await this.repo.findByBookingId(bookingId);
    if (!row) return false;
    const ok = await this.repo.finalizeByBooking(bookingId, staffId ?? null);
    if (ok) {
      await this.logging.log({
        guildId: row.guildId,
        event: 'REDEMPTION_USED',
        actorId: staffId ?? undefined,
        targetUserId: row.userId,
        detail: `${this.label(row.rewardKey)} honored on booking ${bookingId}`,
      });
    }
    return ok;
  }

  async redeemById(guildId: string, id: string, staffId: string): Promise<RedeemResult> {
    const existing = await this.repo.findById(id);
    if (!existing) return { ok: false, reason: 'NOT_FOUND' };
    if (existing.guildId !== guildId) return { ok: false, reason: 'WRONG_GUILD' };
    if (existing.status !== RedemptionStatus.ACTIVE) {
      return { ok: false, reason: 'ALREADY_USED', redemption: existing };
    }
    const done = await this.repo.markRedeemedById(id, guildId, staffId);
    if (!done) return { ok: false, reason: 'ALREADY_USED', redemption: existing };
    await this.logging.log({
      guildId,
      event: 'REDEMPTION_USED',
      actorId: staffId,
      targetUserId: existing.userId,
      detail: `${this.label(existing.rewardKey)} (manual)`,
    });
    return { ok: true, redemption: existing };
  }

  async redeem(guildId: string, code: string, staffId: string): Promise<RedeemResult> {
    const normalized = code.trim().toUpperCase();
    const existing = await this.repo.findByCode(normalized);
    if (!existing) return { ok: false, reason: 'NOT_FOUND' };
    if (existing.guildId !== guildId) return { ok: false, reason: 'WRONG_GUILD' };
    if (existing.status !== RedemptionStatus.ACTIVE) {
      return { ok: false, reason: 'ALREADY_USED', redemption: existing };
    }
    const done = await this.repo.markRedeemedByCode(normalized, staffId);
    if (!done) return { ok: false, reason: 'ALREADY_USED', redemption: existing };
    await this.logging.log({
      guildId,
      event: 'REDEMPTION_USED',
      actorId: staffId,
      targetUserId: existing.userId,
      detail: `${this.label(existing.rewardKey)} → legacy code`,
    });
    return { ok: true, redemption: existing };
  }

  listForUser(guildId: string, userId: string, status?: RedemptionStatus): Promise<Redemption[]> {
    return this.repo.listForUser(guildId, userId, status);
  }

  findById(id: string): Promise<Redemption | null> {
    return this.repo.findById(id);
  }
}
