import { Client, EmbedBuilder, Guild, TextChannel } from 'discord.js';
import { InviteRewardType, InviteStatus, Prisma, RedemptionSource } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../../lib/prisma';
import { adjustBalance } from '../../lib/wallet';
import { COLOR, BRAND, ICON } from '../../utils/discord';
import { InviteLoggingService } from './InviteLoggingService';
import { InviteStatisticsService } from './InviteStatisticsService';
import type { RedemptionService } from '../economy/RedemptionService';
import type { LotteryService } from '../economy/LotteryService';

// ═══════════════════════════════════════════════════════════════════════════
//  InviteMilestoneService — awards RouteCash, a role, a ride redemption code,
//  and/or lottery tickets when an inviter crosses a verified-invite threshold.
//  Awards are deduped via the unique InviteMilestoneAward (guildId, user, ms).
// ═══════════════════════════════════════════════════════════════════════════

export interface MilestoneContext {
  client: Client;
  guild: Guild;
  userId: string;
  milestonesEnabled: boolean;
  autoAnnounce: boolean;
  announceChannelId: string | null;
  loggingChannelId: string | null;
}

export interface AwardedMilestone {
  threshold: number;
  label: string | null;
  rewardAmount: number;
  rewardRoleId: string | null;
  rewardRideKey: string | null;
  rewardTickets: number;
  rideCode: string | null;
}

export class InviteMilestoneService {
  constructor(
    private readonly logging: InviteLoggingService,
    private readonly stats: InviteStatisticsService,
    private readonly redemption: RedemptionService,
    private readonly lottery: LotteryService
  ) {}

  async checkAndAward(ctx: MilestoneContext): Promise<AwardedMilestone[]> {
    if (!ctx.milestonesEnabled) return [];
    const { guild, userId } = ctx;
    const guildId = guild.id;

    const verified = await prisma.inviteJoin.count({
      where: { guildId, inviterUserId: userId, status: { in: [InviteStatus.VERIFIED, InviteStatus.REWARDED] } },
    });

    const milestones = await prisma.inviteMilestone.findMany({
      where: { guildId, enabled: true, threshold: { lte: verified } },
      orderBy: { threshold: 'asc' },
    });

    const awarded: AwardedMilestone[] = [];

    for (const m of milestones) {
      const exists = await prisma.inviteMilestoneAward.findUnique({
        where: { guildId_userId_milestoneId: { guildId, userId, milestoneId: m.id } },
      });
      if (exists) continue;

      let rideCode: string | null = null;
      try {
        rideCode = await prisma.$transaction(async (tx) => {
          await tx.inviteMilestoneAward.create({ data: { guildId, userId, milestoneId: m.id } });
          if (m.rewardAmount > 0) {
            await adjustBalance(
              tx,
              userId,
              new Decimal(m.rewardAmount),
              'invite_milestone',
              `Invite milestone: ${m.threshold} verified invites`
            );
            await tx.inviteReward.create({
              data: {
                guildId,
                inviterUserId: userId,
                amount: new Prisma.Decimal(m.rewardAmount),
                type: InviteRewardType.MILESTONE,
                reason: `Milestone ${m.threshold}`,
              },
            });
          }
          let code: string | null = null;
          if (m.rewardRideKey) {
            code = this.redemption.generateCode();
            await tx.redemption.create({
              data: { guildId, userId, rewardKey: m.rewardRideKey, code, source: RedemptionSource.MILESTONE },
            });
          }
          if (m.rewardTickets > 0) {
            await tx.lotteryTicket.upsert({
              where: { guildId_userId: { guildId, userId } },
              create: { guildId, userId, tickets: m.rewardTickets },
              update: { tickets: { increment: m.rewardTickets } },
            });
          }
          return code;
        });
      } catch (err) {
        // Unique violation = awarded concurrently; anything else we log and skip.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
          console.error('[Invite] Milestone award failed:', err);
        }
        continue;
      }

      if (m.rewardRoleId) {
        try {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) await member.roles.add(m.rewardRoleId);
        } catch (err) {
          console.warn('[Invite] Could not add milestone role:', (err as Error).message);
        }
      }

      awarded.push({
        threshold: m.threshold,
        label: m.label,
        rewardAmount: m.rewardAmount,
        rewardRoleId: m.rewardRoleId,
        rewardRideKey: m.rewardRideKey,
        rewardTickets: m.rewardTickets,
        rideCode,
      });

      const rewardParts: string[] = [];
      if (m.rewardAmount > 0) rewardParts.push(`+${m.rewardAmount} ${BRAND.ticker}`);
      if (m.rewardRideKey) rewardParts.push(this.redemption.label(m.rewardRideKey));
      if (m.rewardRoleId) rewardParts.push('role');
      if (m.rewardTickets > 0) rewardParts.push(`${m.rewardTickets} lottery ticket(s)`);

      await this.logging.log(
        {
          guildId,
          event: 'MILESTONE_COMPLETED',
          actorId: userId,
          detail: `Reached ${m.threshold} invites${m.label ? ` (${m.label})` : ''} → ${rewardParts.join(', ') || 'no reward'}`,
        },
        { client: ctx.client, channelId: ctx.loggingChannelId }
      );

      if (rideCode) await this.dmRideCode(ctx.client, userId, m.rewardRideKey as string, rideCode);

      if (ctx.autoAnnounce) {
        await this.announce(ctx, m);
      }
    }

    if (awarded.length > 0) {
      await this.stats.recomputeUserStats(guildId, userId);
    }
    return awarded;
  }

  private async announce(
    ctx: MilestoneContext,
    m: { threshold: number; label: string | null; rewardAmount: number; rewardRoleId: string | null; rewardRideKey: string | null; rewardTickets: number }
  ): Promise<void> {
    if (!ctx.announceChannelId || ctx.announceChannelId === '0') return;
    try {
      const channel = await ctx.client.channels.fetch(ctx.announceChannelId).catch(() => null);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) return;

      const rewardLines: string[] = [];
      if (m.rewardAmount > 0) rewardLines.push(`${ICON.coin} **${m.rewardAmount}** ${BRAND.ticker}`);
      if (m.rewardRideKey) rewardLines.push(`${ICON.win} **${this.redemption.label(m.rewardRideKey)}**`);
      if (m.rewardRoleId) rewardLines.push(`${ICON.jackpot} <@&${m.rewardRoleId}>`);
      if (m.rewardTickets > 0) rewardLines.push(`🎟️ **${m.rewardTickets}** lottery ticket(s)`);

      const embed = new EmbedBuilder()
        .setColor(COLOR.JACKPOT)
        .setAuthor({ name: `${BRAND.logo}  Invite Milestone` })
        .setTitle(`${ICON.jackpot} Milestone Unlocked!`)
        .setDescription(
          `<@${ctx.userId}> just reached **${m.threshold} invites**${m.label ? ` — **${m.label}**` : ''}!\n\n` +
            (rewardLines.length ? `**Rewards**\n${rewardLines.join('\n')}` : '')
        )
        .setTimestamp();

      await (channel as TextChannel).send({ content: `<@${ctx.userId}>`, embeds: [embed] });
    } catch (err) {
      console.error('[Invite] Milestone announce failed:', err);
    }
  }

  private async dmRideCode(client: Client, userId: string, rewardKey: string, code: string): Promise<void> {
    try {
      const user = await client.users.fetch(userId);
      const embed = new EmbedBuilder()
        .setColor(COLOR.WIN)
        .setAuthor({ name: `${BRAND.logo}  Invite Milestone` })
        .setTitle(`${ICON.win} You earned a ride reward!`)
        .setDescription(`Reward: **${this.redemption.label(rewardKey)}**\nRedemption code: \`${code}\`\n\nShow this code to staff in your booking ticket to claim it.`)
        .setTimestamp();
      await user.send({ embeds: [embed] });
    } catch {
      /* DMs closed — code remains retrievable via /redeem listing */
    }
  }
}
