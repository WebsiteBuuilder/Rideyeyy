import { Client, EmbedBuilder, GuildMember } from 'discord.js';
import { InviteStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { config } from '../../config';
import { COLOR, BRAND, ICON } from '../../utils/discord';
import type { InviteService } from '../invite/InviteService';

// ═══════════════════════════════════════════════════════════════════════════
//  MemberVerifyService — one-time captcha screener; grants Rider role and
//  triggers invite RC payout when an invited member completes verification.
// ═══════════════════════════════════════════════════════════════════════════

const CAPTCHA_TTL_MS = 5 * 60 * 1000;

interface CaptchaChallenge {
  answer: number;
  expiresAt: number;
}

export type VerifyResult =
  | { ok: true; alreadyVerified?: boolean }
  | { ok: false; reason: 'wrong_captcha' | 'expired' | 'failed_check' | 'error'; message: string };

export class MemberVerifyService {
  private readonly captchaStore = new Map<string, CaptchaChallenge>();

  constructor(private readonly invite: InviteService) {}

  /** Assign Unverified role on join (best-effort). */
  async onMemberAdd(member: GuildMember): Promise<void> {
    const roleId = config.roles.unverified;
    if (roleId === '0') return;
    try {
      if (!member.roles.cache.has(roleId)) {
        await member.roles.add(roleId);
      }
    } catch (err) {
      console.warn('[Verify] Could not assign Unverified role:', (err as Error).message);
    }
  }

  /** Create a math captcha for the user; returns the question text. */
  createCaptcha(userId: string): string {
    const a = 3 + Math.floor(Math.random() * 10);
    const b = 3 + Math.floor(Math.random() * 10);
    this.captchaStore.set(userId, { answer: a + b, expiresAt: Date.now() + CAPTCHA_TTL_MS });
    return `What is ${a} + ${b}?`;
  }

  /** Show the captcha modal (call from button handler). */
  buildCaptchaPrompt(userId: string): string {
    return this.createCaptcha(userId);
  }

  async completeCaptcha(client: Client, member: GuildMember, answerRaw: string): Promise<VerifyResult> {
    const guildId = member.guild.id;
    const userId = member.id;

    const existing = await prisma.memberVerification.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    if (existing) {
      return { ok: true, alreadyVerified: true };
    }

    const challenge = this.captchaStore.get(userId);
    this.captchaStore.delete(userId);
    if (!challenge || Date.now() > challenge.expiresAt) {
      return { ok: false, reason: 'expired', message: 'Captcha expired. Press Verify again.' };
    }

    const parsed = Number(String(answerRaw).trim());
    if (!Number.isFinite(parsed) || parsed !== challenge.answer) {
      return { ok: false, reason: 'wrong_captcha', message: 'Incorrect answer. Press Verify to try again.' };
    }

    const cfg = await this.invite.admin.ensureConfig(guildId);
    const check = await this.invite.verification.finalCheck(
      member.guild,
      userId,
      member.user.createdAt,
      cfg
    );
    if (!check.ok && !check.defer) {
      return { ok: false, reason: 'failed_check', message: 'Verification failed. Contact staff if you believe this is an error.' };
    }

    const join = await prisma.inviteJoin.findFirst({
      where: {
        guildId,
        invitedUserId: userId,
        status: InviteStatus.PENDING,
        inviterUserId: { not: null },
      },
      orderBy: { joinedAt: 'desc' },
    });

    await prisma.memberVerification.create({
      data: {
        guildId,
        userId,
        inviterUserId: join?.inviterUserId ?? null,
      },
    });

    await this.applyRoles(member);

    if (join?.inviterUserId) {
      await prisma.inviteJoin.update({
        where: { id: join.id },
        data: { screenerVerifiedAt: new Date() },
      });
      await this.invite.reward.rewardJoin(client, member.guild, join, cfg);
    }

    try {
      const welcome = new EmbedBuilder()
        .setColor(COLOR.WIN)
        .setAuthor({ name: `${BRAND.logo}  Welcome` })
        .setTitle(`${ICON.check} You're verified!`)
        .setDescription('You now have access to the server. Enjoy your ride!')
        .setTimestamp();
      await member.send({ embeds: [welcome] });
    } catch {
      /* DMs closed */
    }

    return { ok: true };
  }

  async isVerified(guildId: string, userId: string): Promise<boolean> {
    const row = await prisma.memberVerification.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    return row != null;
  }

  /** DM all screener-verified members the backup server invite link. */
  async pullMembersToBackup(client: Client, guildId: string): Promise<{ sent: number; failed: number; total: number }> {
    const url = config.backup.serverInviteUrl;
    if (!url) throw new Error('BACKUP_SERVER_INVITE_URL is not configured.');

    const members = await prisma.memberVerification.findMany({ where: { guildId } });
    let sent = 0;
    let failed = 0;

    for (const row of members) {
      try {
        const user = await client.users.fetch(row.userId);
        await user.send(
          `**${BRAND.name} — Server Backup**\n\nOur community has moved. Join us here:\n${url}`
        );
        sent++;
      } catch {
        failed++;
      }
      await sleep(200);
    }

    return { sent, failed, total: members.length };
  }

  private async applyRoles(member: GuildMember): Promise<void> {
    const riderId = config.roles.rider;
    const unverifiedId = config.roles.unverified;
    try {
      if (unverifiedId !== '0' && member.roles.cache.has(unverifiedId)) {
        await member.roles.remove(unverifiedId);
      }
      if (riderId !== '0' && !member.roles.cache.has(riderId)) {
        await member.roles.add(riderId);
      }
    } catch (err) {
      console.error('[Verify] Role swap failed:', err);
      throw err;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
