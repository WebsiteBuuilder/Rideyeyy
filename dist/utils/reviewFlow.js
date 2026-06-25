"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerReviewFlow = triggerReviewFlow;
exports.handleReviewRating = handleReviewRating;
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
const bookingEmbeds_1 = require("./bookingEmbeds");
const prisma_1 = require("../lib/prisma");
async function triggerReviewFlow(client, booking) {
    try {
        const customer = await client.users.fetch(booking.customerId);
        const row = new discord_js_1.ActionRowBuilder();
        for (let star = 1; star <= 5; star++) {
            row.addComponents(new discord_js_1.ButtonBuilder()
                .setCustomId(`gudhrides-review:rating:${booking.bookingNumber}:${star}`)
                .setLabel(`${star} Star${star > 1 ? 's' : ''}`)
                .setStyle(star >= 4 ? discord_js_1.ButtonStyle.Success : discord_js_1.ButtonStyle.Secondary));
        }
        await customer.send({
            content: `Your booking **${booking.bookingNumber}** has been completed! Please rate your experience:`,
            components: [row],
        });
    }
    catch (err) {
        console.error(`[Bot] Failed to DM customer for review: ${booking.customerId}`, err);
    }
}
async function handleReviewRating(bookingNumber, rating, services, client) {
    const booking = await services.booking.setRating(bookingNumber, rating);
    if (!booking) {
        return { ok: false, message: 'This booking cannot be rated or was already rated.' };
    }
    if (booking.providerId) {
        await services.providerStats.recalculateAvgRating(booking.providerId);
    }
    if (rating >= 4 && booking.providerId) {
        await createVouch(client, booking);
    }
    return { ok: true, message: `Thank you! You rated this booking **${rating}/5** stars.` };
}
async function createVouch(client, booking) {
    if (!booking.providerId)
        return;
    const existing = await prisma_1.prisma.vouch.findUnique({ where: { bookingId: booking.id } });
    if (existing)
        return;
    await prisma_1.prisma.user.upsert({
        where: { discordId: booking.customerId },
        create: { discordId: booking.customerId },
        update: {},
    });
    await prisma_1.prisma.user.upsert({
        where: { discordId: booking.providerId },
        create: { discordId: booking.providerId },
        update: {},
    });
    await prisma_1.prisma.vouch.create({
        data: {
            bookingId: booking.id,
            customerId: booking.customerId,
            providerId: booking.providerId,
            rating: booking.rating ?? 0,
        },
    });
    if (config_1.config.channels.vouch === '0') {
        console.warn('[Bot] VOUCH_CHANNEL_ID not configured; vouch saved but not posted.');
        console.log(`[Bot] Vouch Created: ${booking.bookingNumber}`);
        return;
    }
    try {
        const channel = await client.channels.fetch(config_1.config.channels.vouch);
        if (!channel?.isTextBased())
            return;
        const embed = (0, bookingEmbeds_1.buildVouchEmbed)(booking, `<@${booking.customerId}>`, `<@${booking.providerId}>`);
        await channel.send({ embeds: [embed] });
        console.log(`[Bot] Vouch Created: ${booking.bookingNumber}`);
    }
    catch (err) {
        console.error('[Bot] Failed to post vouch embed:', err);
    }
}
