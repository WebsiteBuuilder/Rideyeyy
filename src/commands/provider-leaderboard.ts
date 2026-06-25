import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { AppServices } from '../types';
import { buildLeaderboardEmbed } from '../utils/bookingEmbeds';
import { ephemeralEmbed } from '../utils/discord';

export const data = new SlashCommandBuilder()
  .setName('provider-leaderboard')
  .setDescription('View top providers')
  .addStringOption((o) =>
    o
      .setName('sort')
      .setDescription('Sort criteria')
      .setRequired(true)
      .addChoices(
        { name: 'Completed Jobs', value: 'completed' },
        { name: 'Revenue', value: 'revenue' },
        { name: 'Average Rating', value: 'rating' }
      )
  );

export async function handleProviderLeaderboard(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const sort = interaction.options.getString('sort', true);
  let title = 'Provider Leaderboard';
  let entries: Array<{ discordId: string; value: string }> = [];

  if (sort === 'completed') {
    title = 'Top Providers — Completed Jobs';
    const rows = await services.providerStats.getTopProvidersByCompletedJobs(10);
    entries = rows.map((r) => ({ discordId: r.discordId, value: `${r.completed} completed` }));
  } else if (sort === 'revenue') {
    title = 'Top Providers — Revenue';
    const rows = await services.providerStats.getTopProvidersByRevenue(10);
    entries = rows.map((r) => ({ discordId: r.discordId, value: `$${r.revenue.toFixed(2)}` }));
  } else {
    title = 'Top Providers — Average Rating';
    const rows = await services.providerStats.getTopProvidersByAverageRating(10);
    entries = rows.map((r) => ({
      discordId: r.discordId,
      value: `${r.avgRating.toFixed(2)} avg (${r.completed} jobs)`,
    }));
  }

  await ephemeralEmbed(interaction, buildLeaderboardEmbed(title, entries));
}
