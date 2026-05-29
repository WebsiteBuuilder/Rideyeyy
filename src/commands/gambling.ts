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
import type Decimal from 'decimal.js';

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
    const row =
      game.status === 'player_turn' ? buildBlackjackButtons(game.gameId, game.canDouble) : null;

    const naturalBlackjack =
      game.status === 'completed' ? '🃏 **BLACKJACK!** Natural 21 — 2.5× payout applied.' : undefined;

    await interaction.reply({
      content: naturalBlackjack,
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
      { name: 'Your Hand', value: `${playerStr} (${services.gambling.handValue(playerHand)})`, inline: true },
      { name: 'Dealer', value: dealerStr, inline: true }
    );
}

function buildBlackjackButtons(gameId: string, canDouble: boolean): ActionRowBuilder<ButtonBuilder> {
  const buttons = [
    new ButtonBuilder().setCustomId(`bj:hit:${gameId}`).setLabel('Hit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bj:stand:${gameId}`).setLabel('Stand').setStyle(ButtonStyle.Success),
  ];
  if (canDouble) {
    buttons.push(
      new ButtonBuilder().setCustomId(`bj:double:${gameId}`).setLabel('Double').setStyle(ButtonStyle.Secondary)
    );
  }
  buttons.push(
    new ButtonBuilder().setCustomId(`bj:surrender:${gameId}`).setLabel('Surrender').setStyle(ButtonStyle.Danger)
  );
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(0, 5));
}

function formatBlackjackResult(
  services: AppServices,
  result: { playerHand: Card[]; dealerHand: Card[]; result: string; payout: Decimal }
): string {
  return `**${result.result.toUpperCase()}** — Player: ${services.gambling.formatHand(result.playerHand)} (${services.gambling.handValue(result.playerHand)}) | Dealer: ${services.gambling.formatHand(result.dealerHand)} (${services.gambling.handValue(result.dealerHand)}) | Payout: ${formatRC(result.payout)}`;
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
          content: `Bust! Hand: ${services.gambling.formatHand(playerHand)} (${services.gambling.handValue(playerHand)})`,
          embeds: [],
          components: [],
        });
        return;
      }
      const game = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
      const canDouble = game ? game.player_hand_json.length === 2 && !game.doubled : false;
      await interaction.update({
        embeds: [buildBlackjackEmbed(services, playerHand, game!.dealer_hand_json, false)],
        components: [buildBlackjackButtons(gameId, canDouble)],
      });
    } else if (action === 'stand') {
      const result = await services.gambling.stand(gameId, interaction.user.id);
      await interaction.update({
        content: formatBlackjackResult(services, result),
        embeds: [],
        components: [],
      });
    } else if (action === 'double') {
      const result = await services.gambling.doubleDown(gameId, interaction.user.id);
      if (result.busted) {
        await interaction.update({
          content: `Double down — Bust! Hand: ${services.gambling.formatHand(result.playerHand)}`,
          embeds: [],
          components: [],
        });
        return;
      }
      await interaction.update({
        content: formatBlackjackResult(services, result),
        embeds: [],
        components: [],
      });
    } else if (action === 'surrender') {
      await services.gambling.surrender(gameId, interaction.user.id);
      await interaction.update({ content: 'Surrendered. Half bet returned.', embeds: [], components: [] });
    }
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await interaction.reply({ content: 'Insufficient Route Cash to double down.', ephemeral: true });
      return;
    }
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: err instanceof Error ? err.message : 'Action failed',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: err instanceof Error ? err.message : 'Action failed',
        ephemeral: true,
      });
    }
  }
}
