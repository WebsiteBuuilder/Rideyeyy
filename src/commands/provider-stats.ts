import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { AppServices } from '../types';
import { buildProviderStatsEmbed } from '../utils/bookingEmbeds';
import { ephemeralEmbed, ephemeralReply, hasProviderRole, memberFromInteraction } from '../utils/discord';

export const data = new SlashCommandBuilder()
  .setName('provider-stats')
  .setDescription('View your provider statistics');

export async function handleProviderStats(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const member = memberFromInteraction(interaction);
  if (!member || !hasProviderRole(member)) {
    await ephemeralReply(interaction, 'You must be a provider to use this command.');
    return;
  }

  const stats = await services.providerStats.getProviderStats(interaction.user.id);
  const embed = buildProviderStatsEmbed(
    {
      claims: stats.claims,
      completed: stats.completed,
      cancelled: stats.cancelled,
      avgRating: stats.avgRating.toFixed(2),
      revenue: stats.revenue.toFixed(2),
    },
    interaction.user.id
  );
  await ephemeralEmbed(interaction, embed);
}
