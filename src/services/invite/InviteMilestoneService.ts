import { Client, EmbedBuilder, Guild, TextChannel } from 'discord.js';
import { InviteRewardType, InviteStatus, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../../lib/prisma';
import { adjustBalance } from '../../lib/wallet';
import { COLOR, BRAND, ICON } from '../../utils/discord';
import { InviteLoggingService } from './InviteLoggingService';
import { InviteStatisticsService } from './InviteStatisticsService';

// ═══════════════════════════════════════════════════════════════════════════
//  InviteMilestoneService — awards RouteCash and/or a role when an inviter
//  crosses a configured verified-invite threshold. Awards are deduped via the
//  unique InviteMilestoneAward (guildId, userId, milestoneId).
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
}

export class InviteMilestoneService {
  constructor(
    private readonly logging: InviteLoggingService,
    private readonly stats: InviteStatisticsService
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

      try {
        await prisma.$transaction(async (tx) => {
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
      });

      await this.logging.log(
        {
          guildId,
          event: 'MILESTONE_COMPLETED',
          actorId: userId,
          detail: `Reached ${m.threshold} invites${m.label ? ` (${m.label})` : ''} → +${m.rewardAmount} ${BRAND.ticker}`,
        },
        { client: ctx.client, channelId: ctx.loggingChannelId }
      );

      if (ctx.autoAnnounce) {
        await this.announce(ctx, m.threshold, m.label, m.rewardAmount, m.rewardRoleId);
      }
    }

    if (awarded.length > 0) {
      await this.stats.recomputeUserStats(guildId, userId);
    }
    return awarded;
  }

  private async announce(
    ctx: MilestoneContext,
    threshold: number,
    label: string | null,
    rewardAmount: number,
    rewardRoleId: string | null
  ): Promise<void> {
    if (!ctx.announceChannelId || ctx.announceChannelId === '0') return;
    try {
      const channel = await ctx.client.channels.fetch(ctx.announceChannelId).catch(() => null);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) return;

      const rewardLines: string[] = [];
      if (rewardAmount > 0) rewardLines.push(`${ICON.coin} **${rewardAmount}** ${BRAND.ticker}`);
      if (rewardRoleId) rewardLines.push(`${ICON.jackpot} <@&${rewardRoleId}>`);

      const embed = new EmbedBuilder()
        .setColor(COLOR.JACKPOT)
        .setAuthor({ name: `${BRAND.logo}  Invite Milestone` })
        .setTitle(`${ICON.jackpot} Milestone Unlocked!`)
        .setDescription(
          `<@${ctx.userId}> just reached **${threshold} invites**${label ? ` — **${label}**` : ''}!\n\n` +
            (rewardLines.length ? `**Rewards**\n${rewardLines.join('\n')}` : '')
        )
        .setTimestamp();

      await (channel as TextChannel).send({ content: `<@${ctx.userId}>`, embeds: [embed] });
    } catch (err) {
      console.error('[Invite] Milestone announce failed:', err);
    }
  }
}
