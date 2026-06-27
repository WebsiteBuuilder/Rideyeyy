import { randomBytes } from 'crypto';
import { Redemption, RedemptionSource, RedemptionStatus } from '@prisma/client';
import { config } from '../../config';
import { InviteLoggingService } from '../invite/InviteLoggingService';
import { RedemptionRepository, Db } from './repositories';

// ═══════════════════════════════════════════════════════════════════════════
//  RedemptionService — issues and consumes single-use reward codes (free/
//  discounted rides). Double-redemption-proof via a unique code + an atomic
//  ACTIVE -> REDEEMED transition.
// ═══════════════════════════════════════════════════════════════════════════

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
const CODE_GROUPS = 3;
const CODE_GROUP_LEN = 4;

export interface RedeemResult {
  ok: boolean;
  redemption?: Redemption;
  reason?: 'NOT_FOUND' | 'WRONG_GUILD' | 'ALREADY_USED';
}

export class RedemptionService {
  constructor(
    private readonly repo: RedemptionRepository,
    private readonly logging: InviteLoggingService
  ) {}

  label(rewardKey: string): string {
    return config.economy.rewardLabels[rewardKey] ?? rewardKey;
  }

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

  /**
   * Issue a redemption code. When `db` is a transaction client the insert joins
   * the caller's transaction (used by shop purchases so debit + code are atomic).
   * Codes use ~60 bits of entropy so collisions are effectively impossible.
   */
  async issue(
    params: { guildId: string; userId: string; rewardKey: string; source: RedemptionSource; costRc?: number | null },
    db?: Db
  ): Promise<Redemption> {
    const code = this.generateCode();
    const redemption = await this.repo.create(
      { guildId: params.guildId, userId: params.userId, rewardKey: params.rewardKey, code, source: params.source, costRc: params.costRc ?? null },
      db
    );
    await this.logging.log({
      guildId: params.guildId,
      event: 'REDEMPTION_ISSUED',
      actorId: params.userId,
      detail: `${this.label(params.rewardKey)} → \`${code}\` (${params.source})`,
    });
    return redemption;
  }

  async redeem(guildId: string, code: string, staffId: string): Promise<RedeemResult> {
    const normalized = code.trim().toUpperCase();
    const existing = await this.repo.findByCode(normalized);
    if (!existing) return { ok: false, reason: 'NOT_FOUND' };
    if (existing.guildId !== guildId) return { ok: false, reason: 'WRONG_GUILD' };
    if (existing.status !== RedemptionStatus.ACTIVE) return { ok: false, reason: 'ALREADY_USED', redemption: existing };

    const done = await this.repo.markRedeemed(normalized, staffId);
    if (!done) return { ok: false, reason: 'ALREADY_USED', redemption: existing };

    await this.logging.log({
      guildId,
      event: 'REDEMPTION_USED',
      actorId: staffId,
      targetUserId: existing.userId,
      detail: `${this.label(existing.rewardKey)} → \`${normalized}\``,
    });
    return { ok: true, redemption: existing };
  }

  listForUser(guildId: string, userId: string, status?: RedemptionStatus): Promise<Redemption[]> {
    return this.repo.listForUser(guildId, userId, status);
  }
}
