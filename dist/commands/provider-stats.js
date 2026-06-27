"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.handleProviderStats = handleProviderStats;
const discord_js_1 = require("discord.js");
const bookingEmbeds_1 = require("../utils/bookingEmbeds");
const discord_1 = require("../utils/discord");
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName('provider-stats')
    .setDescription('View your provider statistics');
async function handleProviderStats(interaction, services) {
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const member = (0, discord_1.memberFromInteraction)(interaction);
    if (!member || !(0, discord_1.hasProviderRole)(member)) {
        await (0, discord_1.ephemeralReply)(interaction, 'You must be a provider to use this command.');
        return;
    }
    const stats = await services.providerStats.getProviderStats(interaction.user.id);
    const embed = (0, bookingEmbeds_1.buildProviderStatsEmbed)({
        claims: stats.claims,
        completed: stats.completed,
        cancelled: stats.cancelled,
        avgRating: stats.avgRating.toFixed(2),
        revenue: stats.revenue.toFixed(2),
    }, interaction.user.id);
    await (0, discord_1.ephemeralEmbed)(interaction, embed);
}
