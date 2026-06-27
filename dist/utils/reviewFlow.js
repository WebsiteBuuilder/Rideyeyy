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
    // Persist the vouch record — best-effort; a DB hiccup here must never stop us
    // from posting the public vouch.
    try {
        const existing = await prisma_1.prisma.vouch.findUnique({ where: { bookingId: booking.id } });
        if (!existing) {
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
        }
    }
    catch (err) {
        console.error('[Bot] Failed to persist vouch record (continuing to post):', err);
    }
    if (config_1.config.channels.vouch === '0') {
        console.warn('[Bot] VOUCH_CHANNEL_ID is not set — vouch recorded but cannot be posted. ' +
            'Set VOUCH_CHANNEL_ID to your vouch channel ID.');
        return;
    }
    const channel = await client.channels.fetch(config_1.config.channels.vouch).catch(() => null);
    if (!channel) {
        console.error(`[Bot] Vouch channel ${config_1.config.channels.vouch} could not be fetched (wrong ID or missing access).`);
        return;
    }
    if (!channel.isTextBased() || channel.isDMBased()) {
        console.error(`[Bot] Vouch channel ${config_1.config.channels.vouch} is not a text channel the bot can post in.`);
        return;
    }
    try {
        const embed = (0, bookingEmbeds_1.buildVouchEmbed)(booking, `<@${booking.customerId}>`, `<@${booking.providerId}>`);
        await channel.send({ embeds: [embed] });
        console.log(`[Bot] Vouch posted to ${config_1.config.channels.vouch}: ${booking.bookingNumber}`);
    }
    catch (err) {
        console.error('[Bot] Failed to post vouch embed, trying plain-text fallback:', err);
        try {
            await channel.send(`⭐ **Vouch** — <@${booking.providerId}> rated **${booking.rating ?? 0}/5** by <@${booking.customerId}> ` +
                `(booking \`${booking.bookingNumber}\`).`);
            console.log(`[Bot] Vouch posted (plain text): ${booking.bookingNumber}`);
        }
        catch (err2) {
            console.error('[Bot] Fallback vouch post also failed:', err2);
        }
    }
}
