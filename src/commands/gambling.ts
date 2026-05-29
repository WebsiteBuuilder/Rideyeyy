import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import type { AppServices, Card } from '../types';
import { InsufficientFundsError } from '../services/EconomyService';
import { parseAmount, formatRC } from '../utils/math';
import { ephemeralReply, checkCooldown } from '../utils/discord';
import { config } from '../config';

export const coinflipData = new SlashCommandBuilder()
  .setName('coinflip')
  .setDescription('Flip a coin for Route Cash')
  .addStringOption((o) => o.setName('amount').setDescription('Bet amount').setRequired(true))
  .addStringOption((o) =>
    o
      .setName('choice')
      .setDescription('Heads or tails')
      .setRequired(true)
      .addChoices({ name: 'heads', value: 'heads' }, { name: 'tails', value: 'tails' })
  );

export const diceData = new SlashCommandBuilder()
  .setName('dice')
  .setDescription('Roll dice for Route Cash')
  .addStringOption((o) => o.setName('amount').setDescription('Bet amount').setRequired(true))
  .addIntegerOption((o) =>
    o.setName('target').setDescription('Target number 1-6').setMinValue(1).setMaxValue(6).setRequired(true)
  );

export const blackjackData = new SlashCommandBuilder()
  .setName('blackjack')
  .setDescription('Play blackjack')
  .addStringOption((o) => o.setName('bet').setDescription('Bet amount').setRequired(true));

export async function handleCoinflip(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const cd = checkCooldown(interaction.user.id, 'coinflip', config.limits.gambleCooldownMs);
  if (cd) {
    await ephemeralReply(interaction, `Wait ${cd}s.`);
    return;
  }

  try {
    const amount = parseAmount(interaction.options.getString('amount', true));
    const choice = interaction.options.getString('choice', true) as 'heads' | 'tails';
    await services.user.ensureUser(interaction.user.id);
    const result = await services.gambling.coinflip(interaction.user.id, amount, choice);
    const msg = result.won
      ? `🎉 You won! Outcome: **${result.outcome}**. Payout: **${formatRC(result.payout)}** (net ${formatRC(result.net)})`
      : `😔 You lost. Outcome: **${result.outcome}**. Lost **${formatRC(amount)}**.`;
    await ephemeralReply(interaction, msg);
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, 'Insufficient Route Cash.');
      return;
    }
    throw err;
  }
}

export async function handleDice(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const cd = checkCooldown(interaction.user.id, 'dice', config.limits.gambleCooldownMs);
  if (cd) {
    await ephemeralReply(interaction, `Wait ${cd}s.`);
    return;
  }

  try {
    const amount = parseAmount(interaction.options.getString('amount', true));
    const target = interaction.options.getInteger('target', true);
    await services.user.ensureUser(interaction.user.id);
    const result = await services.gambling.dice(interaction.user.id, amount, target);
    await ephemeralReply(
      interaction,
      `🎲 Rolled **${result.roll}** (target ${result.target}). ${result.description}\nNet: **${formatRC(result.net)}**`
    );
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, 'Insufficient Route Cash.');
      return;
    }
    throw err;
  }
}

export async function handleBlackjack(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  try {
    const bet = parseAmount(interaction.options.getString('bet', true));
    await services.user.ensureUser(interaction.user.id);
    const game = await services.gambling.startBlackjack(interaction.user.id, bet);

    const embed = buildBlackjackEmbed(
      services,
      game.playerHand,
      game.dealerHand,
      game.status === 'completed'
    );
    const row = game.status === 'player_turn' ? buildBlackjackButtons(game.gameId) : null;

    await interaction.reply({
      embeds: [embed],
      components: row ? [row] : [],
      ephemeral: true,
    });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await ephemeralReply(interaction, 'Insufficient Route Cash.');
      return;
    }
    await ephemeralReply(interaction, err instanceof Error ? err.message : 'Error starting game.');
  }
}

function buildBlackjackEmbed(
  services: AppServices,
  playerHand: Card[],
  dealerHand: Card[],
  showDealer: boolean
): EmbedBuilder {
  const playerStr = services.gambling.formatHand(playerHand);
  const dealerStr = services.gambling.formatHand(dealerHand, !showDealer);
  return new EmbedBuilder()
    .setTitle('Blackjack')
    .addFields(
      { name: 'Your Hand', value: playerStr, inline: true },
      { name: 'Dealer', value: dealerStr, inline: true }
    );
}

function buildBlackjackButtons(gameId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`bj:hit:${gameId}`).setLabel('Hit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bj:stand:${gameId}`).setLabel('Stand').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bj:surrender:${gameId}`).setLabel('Surrender').setStyle(ButtonStyle.Danger)
  );
}

export async function handleBlackjackButton(
  interaction: ButtonInteraction,
  services: AppServices
): Promise<void> {
  const [, action, gameId] = interaction.customId.split(':');
  if (!action || !gameId) return;

  try {
    if (action === 'hit') {
      const { playerHand, busted } = await services.gambling.hit(gameId, interaction.user.id);
      if (busted) {
        await interaction.update({
          content: `Bust! Hand: ${services.gambling.formatHand(playerHand)}`,
          embeds: [],
          components: [],
        });
        return;
      }
      const game = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
      if (!game) return;
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle('Blackjack')
            .setDescription(`Your hand: ${services.gambling.formatHand(playerHand)} (${services.gambling.handValue(playerHand)})`),
        ],
        components: [buildBlackjackButtons(gameId)],
      });
    } else if (action === 'stand') {
      const result = await services.gambling.stand(gameId, interaction.user.id);
      await interaction.update({
        content: `**${result.result.toUpperCase()}** — Player: ${services.gambling.formatHand(result.playerHand)} (${services.gambling.handValue(result.playerHand)}) | Dealer: ${services.gambling.formatHand(result.dealerHand)} (${services.gambling.handValue(result.dealerHand)}) | Payout: ${formatRC(result.payout)}`,
        embeds: [],
        components: [],
      });
    } else if (action === 'surrender') {
      await services.gambling.surrender(gameId, interaction.user.id);
      await interaction.update({ content: 'Surrendered. Half bet returned.', embeds: [], components: [] });
    }
  } catch (err) {
    await interaction.reply({
      content: err instanceof Error ? err.message : 'Action failed',
      ephemeral: true,
    });
  }
}
