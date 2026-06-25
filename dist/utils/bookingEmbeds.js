"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingChannelName = bookingChannelName;
exports.buildBookingEmbed = buildBookingEmbed;
exports.buildBookingActionRow = buildBookingActionRow;
exports.buildVouchEmbed = buildVouchEmbed;
exports.buildProviderStatsEmbed = buildProviderStatsEmbed;
exports.buildLeaderboardEmbed = buildLeaderboardEmbed;
const discord_js_1 = require("discord.js");
const discord_1 = require("./discord");
// ═══════════════════════════════════════════════════════════════════════════
//  BOOKING EMBEDS & BUTTONS
// ═══════════════════════════════════════════════════════════════════════════
const SERVICE_LABELS = {
    RIDE: 'Ride',
    COURIER: 'Courier Delivery',
};
const VEHICLE_LABELS = {
    REGULAR: 'Regular',
    COMFORT: 'Comfort',
    XL: 'XL',
};
const STATUS_LABELS = {
    PENDING: 'Pending',
    CLAIMED: 'Claimed',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
};
function bookingChannelName(bookingNumber) {
    return `booking-${bookingNumber.replace(/-/g, '').toLowerCase()}`;
}
function buildBookingEmbed(booking, providerTag) {
    const vehicleLine = booking.vehicleType != null
        ? (0, discord_1.kvRow)('Vehicle', VEHICLE_LABELS[booking.vehicleType])
        : null;
    const fields = [
        (0, discord_1.kvRow)('Booking ID', `\`${booking.bookingNumber}\``),
        (0, discord_1.kvRow)('Status', STATUS_LABELS[booking.status]),
        (0, discord_1.kvRow)('Service', SERVICE_LABELS[booking.serviceType]),
        vehicleLine,
        (0, discord_1.kvRow)('Pickup', booking.pickup),
        (0, discord_1.kvRow)('Destination', booking.destination),
        (0, discord_1.kvRow)('Price', `$${booking.price.toString()}`),
        booking.notes ? (0, discord_1.kvRow)('Notes', booking.notes) : null,
        (0, discord_1.kvRow)('Customer', `<@${booking.customerId}>`),
        providerTag
            ? (0, discord_1.kvRow)('Provider', providerTag)
            : booking.providerId
                ? (0, discord_1.kvRow)('Provider', `<@${booking.providerId}>`)
                : (0, discord_1.kvRow)('Provider', 'Unassigned'),
        booking.rating != null ? (0, discord_1.kvRow)('Rating', `${booking.rating}/5`) : null,
    ].filter((line) => line !== null);
    return (0, discord_1.brandedEmbed)(discord_1.COLOR.INFO)
        .setTitle('New Booking Request')
        .setDescription(`${discord_1.LINE}\n${fields.join('\n')}`);
}
function buildBookingActionRow(bookingNumber, status) {
    const claimDisabled = status !== 'PENDING';
    const completeDisabled = status !== 'CLAIMED';
    const cancelDisabled = status === 'COMPLETED' || status === 'CANCELLED';
    return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId(`gudhrides-booking:claim:${bookingNumber}`)
        .setLabel('Claim')
        .setStyle(discord_js_1.ButtonStyle.Success)
        .setDisabled(claimDisabled), new discord_js_1.ButtonBuilder()
        .setCustomId(`gudhrides-booking:complete:${bookingNumber}`)
        .setLabel('Complete')
        .setStyle(discord_js_1.ButtonStyle.Primary)
        .setDisabled(completeDisabled), new discord_js_1.ButtonBuilder()
        .setCustomId(`gudhrides-booking:cancel:${bookingNumber}`)
        .setLabel('Cancel')
        .setStyle(discord_js_1.ButtonStyle.Danger)
        .setDisabled(cancelDisabled));
}
function buildVouchEmbed(booking, customerTag, providerTag) {
    return (0, discord_1.brandedEmbed)(discord_1.COLOR.WIN)
        .setTitle('Customer Vouch')
        .setDescription([
        discord_1.LINE,
        (0, discord_1.kvRow)('Booking', `\`${booking.bookingNumber}\``),
        (0, discord_1.kvRow)('Rating', `${'★'.repeat(booking.rating ?? 0)}${'☆'.repeat(5 - (booking.rating ?? 0))}`),
        (0, discord_1.kvRow)('Customer', customerTag),
        (0, discord_1.kvRow)('Provider', providerTag),
        (0, discord_1.kvRow)('Service', SERVICE_LABELS[booking.serviceType]),
        booking.notes ? (0, discord_1.kvRow)('Notes', booking.notes) : null,
    ]
        .filter(Boolean)
        .join('\n'));
}
function buildProviderStatsEmbed(stats, userId) {
    const total = stats.claims || 1;
    const completionRate = ((stats.completed / total) * 100).toFixed(1);
    return (0, discord_1.brandedEmbed)(discord_1.COLOR.INFO)
        .setTitle('Provider Statistics')
        .setDescription([
        (0, discord_1.statBlock)('Claims', String(stats.claims)),
        (0, discord_1.statBlock)('Completed', String(stats.completed)),
        (0, discord_1.statBlock)('Cancelled', String(stats.cancelled)),
        (0, discord_1.statBlock)('Avg Rating', stats.avgRating),
        (0, discord_1.statBlock)('Revenue', `$${stats.revenue}`),
        (0, discord_1.statBlock)('Completion Rate', `${completionRate}%`),
    ].join('\n'))
        .setFooter({ text: `Provider: ${userId}` });
}
function buildLeaderboardEmbed(title, entries) {
    const body = entries.length === 0
        ? 'No providers ranked yet.'
        : entries
            .map((e, i) => `${i + 1}. <@${e.discordId}> — ${e.value}`)
            .join('\n');
    return (0, discord_1.brandedEmbed)(discord_1.COLOR.JACKPOT).setTitle(title).setDescription(body);
}
