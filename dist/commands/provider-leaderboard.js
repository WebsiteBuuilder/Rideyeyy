"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.handleProviderLeaderboard = handleProviderLeaderboard;
const discord_js_1 = require("discord.js");
const bookingEmbeds_1 = require("../utils/bookingEmbeds");
const discord_1 = require("../utils/discord");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName('provider-leaderboard')
    .setDescription('View top providers')
    .addStringOption((o) => o
    .setName('sort')
    .setDescription('Sort criteria')
    .setRequired(true)
    .addChoices({ name: 'Completed Jobs', value: 'completed' }, { name: 'Revenue', value: 'revenue' }, { name: 'Average Rating', value: 'rating' }));
async function handleProviderLeaderboard(interaction, services) {
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const sort = interaction.options.getString('sort', true);
    let title = 'Provider Leaderboard';
    let entries = [];
    if (sort === 'completed') {
        title = 'Top Providers — Completed Jobs';
        const rows = await services.providerStats.getTopProvidersByCompletedJobs(10);
        entries = rows.map((r) => ({ discordId: r.discordId, value: `${r.completed} completed` }));
    }
    else if (sort === 'revenue') {
        title = 'Top Providers — Revenue';
        const rows = await services.providerStats.getTopProvidersByRevenue(10);
        entries = rows.map((r) => ({ discordId: r.discordId, value: `$${r.revenue.toFixed(2)}` }));
    }
    else {
        title = 'Top Providers — Average Rating';
        const rows = await services.providerStats.getTopProvidersByAverageRating(10);
        entries = rows.map((r) => ({
            discordId: r.discordId,
            value: `${r.avgRating.toFixed(2)} avg (${r.completed} jobs)`,
        }));
    }
    await (0, discord_1.ephemeralEmbed)(interaction, (0, bookingEmbeds_1.buildLeaderboardEmbed)(title, entries));
}
