import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import type { AppServices, CrateType } from '../types';
import { InsufficientFundsError } from '../services/EconomyService';
import { ephemeralReply, checkCooldown } from '../utils/discord';
import { config } from '../config';

export const data = new SlashCommandBuilder()
  .setName('crate')
  .setDescription('Open reward crates with Route Cash');

export function buildCrateButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('crate:bronze').setLabel('Bronze').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('crate:silver').setLabel('Silver').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('crate:gold').setLabel('Gold').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('crate:rewards').setLabel('View Rewards').setStyle(ButtonStyle.Secondary)
  );
}

export async function execute(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle('Route Cash Crates')
    .setDescription(
      `Bronze: ${config.crates.bronze} RC | Silver: ${config.crates.silver} RC | Gold: ${config.crates.gold} RC\nSelect a crate below.`
    );
  await interaction.reply({ embeds: [embed], components: [buildCrateButtons()], ephemeral: true });
}

export async function handleCrateButton(
  interaction: ButtonInteraction,
  services: AppServices
): Promise<void> {
  const [, action] = interaction.customId.split(':');
  if (!action) return;

  if (action === 'rewards') {
    const summary = await services.crate.getAllRewardsSummary();
    await interaction.update({
      embeds: [new EmbedBuilder().setTitle('Crate Rewards').setDescription(summary.slice(0, 4000))],
      components: [buildCrateButtons()],
    });
    return;
  }

  const crateType = action as CrateType;
  if (!['bronze', 'silver', 'gold'].includes(crateType)) return;

  const cd = checkCooldown(interaction.user.id, 'crate', config.limits.crateCooldownMs);
  if (cd) {
    await interaction.reply({ content: `Wait ${cd}s.`, ephemeral: true });
    return;
  }

  try {
    await services.user.ensureUser(interaction.user.id);
    const rewards = await services.crate.openCrate(interaction.user.id, crateType);
    const text = rewards.map((r) => r.description).join('\n');
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle(`${crateType.toUpperCase()} Crate Opened!`)
          .setDescription(text),
      ],
      components: [buildCrateButtons()],
    });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      await interaction.reply({ content: 'Insufficient Route Cash.', ephemeral: true });
      return;
    }
    await interaction.reply({
      content: err instanceof Error ? err.message : 'Failed to open crate',
      ephemeral: true,
    });
  }
}
