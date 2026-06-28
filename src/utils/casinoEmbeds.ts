import { EmbedBuilder } from 'discord.js';
import Decimal from 'decimal.js';
import { config } from '../config';
import type { AppServices, Card } from '../types';
import { formatRC } from './math';
import { SPACER } from './discord';

// ═══════════════════════════════════════════════════════════════════════════
//  Casino embed presentation — Blackjack + Lottery (no game logic)
// ═══════════════════════════════════════════════════════════════════════════

export const BJ_COLOR = {
  active:    0x5865f2,
  win:       0x57f287,
  loss:      0xed4245,
  blackjack: 0xfee75c,
  push:      0x99aab5,
  surrender: 0x99aab5,
} as const;

export const LOTTERY_COLOR = 0xfee75c;

export type BJStatus =
  | 'player_turn'
  | 'win'
  | 'loss'
  | 'bust'
  | 'blackjack'
  | 'push'
  | 'surrender'
  | 'timed_out';

const BJ_TITLE: Record<BJStatus, string> = {
  player_turn: '🎰 ┃ YOUR TURN — Make your move!',
  bust:        '💥 ┃ BUST — Over 21!',
  blackjack:   '⚡ ┃ BLACKJACK — Perfect 21!',
  win:         '✅ ┃ YOU WIN — Nicely played!',
  loss:        '❌ ┃ DEALER WINS — Better luck next time',
  push:        '🤝 ┃ PUSH — It\'s a tie',
  surrender:   '🏳️ ┃ FOLD — Half bet returned',
  timed_out:   '⏱️ ┃ TIMED OUT — Game expired',
};

const BJ_COLOR_MAP: Record<BJStatus, number> = {
  player_turn: BJ_COLOR.active,
  win:         BJ_COLOR.win,
  loss:        BJ_COLOR.loss,
  bust:        BJ_COLOR.loss,
  blackjack:   BJ_COLOR.blackjack,
  push:        BJ_COLOR.push,
  surrender:   BJ_COLOR.surrender,
  timed_out:   BJ_COLOR.loss,
};

const SUIT_EMOJI: Record<string, string> = {
  H: '♥️',
  D: '♦️',
  C: '♣️',
  S: '♠️',
};

export function formatCard(card: Card): string {
  const suit = SUIT_EMOJI[card.suit] ?? card.suit;
  return `\`${card.rank}${suit}\``;
}

export function formatHiddenCard(): string {
  return '🂠 `?`';
}

function formatScore(value: number, revealed: boolean): string {
  if (!revealed) return '`??`';
  return `\`${value}\``;
}

function formatHandLine(hand: Card[], hideSecond: boolean): string {
  return hand
    .map((c, i) => (hideSecond && i === 1 ? formatHiddenCard() : formatCard(c)))
    .join('  ');
}

function dealerHandBlock(hand: Card[], score: number, revealed: boolean): string {
  const cards = formatHandLine(hand, !revealed);
  return `🎴 **DEALER**\n${cards}\n· Score: ${formatScore(score, revealed)}`;
}

function playerHandBlock(hand: Card[], score: number): string {
  const cards = formatHandLine(hand, false);
  return `🪙 **YOU**\n${cards}\n· Score: ${formatScore(score, true)}`;
}

export function blackjackFooter(bet: Decimal): string {
  return `🎰 GUHD RIDES Casino  ·  Bet: 💎 ${formatRC(bet)} RC`;
}

function applyBlackjackThumbnail(embed: EmbedBuilder): void {
  const url = config.assets.blackjackThumbnail;
  if (url) embed.setThumbnail(url);
}

export function buildBlackjackEmbed(
  services: AppServices,
  playerHand: Card[],
  dealerHand: Card[],
  bet: Decimal,
  showDealer: boolean,
  status: BJStatus = 'player_turn',
  extras?: { payout?: Decimal; newBalance?: Decimal }
): EmbedBuilder {
  const playerValue = services.gambling.handValue(playerHand);
  const dealerValue = showDealer
    ? services.gambling.handValue(dealerHand)
    : services.gambling.handValue([dealerHand[0]]);

  const embed = new EmbedBuilder()
    .setColor(BJ_COLOR_MAP[status] ?? BJ_COLOR.loss)
    .setTitle(BJ_TITLE[status] ?? BJ_TITLE.loss)
    .addFields(
      {
        name: '\u200b',
        value: dealerHandBlock(dealerHand, dealerValue, showDealer),
        inline: true,
      },
      {
        name: '\u200b',
        value: playerHandBlock(playerHand, playerValue),
        inline: true,
      }
    )
    .setFooter({ text: blackjackFooter(bet) })
    .setTimestamp();

  applyBlackjackThumbnail(embed);

  if (showDealer && extras?.payout !== undefined) {
    const won = extras.payout.gt(bet);
    const tied = extras.payout.eq(bet);
    const net = won ? extras.payout.sub(bet) : bet.sub(extras.payout);

    const payoutVal = tied
      ? `\`${formatRC(extras.payout)} RC\``
      : won
        ? `\`+${formatRC(extras.payout)} RC\``
        : `\`${formatRC(extras.payout)} RC\``;

    const netLabel = tied ? '💰 **Net**' : won ? '💰 **Payout**' : '📉 **Loss**';
    const netVal = tied
      ? '`Bet returned`'
      : won
        ? `\`+${formatRC(net)} RC\``
        : `\`-${formatRC(net)} RC\``;

    embed.addFields(
      { name: SPACER, value: SPACER, inline: false },
      { name: '💰 **Payout**', value: payoutVal, inline: true },
      { name: netLabel, value: netVal, inline: true },
      ...(extras.newBalance !== undefined
        ? [{ name: '🏦 **Balance**', value: `\`${formatRC(extras.newBalance)} RC\``, inline: true }]
        : [])
    );
  }

  return embed;
}

// ── Lottery ────────────────────────────────────────────────────────────────

export type LotteryEmbedMode = 'panel' | 'personal' | 'results';

export interface LotteryEmbedInput {
  mode: LotteryEmbedMode;
  prizeLabel: string;
  totalTickets: number;
  participants: number;
  nextDrawUnix?: number;
  lastWinnerUserId?: string | null;
  lastDrawUnix?: number | null;
  enabled?: boolean;
  yourTickets?: number;
  yourOdds?: string;
  /** Results mode only */
  resultsDetail?: {
    winnerUserId: string | null;
    totalTickets: number;
    participants: number;
  };
}

const LOTTERY_FOOTER = '🎰 GUHD RIDES Premium Casino  ·  Earn tickets: /daily · invites · rides';

function applyLotteryThumbnail(embed: EmbedBuilder): void {
  const url = config.assets.lotteryThumbnail;
  if (url) embed.setThumbnail(url);
}

function lotteryHowToEnter(): string {
  return (
    `\n\n> 📌 **How to earn tickets:**\n` +
    `> • \`/daily\` — Claim your daily ticket\n` +
    `> • Invite friends — Earn per invite\n` +
    `> • Complete rides — Earn per ride\n` +
    `>\n` +
    `> Check your tickets with \`/lottery\``
  );
}

function lastWinnerLine(input: LotteryEmbedInput): string {
  if (input.lastWinnerUserId) {
    const when = input.lastDrawUnix ? `<t:${input.lastDrawUnix}:D>` : 'recently';
    return `🎉 <@${input.lastWinnerUserId}> won on ${when}`;
  }
  if (input.lastDrawUnix) {
    return `No winner on <t:${input.lastDrawUnix}:D> — next time could be you!`;
  }
  return 'No winner yet — could be YOU!';
}

export function buildLotteryEmbed(input: LotteryEmbedInput): EmbedBuilder {
  const enabled = input.enabled !== false;

  if (input.mode === 'results') {
    const detail = input.resultsDetail!;
    const embed = new EmbedBuilder()
      .setColor(LOTTERY_COLOR)
      .setTitle('🏅 Weekly Lottery Results')
      .setTimestamp()
      .setFooter({ text: LOTTERY_FOOTER });

    if (detail.winnerUserId) {
      embed.setDescription(
        `> 🌟 **Grand Prize: ${input.prizeLabel}** 🌟\n\n` +
          `>>> ⚡ **WE HAVE A WINNER!** ⚡\n\n` +
          `🎉 <@${detail.winnerUserId}> takes home **${input.prizeLabel}**!\n` +
          `👥 **${detail.participants}** entrants · 🎫 **${detail.totalTickets.toLocaleString()}** tickets\n\n` +
          `_Tickets reset for the new week — earn more and try again!_`
      );
    } else {
      embed.setDescription(
        `>>> ⚡ **No winner this week** ⚡\n\n` +
          `No tickets were entered — the pot rolls over to a fresh week!\n\n` +
          `_Earn tickets with \`/daily\`, invites, and completed rides._`
      );
    }

    applyLotteryThumbnail(embed);
    return embed;
  }

  const embed = new EmbedBuilder()
    .setColor(enabled ? LOTTERY_COLOR : 0x99aab5)
    .setTitle('🎟️  GUHD RIDES WEEKLY LOTTERY')
    .setDescription(
      enabled
        ? `> 🌟 **Grand Prize: ${input.prizeLabel}** 🌟\n\n>>> ⚡ **JACKPOT IS LIVE** ⚡ — Enter now for your chance to win!`
        : `> _The lottery is currently paused by staff._`
    )
    .addFields(
      { name: '🎫 **Tickets in Pot**', value: `\`${input.totalTickets.toLocaleString()}\``, inline: true },
      { name: '👥 **Entrants**', value: `\`${input.participants}\``, inline: true },
      { name: SPACER, value: SPACER, inline: true },
      { name: SPACER, value: SPACER, inline: false },
      { name: '🏆 **Grand Prize**', value: `\`🚗  ${input.prizeLabel}\``, inline: false },
      { name: SPACER, value: SPACER, inline: false },
      ...(input.nextDrawUnix
        ? [{ name: '⏰ **Next Draw**', value: `<t:${input.nextDrawUnix}:R>  ·  <t:${input.nextDrawUnix}:F>`, inline: false }]
        : []),
      { name: SPACER, value: SPACER, inline: false },
      { name: '🏅 **Last Winner**', value: lastWinnerLine(input), inline: false }
    )
    .setFooter({ text: LOTTERY_FOOTER })
    .setTimestamp();

  if (input.mode === 'personal' && input.yourTickets !== undefined) {
    embed.addFields(
      { name: SPACER, value: SPACER, inline: false },
      { name: '🎟️ **Your Tickets**', value: `\`${input.yourTickets}\``, inline: true },
      { name: '📊 **Your Odds**', value: `\`${input.yourOdds ?? '0.0'}%\``, inline: true },
      { name: SPACER, value: SPACER, inline: true }
    );
  }

  if (enabled) {
    embed.setDescription((embed.data.description ?? '') + lotteryHowToEnter());
  }

  applyLotteryThumbnail(embed);
  return embed;
}

export function buildLotteryWinnerDmEmbed(prizeLabel: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(LOTTERY_COLOR)
    .setTitle('🎟️  YOU WON THE WEEKLY LOTTERY!')
    .setDescription(
      `>>> ⚡ **JACKPOT!** ⚡\n\n` +
        `🏆 **Grand Prize:** \`🚗  ${prizeLabel}\`\n\n` +
        `_Your reward is in your wallet — apply it during \`/book\` on your next ride!_\n` +
        `Check with \`/rewards\`.`
    )
    .setFooter({ text: LOTTERY_FOOTER })
    .setTimestamp();

  applyLotteryThumbnail(embed);
  return embed;
}
