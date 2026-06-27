"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BOOK_NOW_BUTTON_ID = void 0;
exports.bookingChannelName = bookingChannelName;
exports.buildBookingEmbed = buildBookingEmbed;
exports.buildBookingActionRow = buildBookingActionRow;
exports.buildServicePromptEmbed = buildServicePromptEmbed;
exports.buildVehiclePromptEmbed = buildVehiclePromptEmbed;
exports.buildServiceRow = buildServiceRow;
exports.buildVehicleRow = buildVehicleRow;
exports.buildOrderPanelEmbed = buildOrderPanelEmbed;
exports.buildOrderPanelRow = buildOrderPanelRow;
exports.buildInfoPanelEmbed = buildInfoPanelEmbed;
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
const SERVICE_ICON = {
    RIDE: '🚗',
    COURIER: '📦',
};
const VEHICLE_LABELS = {
    REGULAR: 'Regular',
    COMFORT: 'Comfort',
    XL: 'XL',
};
const VEHICLE_ICON = {
    REGULAR: '🚘',
    COMFORT: '✨',
    XL: '🚐',
};
const STATUS_LABELS = {
    PENDING: 'Pending',
    CLAIMED: 'Claimed',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
};
const STATUS_COLOR = {
    PENDING: discord_1.COLOR.ACTIVE,
    CLAIMED: discord_1.COLOR.JACKPOT,
    COMPLETED: discord_1.COLOR.WIN,
    CANCELLED: discord_1.COLOR.LOSS,
};
const STATUS_BANNER = {
    PENDING: { text: '◔  AWAITING PROVIDER  ◔', style: 'info' },
    CLAIMED: { text: '✦  PROVIDER ASSIGNED  ✦', style: 'jackpot' },
    COMPLETED: { text: '✓  TRIP COMPLETED  ✓', style: 'win' },
    CANCELLED: { text: '✕  CANCELLED  ✕', style: 'loss' },
};
exports.BOOK_NOW_BUTTON_ID = 'gudhrides-book:start';
function bookingChannelName(bookingNumber) {
    return `booking-${bookingNumber.replace(/-/g, '').toLowerCase()}`;
}
/** Raw, copyable monospace text (not a clickable link). */
function copyable(value) {
    const trimmed = value.trim();
    return trimmed ? `\`${trimmed}\`` : '—';
}
function buildBookingEmbed(booking, providerTag) {
    const banner = STATUS_BANNER[booking.status];
    const description = (0, discord_1.statusBanner)(banner.text, banner.style) +
        `\n${discord_1.LINE}\n` +
        `**${discord_1.ICON.arrow} Pickup**\n${copyable(booking.pickup)}\n` +
        `**${discord_1.ICON.arrow} Dropoff**\n${copyable(booking.destination)}\n` +
        (booking.notes ? `\n**${discord_1.ICON.arrow} Notes**\n${booking.notes}\n` : '');
    const embed = (0, discord_1.brandedEmbed)(STATUS_COLOR[booking.status])
        .setTitle(`${SERVICE_ICON[booking.serviceType]} ${SERVICE_LABELS[booking.serviceType]} · ${booking.bookingNumber}`)
        .setDescription(description)
        .addFields({ name: 'Preferred Name', value: booking.preferredName ?? '—', inline: true }, {
        name: 'Vehicle',
        value: booking.vehicleType ? `${VEHICLE_ICON[booking.vehicleType]} ${VEHICLE_LABELS[booking.vehicleType]}` : '—',
        inline: true,
    }, { name: 'Status', value: STATUS_LABELS[booking.status], inline: true }, { name: 'Customer', value: `<@${booking.customerId}>`, inline: true }, {
        name: 'Provider',
        value: providerTag ?? (booking.providerId ? `<@${booking.providerId}>` : '*Unassigned*'),
        inline: true,
    });
    if (booking.rating != null) {
        embed.addFields({
            name: 'Rating',
            value: `${'★'.repeat(booking.rating)}${'☆'.repeat(5 - booking.rating)}`,
            inline: true,
        });
    }
    return embed;
}
function buildBookingActionRow(bookingNumber, status) {
    const claimDisabled = status !== 'PENDING';
    const completeDisabled = status !== 'CLAIMED';
    const cancelDisabled = status === 'COMPLETED' || status === 'CANCELLED';
    return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId(`gudhrides-booking:claim:${bookingNumber}`)
        .setLabel('Claim')
        .setEmoji('✋')
        .setStyle(discord_js_1.ButtonStyle.Success)
        .setDisabled(claimDisabled), new discord_js_1.ButtonBuilder()
        .setCustomId(`gudhrides-booking:complete:${bookingNumber}`)
        .setLabel('Complete')
        .setEmoji('✅')
        .setStyle(discord_js_1.ButtonStyle.Primary)
        .setDisabled(completeDisabled), new discord_js_1.ButtonBuilder()
        .setCustomId(`gudhrides-booking:cancel:${bookingNumber}`)
        .setLabel('Cancel')
        .setEmoji('🛑')
        .setStyle(discord_js_1.ButtonStyle.Danger)
        .setDisabled(cancelDisabled));
}
// ── Selection prompts (ephemeral, shown to the customer) ────────────────────
function buildServicePromptEmbed() {
    return (0, discord_1.brandedEmbed)(discord_1.COLOR.ELECTRIC)
        .setTitle('🚗 New Booking')
        .setDescription((0, discord_1.statusBanner)('◈  STEP 1 OF 3  ·  SERVICE  ◈', 'info') +
        `\n${discord_1.LINE}\n` +
        `Choose what you need below.\n\n` +
        `${SERVICE_ICON.RIDE} **Ride** ${discord_1.ICON.arrow} get a lift from A to B\n` +
        `${SERVICE_ICON.COURIER} **Courier Delivery** ${discord_1.ICON.arrow} send a package`);
}
function buildVehiclePromptEmbed() {
    return (0, discord_1.brandedEmbed)(discord_1.COLOR.ELECTRIC)
        .setTitle('🚗 New Booking')
        .setDescription((0, discord_1.statusBanner)('◈  STEP 2 OF 3  ·  VEHICLE  ◈', 'info') +
        `\n${discord_1.LINE}\n` +
        `Pick the vehicle class for your ride.\n\n` +
        `${VEHICLE_ICON.REGULAR} **Regular** ${discord_1.ICON.arrow} standard\n` +
        `${VEHICLE_ICON.COMFORT} **Comfort** ${discord_1.ICON.arrow} premium\n` +
        `${VEHICLE_ICON.XL} **XL** ${discord_1.ICON.arrow} extra space`);
}
function buildServiceRow() {
    return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId('gudhrides-book:service:RIDE')
        .setLabel('Ride')
        .setEmoji('🚗')
        .setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder()
        .setCustomId('gudhrides-book:service:COURIER')
        .setLabel('Courier Delivery')
        .setEmoji('📦')
        .setStyle(discord_js_1.ButtonStyle.Secondary));
}
function buildVehicleRow() {
    return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId('gudhrides-book:vehicle:REGULAR')
        .setLabel('Regular')
        .setEmoji('🚘')
        .setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
        .setCustomId('gudhrides-book:vehicle:COMFORT')
        .setLabel('Comfort')
        .setEmoji('✨')
        .setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder()
        .setCustomId('gudhrides-book:vehicle:XL')
        .setLabel('XL')
        .setEmoji('🚐')
        .setStyle(discord_js_1.ButtonStyle.Success));
}
// ── Order-here panel (persistent Book Now button) ───────────────────────────
function buildOrderPanelEmbed() {
    return (0, discord_1.brandedEmbed)(discord_1.COLOR.ELECTRIC)
        .setTitle('🚗 Book a Ride or Delivery')
        .setDescription((0, discord_1.statusBanner)('◈  GUHD RIDES  ·  ORDER HERE  ◈', 'info') +
        `\n${discord_1.LINE}\n` +
        `Tap **Book Now** to start. You'll be guided through:\n\n` +
        `**1.** ${discord_1.ICON.arrow} Choose Ride or Courier\n` +
        `**2.** ${discord_1.ICON.arrow} Pick your vehicle (rides)\n` +
        `**3.** ${discord_1.ICON.arrow} Paste your pickup & dropoff Google Maps links\n\n` +
        `A private booking ticket opens for you and a provider. ${discord_1.ICON.check}`);
}
function buildOrderPanelRow() {
    return new discord_js_1.ActionRowBuilder().addComponents((0, discord_1.actionButton)(exports.BOOK_NOW_BUTTON_ID, 'Book Now', discord_js_1.ButtonStyle.Success));
}
// ── Editable info panels (/invite, /howto) ──────────────────────────────────
function buildInfoPanelEmbed(title, icon, content, color = discord_1.COLOR.INFO) {
    return (0, discord_1.brandedEmbed)(color)
        .setTitle(`${icon} ${title}`)
        .setDescription(`${discord_1.LINE}\n${content}\n${discord_1.SPACER}`);
}
function buildVouchEmbed(booking, customerTag, providerTag) {
    return (0, discord_1.brandedEmbed)(discord_1.COLOR.WIN)
        .setTitle('⭐ Customer Vouch')
        .setDescription((0, discord_1.statusBanner)(`${discord_1.ICON.win}  VERIFIED REVIEW  ${discord_1.ICON.win}`, 'win') +
        `\n${discord_1.LINE}\n` +
        `**${'★'.repeat(booking.rating ?? 0)}${'☆'.repeat(5 - (booking.rating ?? 0))}**  (${booking.rating ?? 0}/5)\n` +
        (booking.notes ? `\n> ${booking.notes}\n` : ''))
        .addFields({ name: 'Booking', value: `\`${booking.bookingNumber}\``, inline: true }, { name: 'Service', value: SERVICE_LABELS[booking.serviceType], inline: true }, { name: 'Rating', value: `${booking.rating ?? 0}/5`, inline: true }, { name: 'Customer', value: customerTag, inline: true }, { name: 'Provider', value: providerTag, inline: true })
        .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` });
}
function buildProviderStatsEmbed(stats, userId) {
    const total = stats.claims || 1;
    const completionRate = ((stats.completed / total) * 100).toFixed(1);
    return (0, discord_1.brandedEmbed)(discord_1.COLOR.INFO)
        .setTitle('📊 Provider Statistics')
        .setDescription((0, discord_1.statusBanner)('◈  PERFORMANCE  ◈', 'info') + `\n${discord_1.LINE}`)
        .addFields({ name: 'Claims', value: String(stats.claims), inline: true }, { name: 'Completed', value: String(stats.completed), inline: true }, { name: 'Cancelled', value: String(stats.cancelled), inline: true }, { name: 'Avg Rating', value: `${stats.avgRating} ★`, inline: true }, { name: 'Completion', value: `${completionRate}%`, inline: true }, { name: discord_1.SPACER, value: discord_1.SPACER, inline: true })
        .setFooter({ text: `Provider: ${userId}` });
}
function buildLeaderboardEmbed(title, entries) {
    const medals = ['🥇', '🥈', '🥉'];
    const body = entries.length === 0
        ? 'No providers ranked yet.'
        : entries
            .map((e, i) => `${medals[i] ?? `\`#${i + 1}\``}  <@${e.discordId}> ${discord_1.ICON.arrow} **${e.value}**`)
            .join('\n');
    return (0, discord_1.brandedEmbed)(discord_1.COLOR.JACKPOT)
        .setTitle(`🏆 ${title}`)
        .setDescription((0, discord_1.statusBanner)(`${discord_1.ICON.jackpot}  TOP PROVIDERS  ${discord_1.ICON.jackpot}`, 'jackpot') + `\n${discord_1.LINE}\n${body}`);
}
