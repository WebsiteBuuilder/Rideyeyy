import { Client, EmbedBuilder, Guild, TextChannel } from 'discord.js';
import { InviteConfig, InviteJoin, InviteRewardType, InviteStatus, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../../lib/prisma';
import { adjustBalance } from '../../lib/wallet';
import { COLOR, BRAND, ICON } from '../../utils/discord';
import { InviteLoggingService } from './InviteLoggingService';
import { InviteStatisticsService } from './InviteStatisticsService';
import { InviteMilestoneService } from './InviteMilestoneService';
import type { LotteryService } from '../economy/LotteryService';

// ═══════════════════════════════════════════════════════════════════════════
//  InviteRewardService — credits RouteCash to an inviter for a verified invite,
//  atomically (economy + invite tables in one transaction) with cap enforcement
//  and full rollback if the economy write fails.
// ═══════════════════════════════════════════════════════════════════════════

const DAY_MS = 24 * 60 * 60 * 1000;

export type RewardDenialReason =
  | 'NO_INVITER'
  | 'DISABLED'
  | 'CAP_DAILY'
  | 'CAP_WEEKLY'
  | 'CAP_MONTHLY'
  | 'CAP_MAX'
  | 'ECONOMY_ERROR';

export interface RewardOutcome {
  rewarded: boolean;
  amount?: number;
  reason?: RewardDenialReason;
}

export class InviteRewardService {
  constructor(
    private readonly logging: InviteLoggingService,
    private readonly stats: InviteStatisticsService,
    private readonly milestones: InviteMilestoneService,
    private readonly lottery: LotteryService
  ) {}

  /** Grant lottery tickets to an inviter for a freshly verified invite. */
  private async grantInviteTickets(guildId: string, inviterId: string, config: InviteConfig): Promise<void> {
    if (config.lotteryEnabled && config.ticketsPerInvite > 0) {
      await this.lottery.grantTickets(guildId, inviterId, 'invite', config.ticketsPerInvite);
    }
  }

  /** Reward a join that has already passed verification. */
  async rewardJoin(client: Client, guild: Guild, join: InviteJoin, config: InviteConfig): Promise<RewardOutcome> {
    const guildId = guild.id;
    const inviterId = join.inviterUserId;

    if (!inviterId) {
      await this.markVerifiedNoReward(join.id);
      return { rewarded: false, reason: 'NO_INVITER' };
    }

    if (!config.rewardEnabled) {
      await this.finishVerifiedUnpaid(client, guild, join.id, inviterId, config);
      return { rewarded: false, reason: 'DISABLED' };
    }

    const cap = await this.checkCaps(guildId, inviterId, config);
    if (cap) {
      await this.finishVerifiedUnpaid(client, guild, join.id, inviterId, config);
      await this.logging.log(
        { guildId, event: 'REWARD_CAPPED', actorId: inviterId, targetUserId: join.invitedUserId, joinId: join.id, detail: cap },
        { client, channelId: config.loggingChannelId }
      );
      return { rewarded: false, reason: cap };
    }

    const amount = config.rewardAmount;
    try {
      await prisma.$transaction(async (tx) => {
        await adjustBalance(
          tx,
          inviterId,
          new Decimal(amount),
          'invite_reward',
          `Invite reward for ${join.invitedUserId}`
        );
        await tx.inviteJoin.update({
          where: { id: join.id },
          data: {
            status: InviteStatus.REWARDED,
            rewarded: true,
            verifiedAt: new Date(),
            rewardAmount: amount,
            fakeReason: null,
          },
        });
        await tx.inviteReward.create({
          data: {
            guildId,
            inviterUserId: inviterId,
            invitedUserId: join.invitedUserId,
            joinId: join.id,
            amount: new Prisma.Decimal(amount),
            type: InviteRewardType.INVITE,
            reason: `Invite reward for ${join.invitedUserId}`,
          },
        });
      });
    } catch (err) {
      console.error('[Invite] Reward transaction failed (will retry next sweep):', err);
      await this.logging.log(
        { guildId, event: 'REWARD_FAILED', actorId: inviterId, targetUserId: join.invitedUserId, joinId: join.id, detail: (err as Error).message },
        { client, channelId: config.loggingChannelId }
      );
      return { rewarded: false, reason: 'ECONOMY_ERROR' };
    }

    await this.stats.registerVerifiedInvite(guildId, inviterId);
    await this.stats.recomputeUserStats(guildId, inviterId);
    await this.grantInviteTickets(guildId, inviterId, config);

    await this.logging.log(
      { guildId, event: 'REWARD_PAID', actorId: inviterId, targetUserId: join.invitedUserId, joinId: join.id, detail: `+${amount} ${BRAND.ticker}` },
      { client, channelId: config.loggingChannelId }
    );

    await this.notify(client, guild, inviterId, join.invitedUserId, amount, config);
    await this.milestones.checkAndAward({
      client,
      guild,
      userId: inviterId,
      milestonesEnabled: config.milestonesEnabled,
      autoAnnounce: config.autoAnnounce,
      announceChannelId: config.announceChannelId,
      loggingChannelId: config.loggingChannelId,
    });

    return { rewarded: true, amount };
  }

  private async checkCaps(guildId: string, inviterId: string, config: InviteConfig): Promise<RewardDenialReason | null> {
    const now = Date.now();
    const base = { guildId, inviterUserId: inviterId, status: InviteStatus.REWARDED } as const;

    if (config.dailyCap > 0) {
      const c = await prisma.inviteJoin.count({ where: { ...base, verifiedAt: { gte: new Date(now - DAY_MS) } } });
      if (c >= config.dailyCap) return 'CAP_DAILY';
    }
    if (config.weeklyCap > 0) {
      const c = await prisma.inviteJoin.count({ where: { ...base, verifiedAt: { gte: new Date(now - 7 * DAY_MS) } } });
      if (c >= config.weeklyCap) return 'CAP_WEEKLY';
    }
    if (config.monthlyCap > 0) {
      const c = await prisma.inviteJoin.count({ where: { ...base, verifiedAt: { gte: new Date(now - 30 * DAY_MS) } } });
      if (c >= config.monthlyCap) return 'CAP_MONTHLY';
    }
    if (config.maxRewardsPerInviter > 0) {
      const c = await prisma.inviteJoin.count({ where: base });
      if (c >= config.maxRewardsPerInviter) return 'CAP_MAX';
    }
    return null;
  }

  /** Mark verified but unpaid (no inviter resolvable). */
  private async markVerifiedNoReward(joinId: string): Promise<void> {
    await prisma.inviteJoin.update({
      where: { id: joinId },
      data: { status: InviteStatus.VERIFIED, verifiedAt: new Date(), fakeReason: null },
    });
  }

  /** Mark verified (counts as a real invite) but without paying RC; still runs milestones. */
  private async finishVerifiedUnpaid(
    client: Client,
    guild: Guild,
    joinId: string,
    inviterId: string,
    config: InviteConfig
  ): Promise<void> {
    await prisma.inviteJoin.update({
      where: { id: joinId },
      data: { status: InviteStatus.VERIFIED, verifiedAt: new Date(), fakeReason: null },
    });
    await this.stats.registerVerifiedInvite(guild.id, inviterId);
    await this.stats.recomputeUserStats(guild.id, inviterId);
    await this.grantInviteTickets(guild.id, inviterId, config);
    await this.milestones.checkAndAward({
      client,
      guild,
      userId: inviterId,
      milestonesEnabled: config.milestonesEnabled,
      autoAnnounce: config.autoAnnounce,
      announceChannelId: config.announceChannelId,
      loggingChannelId: config.loggingChannelId,
    });
  }

  private async notify(
    client: Client,
    guild: Guild,
    inviterId: string,
    invitedUserId: string,
    amount: number,
    config: InviteConfig
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setColor(COLOR.WIN)
      .setAuthor({ name: `${BRAND.logo}  Invite Reward` })
      .setTitle(`${ICON.coin} +${amount} ${BRAND.ticker}`)
      .setDescription(`Your invite was verified — <@${invitedUserId}> stuck around!\nYou earned **${amount}** ${BRAND.ticker}.`)
      .setTimestamp();

    // DM the inviter (best-effort).
    try {
      const user = await client.users.fetch(inviterId);
      await user.send({ embeds: [embed] });
    } catch {
      /* DMs closed — ignore */
    }

    // Public announcement (best-effort).
    if (config.autoAnnounce && config.announceChannelId && config.announceChannelId !== '0') {
      try {
        const channel = await client.channels.fetch(config.announceChannelId).catch(() => null);
        if (channel && channel.isTextBased() && !channel.isDMBased()) {
          const pub = new EmbedBuilder()
            .setColor(COLOR.WIN)
            .setAuthor({ name: `${BRAND.logo}  Invite Reward` })
            .setDescription(`${ICON.win} <@${inviterId}> earned **${amount}** ${BRAND.ticker} for inviting a verified member!`)
            .setTimestamp();
          await (channel as TextChannel).send({ embeds: [pub] });
        }
      } catch {
        /* ignore */
      }
    }
  }
}
