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
import {
  ephemeralReply,
  checkCooldown,
  COLOR,
  LINE,
  THIN_LINE,
  SPACER,
  ICON,
  BRAND,
  statBlock,
  statusBanner,
} from '../utils/discord';
import { config } from '../config';

// ═══════════════════════════════════════════════════════════════════════════
//  COMMAND DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

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
    o.setName('target').setDescription('Target number 1-6').setMinValue(1).setMaxValue(6).setRequired(true)
  );

export const blackjackData = new SlashCommandBuilder()
  .setName('blackjack')
  .setDescription('Play a hand of blackjack')
  .addStringOption((o) => o.setName('bet').setDescription('Bet amount').setRequired(true));

// ═══════════════════════════════════════════════════════════════════════════
//  COINFLIP
// ═══════════════════════════════════════════════════════════════════════════

export async function handleCoinflip(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const cd = checkCooldown(interaction.user.id, 'coinflip', config.limits.gambleCooldownMs);
  if (cd) {
    await ephemeralReply(interaction, `${ICON.time} Slow down — wait **${cd}s** before flipping again.`);
    return;
  }

  try {
    const amount = parseAmount(interaction.options.getString('amount', true));
    const choice = interaction.options.getString('choice', true) as 'heads' | 'tails';
    await services.user.ensureUser(interaction.user.id);
    const result = await services.gambling.coinflip(interaction.user.id, amount, choice);
    const balance = await services.economy.getBalance(interaction.user.id);

    const won = result.won;
    const coinIcon = result.outcome === 'heads' ? '🪙' : '⚪';
    
    const embed = new EmbedBuilder()
      .setColor(won ? COLOR.WIN : COLOR.LOSS)
      .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
      .setTitle(won ? 'WINNER!' : 'LOSS')
      .setDescription(
        statusBanner(
          won ? `${ICON.win}  YOU WIN  ${ICON.win}` : `${ICON.loss}  MISS  ${ICON.loss}`,
          won ? 'win' : 'loss'
        ) +
        `\n## ${coinIcon} ${result.outcome.toUpperCase()}\n` +
        `${LINE}\n` +
        `You bet \`${ICON.coin} ${formatRC(amount)}\` on **${choice.toUpperCase()}**`
      )
      .addFields(
        { name: SPACER, value: statBlock('PAYOUT', `${ICON.coin} ${formatRC(result.payout)}`), inline: true },
        { name: SPACER, value: statBlock(won ? 'PROFIT' : 'LOSS', won ? `\`+ ${formatRC(result.net)}\` ${ICON.up}` : `\`- ${formatRC(result.net)}\` ${ICON.down}`), inline: true },
        { name: SPACER, value: statBlock('BALANCE', `${ICON.coin} ${formatRC(balance)}`), inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, `${ICON.loss} Not enough Route Cash for that bet.`);
      return;
    }
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  DICE
// ═══════════════════════════════════════════════════════════════════════════

export async function handleDice(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const cd = checkCooldown(interaction.user.id, 'dice', config.limits.gambleCooldownMs);
  if (cd) {
    await ephemeralReply(interaction, `${ICON.time} Slow down — wait **${cd}s** before rolling again.`);
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
    const color      = isExact ? COLOR.JACKPOT : isAdjacent ? COLOR.WIN : COLOR.LOSS;
    const won        = result.net.gt(0);

    const statusText = isExact ? `${ICON.jackpot}  JACKPOT  ${ICON.jackpot}` : isAdjacent ? `${ICON.win}  CLOSE  ${ICON.win}` : `${ICON.loss}  MISS  ${ICON.loss}`;
    const style = isExact ? 'jackpot' : isAdjacent ? 'win' : 'loss';

    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
      .setTitle(isExact ? 'JACKPOT!' : isAdjacent ? 'CLOSE!' : 'MISS')
      .setDescription(
        statusBanner(statusText, style) +
        `\n## You rolled **${result.roll}**\n` +
        `${LINE}\n` +
        `Target: **${target}** for \`${ICON.coin} ${formatRC(amount)}\``
      )
      .addFields(
        { name: SPACER, value: statBlock('PAYOUT', `${ICON.coin} ${formatRC(result.payout)}`), inline: true },
        { name: SPACER, value: statBlock(won ? 'PROFIT' : 'LOSS', won ? `\`+ ${formatRC(result.net)}\` ${ICON.up}` : `\`- ${formatRC(result.net)}\` ${ICON.down}`), inline: true },
        { name: SPACER, value: statBlock('BALANCE', `${ICON.coin} ${formatRC(balance)}`), inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, `${ICON.loss} Not enough Route Cash for that bet.`);
      return;
    }
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  BLACKJACK
// ═══════════════════════════════════════════════════════════════════════════

export async function handleBlackjack(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  try {
    const bet = parseAmount(interaction.options.getString('bet', true));
    await services.user.ensureUser(interaction.user.id);

    const embed = new EmbedBuilder()
      .setColor(COLOR.WIN)
      .setAuthor({ name: `${BRAND.icon}  ${BRAND.name}` })
      .setTitle('BLACKJACK')
      .setDescription(`Starting game with bet: \`${ICON.coin} ${formatRC(bet)}\``)
      .setTimestamp()
      .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, `${ICON.loss} Not enough Route Cash for that bet.`);
      return;
    }
    await ephemeralReply(interaction, err instanceof Error ? err.message : 'Failed to start game.');
  }
}

export async function handleBlackjackButton(
  interaction: ButtonInteraction,
  services: AppServices
): Promise<void> {
  await ephemeralReply(interaction, 'Blackjack button handler not yet implemented.');
}

