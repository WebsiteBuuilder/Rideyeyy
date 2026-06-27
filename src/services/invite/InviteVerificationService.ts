import { Guild, GuildMember } from 'discord.js';
import { InviteFakeReason } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { ActivityService } from '../economy/ActivityService';

// ═══════════════════════════════════════════════════════════════════════════
//  InviteVerificationService — decides whether an invited member is legitimate,
//  both at join time (immediate checks) and at reward time (final re-check).
// ═══════════════════════════════════════════════════════════════════════════

const DAY_MS = 24 * 60 * 60 * 1000;

export interface VerificationConfig {
  antiAltEnabled: boolean;
  minAccountAgeDays: number;
  minMessages: number;
}

export interface VerificationResult {
  ok: boolean;
  reason?: InviteFakeReason;
  /** True when the member is valid but not yet eligible (retry later). */
  defer?: boolean;
}

export class InviteVerificationService {
  constructor(private readonly activity: ActivityService) {}

  /** Checks run the moment a member joins. */
  async immediateCheck(
    member: GuildMember,
    inviterId: string | null,
    config: VerificationConfig
  ): Promise<VerificationResult> {
    if (member.user.bot) return { ok: false, reason: 'BOT' };

    if (inviterId && inviterId === member.id) {
      return { ok: false, reason: 'SELF_INVITE' };
    }

    if (config.antiAltEnabled) {
      const ageMs = Date.now() - member.user.createdTimestamp;
      if (ageMs < config.minAccountAgeDays * DAY_MS) {
        return { ok: false, reason: 'ALT_ACCOUNT' };
      }
    }

    // Re-join / previously a member: any prior join row for this user in guild.
    const priorJoins = await prisma.inviteJoin.count({
      where: { guildId: member.guild.id, invitedUserId: member.id },
    });
    if (priorJoins > 0) {
      return { ok: false, reason: 'PREVIOUS_MEMBER' };
    }

    if (await this.wasBanned(member.guild, member.id)) {
      return { ok: false, reason: 'BAN_EVASION' };
    }

    return { ok: true };
  }

  /** Re-check at reward time: the member must still be present and valid. */
  async finalCheck(
    guild: Guild,
    userId: string,
    accountCreatedAt: Date | null,
    config: VerificationConfig
  ): Promise<VerificationResult> {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { ok: false, reason: 'LEFT_EARLY' };
    if (member.user.bot) return { ok: false, reason: 'BOT' };

    if (config.antiAltEnabled && accountCreatedAt) {
      const ageMs = Date.now() - accountCreatedAt.getTime();
      if (ageMs < config.minAccountAgeDays * DAY_MS) {
        return { ok: false, reason: 'ALT_ACCOUNT' };
      }
    }

    if (await this.wasBanned(guild, userId)) {
      return { ok: false, reason: 'BAN_EVASION' };
    }

    // Minimum message engagement: a present member who hasn't chatted enough is
    // deferred (not marked fake) so they can still qualify by participating.
    if (config.minMessages > 0) {
      const messages = await this.activity.getMessageCount(guild.id, userId);
      if (messages < config.minMessages) {
        return { ok: false, defer: true };
      }
    }

    return { ok: true };
  }

  private async wasBanned(guild: Guild, userId: string): Promise<boolean> {
    try {
      const ban = await guild.bans.fetch(userId).catch(() => null);
      return ban != null;
    } catch {
      // Missing Ban Members permission — cannot determine, treat as not banned.
      return false;
    }
  }
}
