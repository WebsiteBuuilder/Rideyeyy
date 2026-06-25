"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = exports.DETAILS_MODAL = void 0;
exports.execute = execute;
exports.handleBookButton = handleBookButton;
exports.handleBookModal = handleBookModal;
exports.handleBookingActionButton = handleBookingActionButton;
exports.handleReviewButton = handleReviewButton;
const discord_js_1 = require("discord.js");
const decimal_js_1 = __importDefault(require("decimal.js"));
const config_1 = require("../config");
const math_1 = require("../utils/math");
const discord_1 = require("../utils/discord");
const bookingEmbeds_1 = require("../utils/bookingEmbeds");
const reviewFlow_1 = require("../utils/reviewFlow");
// Discord does not allow opening a modal in response to a modal submission,
// so all booking details are collected in a single modal (max 5 inputs)
// opened from the service/vehicle selection buttons.
exports.DETAILS_MODAL = 'gudhrides-book-details-modal';
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName('book')
    .setDescription('Book a ride or courier delivery with GUHD RIDES');
function detailsModal() {
    return new discord_js_1.ModalBuilder()
        .setCustomId(exports.DETAILS_MODAL)
        .setTitle('Booking Details')
        .addComponents(new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
        .setCustomId('pickup')
        .setLabel('Pickup Address')
        .setStyle(discord_js_1.TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500)), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
        .setCustomId('destination')
        .setLabel('Destination Address')
        .setStyle(discord_js_1.TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500)), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
        .setCustomId('price')
        .setLabel('Offered Price (USD)')
        .setStyle(discord_js_1.TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(20)
        .setPlaceholder('25.00')), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
        .setCustomId('notes')
        .setLabel('Additional Notes (optional)')
        .setStyle(discord_js_1.TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500)));
}
async function runBookPreflight(interaction, services) {
    if (!interaction.inGuild()) {
        await (0, discord_1.ephemeralReply)(interaction, 'Bookings must be created inside a server.');
        return false;
    }
    const userId = interaction.user.id;
    if (await services.blacklist.isBlacklisted(userId)) {
        await (0, discord_1.ephemeralReply)(interaction, 'You are not permitted to create bookings.');
        return false;
    }
    const cd = (0, discord_1.checkCooldown)(userId, 'book', config_1.config.limits.bookCooldownMs);
    if (cd) {
        await (0, discord_1.ephemeralReply)(interaction, `Please wait **${cd}s** before starting another booking.`);
        return false;
    }
    const active = await services.booking.countActiveBookings(userId);
    if (active >= 3) {
        await (0, discord_1.ephemeralReply)(interaction, 'You already have **3** active bookings. Complete or cancel one first.');
        return false;
    }
    return true;
}
async function execute(interaction, services) {
    if (!(await runBookPreflight(interaction, services)))
        return;
    const row = new discord_js_1.ActionRowBuilder().addComponents((0, discord_1.actionButton)('gudhrides-book:service:RIDE', 'Ride', discord_js_1.ButtonStyle.Primary), (0, discord_1.actionButton)('gudhrides-book:service:COURIER', 'Courier Delivery', discord_js_1.ButtonStyle.Secondary));
    await interaction.reply({
        content: 'Select a **service type** to begin your booking:',
        components: [row],
        ephemeral: true,
    });
}
async function handleBookButton(interaction, services) {
    const parts = interaction.customId.split(':');
    const step = parts[2];
    const value = parts[3];
    if (step === 'service') {
        const serviceType = value;
        services.booking.setDraft(interaction.user.id, { serviceType });
        if (serviceType === 'COURIER') {
            await interaction.showModal(detailsModal());
            return;
        }
        const row = new discord_js_1.ActionRowBuilder().addComponents((0, discord_1.actionButton)('gudhrides-book:vehicle:REGULAR', 'Regular', discord_js_1.ButtonStyle.Secondary), (0, discord_1.actionButton)('gudhrides-book:vehicle:COMFORT', 'Comfort', discord_js_1.ButtonStyle.Primary), (0, discord_1.actionButton)('gudhrides-book:vehicle:XL', 'XL', discord_js_1.ButtonStyle.Success));
        await interaction.update({
            content: 'Select a **vehicle type**:',
            components: [row],
        });
        return;
    }
    if (step === 'vehicle') {
        const draft = services.booking.getDraft(interaction.user.id);
        if (!draft?.serviceType) {
            await (0, discord_1.ephemeralReply)(interaction, 'Booking session expired. Run `/book` again.');
            return;
        }
        services.booking.setDraft(interaction.user.id, {
            ...draft,
            vehicleType: value,
        });
        await interaction.showModal(detailsModal());
    }
}
async function handleBookModal(interaction, services) {
    if (interaction.customId !== exports.DETAILS_MODAL)
        return;
    const userId = interaction.user.id;
    const draft = services.booking.getDraft(userId);
    if (!draft?.serviceType) {
        await (0, discord_1.ephemeralReply)(interaction, 'Booking session expired. Run `/book` again.');
        return;
    }
    const pickup = interaction.fields.getTextInputValue('pickup').trim();
    const destination = interaction.fields.getTextInputValue('destination').trim();
    const notes = interaction.fields.getTextInputValue('notes')?.trim() || undefined;
    if (!pickup || !destination) {
        await (0, discord_1.ephemeralReply)(interaction, 'Pickup and destination are required.');
        return;
    }
    let price;
    try {
        price = (0, math_1.parseAmount)(interaction.fields.getTextInputValue('price'));
    }
    catch {
        await (0, discord_1.ephemeralReply)(interaction, 'Invalid price. Enter a positive number (e.g. `25.00`).');
        return;
    }
    try {
        const booking = await services.booking.createBooking({
            customerId: userId,
            serviceType: draft.serviceType,
            vehicleType: draft.vehicleType,
            pickup,
            destination,
            price,
            notes,
        });
        await interaction.reply({
            content: `Booking **${booking.bookingNumber}** created successfully!`,
            ephemeral: true,
        });
        await createTicketChannel(interaction.client, interaction.guildId, booking, services);
    }
    catch (err) {
        const msg = err instanceof Error && err.message === 'DUPLICATE_ROUTE'
            ? 'You already have an active booking with the same pickup and destination.'
            : 'Failed to create booking. Please try again.';
        await (0, discord_1.ephemeralReply)(interaction, msg);
    }
}
async function createTicketChannel(client, guildId, booking, services) {
    if (config_1.config.channels.bookingCategory === '0') {
        console.warn('[Bot] BOOKING_CATEGORY_ID not configured; ticket channel skipped.');
        return;
    }
    try {
        const guild = await client.guilds.fetch(guildId);
        const overwrites = [
            { id: guild.roles.everyone.id, deny: [discord_js_1.PermissionFlagsBits.ViewChannel] },
            {
                id: booking.customerId,
                allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages],
                type: discord_js_1.OverwriteType.Member,
            },
        ];
        if (config_1.config.roles.provider !== '0') {
            overwrites.push({
                id: config_1.config.roles.provider,
                allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages],
                type: discord_js_1.OverwriteType.Role,
            });
        }
        if (config_1.config.roles.admin !== '0') {
            overwrites.push({
                id: config_1.config.roles.admin,
                allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages],
                type: discord_js_1.OverwriteType.Role,
            });
        }
        if (config_1.config.roles.staff !== '0') {
            overwrites.push({
                id: config_1.config.roles.staff,
                allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages],
                type: discord_js_1.OverwriteType.Role,
            });
        }
        const channel = await guild.channels.create({
            name: (0, bookingEmbeds_1.bookingChannelName)(booking.bookingNumber),
            type: discord_js_1.ChannelType.GuildText,
            parent: config_1.config.channels.bookingCategory,
            permissionOverwrites: overwrites,
        });
        const embed = (0, bookingEmbeds_1.buildBookingEmbed)(booking);
        const row = (0, bookingEmbeds_1.buildBookingActionRow)(booking.bookingNumber, booking.status);
        const msg = await channel.send({ embeds: [embed], components: [row] });
        await services.booking.updateTicketRefs(booking.bookingNumber, channel.id, msg.id);
    }
    catch (err) {
        console.error('[Bot] Failed to create booking ticket channel:', err);
    }
}
async function updateTicketMessage(client, booking, providerTag) {
    if (!booking.channelId || !booking.messageId)
        return;
    try {
        const channel = await client.channels.fetch(booking.channelId);
        if (!channel?.isTextBased())
            return;
        const msg = await channel.messages.fetch(booking.messageId);
        const embed = (0, bookingEmbeds_1.buildBookingEmbed)(booking, providerTag);
        const row = (0, bookingEmbeds_1.buildBookingActionRow)(booking.bookingNumber, booking.status);
        await msg.edit({ embeds: [embed], components: [row] });
    }
    catch (err) {
        console.error('[Bot] Failed to update booking embed:', err);
    }
}
async function handleBookingActionButton(interaction, services) {
    const [, action, bookingNumber] = interaction.customId.split(':');
    if (!action || !bookingNumber)
        return;
    const booking = await services.booking.getByBookingNumber(bookingNumber);
    if (!booking) {
        await (0, discord_1.ephemeralReply)(interaction, 'Booking not found.');
        return;
    }
    if (booking.channelId && interaction.channelId !== booking.channelId) {
        await (0, discord_1.ephemeralReply)(interaction, 'Invalid booking channel.');
        return;
    }
    const member = interaction.member;
    if (action === 'claim') {
        if (!member || !(0, discord_1.hasProviderRole)(member)) {
            await (0, discord_1.ephemeralReply)(interaction, 'Only providers can claim bookings.');
            return;
        }
        const updated = await services.booking.claimBooking(bookingNumber, interaction.user.id);
        if (!updated) {
            await (0, discord_1.ephemeralReply)(interaction, 'This booking has already been claimed.');
            return;
        }
        await services.providerStats.incrementClaims(interaction.user.id);
        await updateTicketMessage(interaction.client, updated, `<@${interaction.user.id}>`);
        try {
            const customer = await interaction.client.users.fetch(updated.customerId);
            await customer.send(`Your booking **${updated.bookingNumber}** has been claimed by <@${interaction.user.id}>.`);
        }
        catch {
            /* DM optional */
        }
        await (0, discord_1.ephemeralReply)(interaction, `You claimed booking **${bookingNumber}**.`);
        return;
    }
    if (action === 'complete') {
        if (interaction.user.id !== booking.providerId) {
            await (0, discord_1.ephemeralReply)(interaction, 'Only the assigned provider can complete this booking.');
            return;
        }
        const updated = await services.booking.completeBooking(bookingNumber, interaction.user.id);
        if (!updated) {
            await (0, discord_1.ephemeralReply)(interaction, 'Unable to complete this booking.');
            return;
        }
        await services.providerStats.incrementCompleted(interaction.user.id, new decimal_js_1.default(updated.price.toString()));
        await updateTicketMessage(interaction.client, updated);
        await (0, reviewFlow_1.triggerReviewFlow)(interaction.client, updated);
        await (0, discord_1.ephemeralReply)(interaction, `Booking **${bookingNumber}** marked as completed.`);
        return;
    }
    if (action === 'cancel') {
        if (!member || !(0, discord_1.hasStaffRole)(member)) {
            await (0, discord_1.ephemeralReply)(interaction, 'Only management can cancel bookings.');
            return;
        }
        const updated = await services.booking.cancelBooking(bookingNumber);
        if (!updated) {
            await (0, discord_1.ephemeralReply)(interaction, 'This booking cannot be cancelled.');
            return;
        }
        if (updated.providerId) {
            await services.providerStats.incrementCancelled(updated.providerId);
        }
        await updateTicketMessage(interaction.client, updated);
        await (0, discord_1.ephemeralReply)(interaction, `Booking **${bookingNumber}** has been cancelled.`);
    }
}
async function handleReviewButton(interaction, services) {
    const parts = interaction.customId.split(':');
    const bookingNumber = parts[3];
    const rating = Number(parts[4]);
    if (!bookingNumber || rating < 1 || rating > 5)
        return;
    const booking = await services.booking.getByBookingNumber(bookingNumber);
    if (!booking || booking.customerId !== interaction.user.id) {
        await (0, discord_1.ephemeralReply)(interaction, 'You cannot rate this booking.');
        return;
    }
    const result = await (0, reviewFlow_1.handleReviewRating)(bookingNumber, rating, services, interaction.client);
    await interaction.update({ content: result.message, components: [] });
}
