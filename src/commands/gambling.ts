import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import Decimal from 'decimal.js';
import type { AppServices, Card } from '../types';
import { InsufficientFundsError } from '../services/EconomyService';
import { parseAmount, formatRC } from '../utils/math';
import { ephemeralReply, checkCooldown, baseEmbed, COLOR } from '../utils/discord';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Card rendering helpers
// ---------------------------------------------------------------------------

const SUIT_ICON: Record<string, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };
const DICE_FACE = ['', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];

function cardLabel(card: Card): string {
  return `${card.rank}${SUIT_ICON[card.suit] ?? card.suit}`;
}

function renderHand(hand: Card[], hideSecond = false): string {
  return hand
    .map((c, i) => (hideSecond && i === 1 ? '`▓▓`' : `\`${cardLabel(c)}\``))
    .join('  ');
}

function valueLabel(v: number, show: boolean): string {
  if (!show) return '`?`';
  if (v === 21) return `**21** ✨`;
  if (v > 21)  return `**${v}** (BUST)`;
  return `**${v}**`;
}

// ---------------------------------------------------------------------------
// Blackjack result metadata
// ---------------------------------------------------------------------------

const BJ_META: Record<string, { color: number; title: string }> = {
  blackjack:  { color: COLOR.JACKPOT, title: '🃏  BLACKJACK — Natural 21!' },
  win:        { color: COLOR.WIN,     title: '✅  Blackjack — You Win!'     },
  push:       { color: COLOR.PRIMARY, title: '🤝  Blackjack — Push'         },
  loss:       { color: COLOR.ERROR,   title: '❌  Blackjack — Dealer Wins'  },
  bust:       { color: COLOR.ERROR,   title: '💥  Blackjack — Bust!'        },
  surrender:  { color: COLOR.PRIMARY, title: '🏳️  Blackjack — Surrendered'  },
  timed_out:  { color: COLOR.ERROR,   title: '⏰  Blackjack — Timed Out'    },
  player_turn:{ color: 0x5865f2,      title: '🃏  Blackjack'                },
};

// ---------------------------------------------------------------------------
// Blackjack embed builder
// ---------------------------------------------------------------------------

function buildBlackjackEmbed(
  services: AppServices,
  playerHand: Card[],
  dealerHand: Card[],
  bet: Decimal,
  showDealer: boolean,
  status = 'player_turn',
  extras?: { result?: string; payout?: Decimal; newBalance?: Decimal }
): EmbedBuilder {
  const meta = BJ_META[status] ?? BJ_META['loss'];
  const playerValue = services.gambling.handValue(playerHand);
  const dealerValue = showDealer
    ? services.gambling.handValue(dealerHand)
    : services.gambling.handValue([dealerHand[0]]);

  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(meta.title)
    .addFields(
      {
        name: 'Your Hand',
        value: `${renderHand(playerHand)}\n${valueLabel(playerValue, true)}`,
        inline: true,
      },
      {
        name: 'Dealer',
        value: `${renderHand(dealerHand, !showDealer)}\n${valueLabel(dealerValue, showDealer)}`,
        inline: true,
      }
    )
    .setFooter({ text: `Bet: ${formatRC(bet)}  •  Guhd Rides` })
    .setTimestamp();

  if (showDealer && extras?.payout !== undefined) {
    embed.addFields(
      { name: '\u200b', value: '\u200b', inline: false },
      { name: 'Payout',      value: formatRC(extras.payout),      inline: true },
      ...(extras.newBalance !== undefined
        ? [{ name: 'New Balance', value: formatRC(extras.newBalance), inline: true }]
        : [])
    );
  }

  return embed;
}

// ---------------------------------------------------------------------------
// Blackjack buttons
// ---------------------------------------------------------------------------

function buildBlackjackButtons(
  gameId: string,
  canDouble: boolean
): ActionRowBuilder<ButtonBuilder> {
  const btns: ButtonBuilder[] = [
    new ButtonBuilder()
      .setCustomId(`bj:hit:${gameId}`)
      .setLabel('Hit')
      .setEmoji('🃏')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`bj:stand:${gameId}`)
      .setLabel('Stand')
      .setEmoji('✋')
      .setStyle(ButtonStyle.Success),
  ];

  if (canDouble) {
    btns.push(
      new ButtonBuilder()
        .setCustomId(`bj:double:${gameId}`)
        .setLabel('Double Down')
        .setEmoji('⬆️')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  btns.push(
    new ButtonBuilder()
      .setCustomId(`bj:surrender:${gameId}`)
      .setLabel('Surrender')
      .setEmoji('🏳️')
      .setStyle(ButtonStyle.Danger)
  );

  return new ActionRowBuilder<ButtonBuilder>().addComponents(...btns.slice(0, 5));
}

// ---------------------------------------------------------------------------
// Command builders
// ---------------------------------------------------------------------------

export const coinflipData = new SlashCommandBuilder()
  .setName('coinflip')
  .setDescription('Flip a coin for Route Cash')
  .addStringOption((o) => o.setName('amount').setDescription('Bet amount').setRequired(true))
  .addStringOption((o) =>
    o
      .setName('choice')
      .setDescription('Heads or tails')
      .setRequired(true)
      .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })
  );

export const diceData = new SlashCommandBuilder()
  .setName('dice')
  .setDescription('Roll the dice for Route Cash')
  .addStringOption((o) => o.setName('amount').setDescription('Bet amount').setRequired(true))
  .addIntegerOption((o) =>
    o.setName('target').setDescription('Target number 1–6').setMinValue(1).setMaxValue(6).setRequired(true)
  );

export const blackjackData = new SlashCommandBuilder()
  .setName('blackjack')
  .setDescription('Play a hand of blackjack')
  .addStringOption((o) => o.setName('bet').setDescription('Bet amount').setRequired(true));

// ---------------------------------------------------------------------------
// Coinflip handler
// ---------------------------------------------------------------------------

export async function handleCoinflip(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const cd = checkCooldown(interaction.user.id, 'coinflip', config.limits.gambleCooldownMs);
  if (cd) {
    await ephemeralReply(interaction, `Slow down — wait **${cd}s** before flipping again.`);
    return;
  }

  try {
    const amount = parseAmount(interaction.options.getString('amount', true));
    const choice = interaction.options.getString('choice', true) as 'heads' | 'tails';
    await services.user.ensureUser(interaction.user.id);
    const result = await services.gambling.coinflip(interaction.user.id, amount, choice);
    const balance = await services.economy.getBalance(interaction.user.id);

    const coinIcon = result.outcome === 'heads' ? '🟡' : '⚪';
    const choiceIcon = choice === 'heads' ? '🟡' : '⚪';

    const embed = baseEmbed(result.won ? COLOR.WIN : COLOR.ERROR, formatRC(balance), interaction.guild)
      .setTitle(result.won ? '🟡  Coinflip — You Win!' : '⚪  Coinflip — You Lose')
      .setDescription(
        `**${interaction.user.username}** bet **${formatRC(amount)}** on **${choice}** ${choiceIcon}\n\n` +
        `> The coin landed on ${coinIcon} **${result.outcome}**`
      )
      .addFields(
        { name: 'Payout',      value: formatRC(result.payout), inline: true },
        { name: 'Net',         value: (result.won ? '+' : '') + formatRC(result.net), inline: true },
        { name: 'New Balance', value: formatRC(balance),        inline: true }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, 'Not enough Route Cash for that bet.');
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Dice handler
// ---------------------------------------------------------------------------

export async function handleDice(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const cd = checkCooldown(interaction.user.id, 'dice', config.limits.gambleCooldownMs);
  if (cd) {
    await ephemeralReply(interaction, `Slow down — wait **${cd}s** before rolling again.`);
    return;
  }

  try {
    const amount = parseAmount(interaction.options.getString('amount', true));
    const target = interaction.options.getInteger('target', true);
    await services.user.ensureUser(interaction.user.id);
    const result = await services.gambling.dice(interaction.user.id, amount, target);
    const balance = await services.economy.getBalance(interaction.user.id);

    const isExact    = result.roll === target;
    const isAdjacent = !isExact && result.net.gt(0);
    const color      = isExact ? COLOR.JACKPOT : isAdjacent ? COLOR.WIN : COLOR.ERROR;

    const rolledFace = DICE_FACE[result.roll] ?? `**${result.roll}**`;
    const targetFace = DICE_FACE[target]       ?? `**${target}**`;

    const embed = baseEmbed(color, formatRC(balance), interaction.guild)
      .setTitle(
        isExact    ? '🎯  Dice — Exact Hit!'
        : isAdjacent ? '🎲  Dice — Close!'
                     : '🎲  Dice — Miss'
      )
      .setDescription(
        `**${interaction.user.username}** bet **${formatRC(amount)}** on ${targetFace} **${target}**\n\n` +
        `> Rolled ${rolledFace} — ${result.description}`
      )
      .addFields(
        { name: 'Payout',      value: formatRC(result.payout), inline: true },
        { name: 'Net',         value: formatRC(result.net),    inline: true },
        { name: 'New Balance', value: formatRC(balance),       inline: true }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, 'Not enough Route Cash for that bet.');
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Blackjack — start
// ---------------------------------------------------------------------------

export async function handleBlackjack(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  try {
    const bet = parseAmount(interaction.options.getString('bet', true));
    await services.user.ensureUser(interaction.user.id);
    const game = await services.gambling.startBlackjack(interaction.user.id, bet);

    const isCompleted = game.status === 'completed';
    const balance = isCompleted ? await services.economy.getBalance(interaction.user.id) : undefined;

    const embed = buildBlackjackEmbed(
      services,
      game.playerHand,
      game.dealerHand,
      bet,
      isCompleted,
      isCompleted ? 'blackjack' : 'player_turn',
      isCompleted && balance !== undefined
        ? { newBalance: balance }
        : undefined
    );

    const row = game.status === 'player_turn'
      ? buildBlackjackButtons(game.gameId, game.canDouble)
      : null;

    await interaction.reply({ embeds: [embed], components: row ? [row] : [], ephemeral: true });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, 'Not enough Route Cash for that bet.');
      return;
    }
    await ephemeralReply(interaction, err instanceof Error ? err.message : 'Failed to start game.');
  }
}

// ---------------------------------------------------------------------------
// Blackjack — button actions
// ---------------------------------------------------------------------------

export async function handleBlackjackButton(
  interaction: ButtonInteraction,
  services: AppServices
): Promise<void> {
  const [, action, gameId] = interaction.customId.split(':');
  if (!action || !gameId) return;

  try {
    if (action === 'hit') {
      const { playerHand, busted } = await services.gambling.hit(gameId, interaction.user.id);
      const game = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
      const bet = new Decimal(game?.bet_amount ?? 0);

      if (busted) {
        const balance = await services.economy.getBalance(interaction.user.id);
        const embed = buildBlackjackEmbed(
          services, playerHand, game?.dealer_hand_json ?? [], bet, true, 'bust',
          { payout: new Decimal(0), newBalance: balance }
        );
        await interaction.update({ embeds: [embed], components: [] });
        return;
      }

      const canDouble = game ? game.player_hand_json.length === 2 && !game.doubled : false;
      const embed = buildBlackjackEmbed(services, playerHand, game!.dealer_hand_json, bet, false);
      await interaction.update({ embeds: [embed], components: [buildBlackjackButtons(gameId, canDouble)] });

    } else if (action === 'stand') {
      const result = await services.gambling.stand(gameId, interaction.user.id);
      const game   = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
      const bet    = new Decimal(game?.bet_amount ?? 0);
      const balance = await services.economy.getBalance(interaction.user.id);

      const embed = buildBlackjackEmbed(
        services, result.playerHand, result.dealerHand, bet, true, result.result,
        { payout: result.payout, newBalance: balance }
      );
      await interaction.update({ embeds: [embed], components: [] });

    } else if (action === 'double') {
      const result  = await services.gambling.doubleDown(gameId, interaction.user.id);
      const game    = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
      const bet     = new Decimal(game?.bet_amount ?? 0);
      const balance = await services.economy.getBalance(interaction.user.id);

      const status = result.busted ? 'bust' : result.result;
      const embed = buildBlackjackEmbed(
        services, result.playerHand, result.dealerHand ?? game?.dealer_hand_json ?? [], bet, true, status,
        { payout: result.payout ?? new Decimal(0), newBalance: balance }
      );
      await interaction.update({ embeds: [embed], components: [] });

    } else if (action === 'surrender') {
      await services.gambling.surrender(gameId, interaction.user.id);
      const balance = await services.economy.getBalance(interaction.user.id);
      const game    = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
      const bet     = new Decimal(game?.bet_amount ?? 0);

      const embed = new EmbedBuilder()
        .setColor(COLOR.PRIMARY)
        .setTitle('🏳️  Blackjack — Surrendered')
        .setDescription('You surrendered. Half your bet has been returned.')
        .addFields(
          { name: 'Bet',         value: formatRC(bet),     inline: true },
          { name: 'Returned',    value: formatRC(bet.div(2)), inline: true },
          { name: 'New Balance', value: formatRC(balance), inline: true }
        )
        .setFooter({ text: 'Guhd Rides' })
        .setTimestamp();

      await interaction.update({ embeds: [embed], components: [] });
    }
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await interaction.reply({ content: 'Not enough Route Cash to double down.', ephemeral: true });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Action failed.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
}
