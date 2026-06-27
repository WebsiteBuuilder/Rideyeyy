import { Client, EmbedBuilder, Guild, TextChannel } from 'discord.js';
import { InviteConfig, RedemptionSource } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { COLOR, BRAND, ICON, LINE } from '../../utils/discord';
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

    // Atomically record the draw, issue the prize code, and reset all tickets.
    await prisma.$transaction(async (tx) => {
      if (winnerUserId) {
        const code = this.redemption.generateCode();
        await tx.redemption.create({
          data: { guildId, userId: winnerUserId, rewardKey: prizeKey, code, source: RedemptionSource.LOTTERY },
        });
        redemptionCode = code;
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
    if (winnerUserId && redemptionCode) {
      await this.dmWinner(client, winnerUserId, prizeKey, redemptionCode);
    }

    return { winnerUserId, totalTickets, participants, prizeKey, redemptionCode };
  }

  private async announce(client: Client, guild: Guild, cfg: InviteConfig, outcome: DrawOutcome): Promise<void> {
    const channelId = cfg.lotteryChannelId ?? cfg.announceChannelId;
    if (!channelId || channelId === '0') return;
    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) return;

      const embed = new EmbedBuilder()
        .setColor(COLOR.JACKPOT)
        .setAuthor({ name: `${BRAND.logo}  Weekly Lottery` })
        .setTitle(`${ICON.jackpot} Weekly Lottery Results`)
        .setTimestamp();

      if (outcome.winnerUserId) {
        embed.setDescription(
          `${LINE}\n${ICON.win} Winner: <@${outcome.winnerUserId}>\n` +
            `Prize: **${this.redemption.label(outcome.prizeKey)}**\n` +
            `Entrants: **${outcome.participants}** · Tickets: **${outcome.totalTickets}**\n\n` +
            `_Tickets have been reset for the new week. Earn more by being active!_`
        );
        await (channel as TextChannel).send({ content: `<@${outcome.winnerUserId}>`, embeds: [embed] });
      } else {
        embed.setDescription(`${LINE}\nNo tickets were entered this week — no winner. A new week begins now!`);
        await (channel as TextChannel).send({ embeds: [embed] });
      }
    } catch (err) {
      console.error('[Lottery] announce failed:', err);
    }
  }

  private async dmWinner(client: Client, userId: string, prizeKey: string, code: string): Promise<void> {
    try {
      const user = await client.users.fetch(userId);
      const embed = new EmbedBuilder()
        .setColor(COLOR.WIN)
        .setAuthor({ name: `${BRAND.logo}  Weekly Lottery` })
        .setTitle(`${ICON.jackpot} You won the weekly lottery!`)
        .setDescription(`Your prize: **${this.redemption.label(prizeKey)}**\nRedemption code: \`${code}\`\n\nShow this code to staff to claim your reward.`)
        .setTimestamp();
      await user.send({ embeds: [embed] });
    } catch {
      /* DMs closed — code is still retrievable via /redeem listing */
    }
  }
}
