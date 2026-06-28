import { Client, Guild, TextChannel } from 'discord.js';
import { InviteConfig, RedemptionSource } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { buildLotteryEmbed, buildLotteryWinnerDmEmbed } from '../../utils/casinoEmbeds';
import { InviteLoggingService } from '../invite/InviteLoggingService';
import { LotteryRepository } from './repositories';
import { RedemptionService } from './RedemptionService';

// ═══════════════════════════════════════════════════════════════════════════
//  LotteryService — weekly ticket-weighted draw. Tickets accrue from configured
//  sources and reset on each draw. The winner receives a prize redemption code.
// ═══════════════════════════════════════════════════════════════════════════

export interface DrawOutcome {
  winnerUserId: string | null;
  totalTickets: number;
  participants: number;
  prizeKey: string;
  redemptionCode: string | null;
}

export class LotteryService {
  constructor(
    private readonly repo: LotteryRepository,
    private readonly redemption: RedemptionService,
    private readonly logging: InviteLoggingService
  ) {}

  async grantTickets(guildId: string, userId: string, source: string, amount: number): Promise<void> {
    if (amount <= 0) return;
    await this.repo.addTickets(guildId, userId, amount);
    await this.logging.log({ guildId, event: 'LOTTERY_TICKETS', actorId: userId, detail: `+${amount} ticket(s) from ${source}` });
  }

  getTickets(guildId: string, userId: string): Promise<number> {
    return this.repo.getTickets(guildId, userId);
  }

  getPot(guildId: string): Promise<{ totalTickets: number; participants: number }> {
    return this.repo.pot(guildId);
  }

  lastDraw(guildId: string) {
    return this.repo.lastDraw(guildId);
  }

  /** Run the weekly draw: pick a weighted winner, issue the prize, reset tickets. */
  async drawWeekly(client: Client, guild: Guild, cfg: InviteConfig): Promise<DrawOutcome> {
    const guildId = guild.id;
    const entrants = await this.repo.entrants(guildId);
    const totalTickets = entrants.reduce((sum, e) => sum + e.tickets, 0);
    const participants = entrants.length;

    let winnerUserId: string | null = null;
    if (totalTickets > 0) {
      let roll = Math.floor(Math.random() * totalTickets);
      for (const e of entrants) {
        roll -= e.tickets;
        if (roll < 0) {
          winnerUserId = e.userId;
          break;
        }
      }
    }

    const prizeKey = cfg.lotteryPrizeKey;
    let redemptionCode: string | null = null;

    await prisma.$transaction(async (tx) => {
      if (winnerUserId) {
        const issued = await this.redemption.issue(
          { guildId, userId: winnerUserId, rewardKey: prizeKey, source: RedemptionSource.LOTTERY },
          tx
        );
        redemptionCode = issued.id;
      }
      await tx.lotteryDraw.create({
        data: { guildId, winnerUserId, totalTickets, participants, prizeKey, redemptionCode },
      });
      await tx.lotteryTicket.updateMany({ where: { guildId }, data: { tickets: 0 } });
    });

    await this.logging.log({
      guildId,
      event: 'LOTTERY_DRAW',
      targetUserId: winnerUserId,
      detail: winnerUserId
        ? `Winner <@${winnerUserId}> — ${participants} entrants, ${totalTickets} tickets`
        : `No entrants this week`,
    });

    await this.announce(client, guild, cfg, { winnerUserId, totalTickets, participants, prizeKey, redemptionCode });
    if (winnerUserId) {
      await this.dmWinner(client, winnerUserId, prizeKey);
    }

    return { winnerUserId, totalTickets, participants, prizeKey, redemptionCode };
  }

  private async announce(client: Client, guild: Guild, cfg: InviteConfig, outcome: DrawOutcome): Promise<void> {
    const channelId = cfg.lotteryChannelId ?? cfg.announceChannelId;
    if (!channelId || channelId === '0') return;
    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) return;

      const prizeLabel = this.redemption.label(outcome.prizeKey);
      const embed = buildLotteryEmbed({
        mode: 'results',
        prizeLabel,
        totalTickets: outcome.totalTickets,
        participants: outcome.participants,
        resultsDetail: {
          winnerUserId: outcome.winnerUserId,
          totalTickets: outcome.totalTickets,
          participants: outcome.participants,
        },
      });

      if (outcome.winnerUserId) {
        await (channel as TextChannel).send({ content: `<@${outcome.winnerUserId}>`, embeds: [embed] });
      } else {
        await (channel as TextChannel).send({ embeds: [embed] });
      }
    } catch (err) {
      console.error('[Lottery] announce failed:', err);
    }
  }

  private async dmWinner(client: Client, userId: string, prizeKey: string): Promise<void> {
    try {
      const user = await client.users.fetch(userId);
      const embed = buildLotteryWinnerDmEmbed(this.redemption.label(prizeKey));
      await user.send({ embeds: [embed] });
    } catch {
      /* DMs closed — reward is in /rewards wallet */
    }
  }
}
