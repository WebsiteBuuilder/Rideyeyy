"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = exports.DETAILS_MODAL = void 0;
exports.startBooking = startBooking;
exports.execute = execute;
exports.handleBookButton = handleBookButton;
exports.handleBookModal = handleBookModal;
exports.handleBookingActionButton = handleBookingActionButton;
exports.handleReviewButton = handleReviewButton;
const discord_js_1 = require("discord.js");
const decimal_js_1 = __importDefault(require("decimal.js"));
const config_1 = require("../config");
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
        .setCustomId('preferredName')
        .setLabel('Preferred Name')
        .setStyle(discord_js_1.TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80)), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
        .setCustomId('pickup')
        .setLabel('Pickup (Google Maps link)')
        .setStyle(discord_js_1.TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(500)
        .setPlaceholder('https://maps.google.com/...')), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
        .setCustomId('destination')
        .setLabel('Dropoff (Google Maps link)')
        .setStyle(discord_js_1.TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(500)
        .setPlaceholder('https://maps.google.com/...')), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
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
/**
 * Shared booking entry point. Works from both the `/book` slash command and the
 * persistent "Book Now" button posted in the order-here channel.
 */
async function startBooking(interaction, services) {
    // Acknowledge immediately so the DB-backed preflight checks below can never
    // blow past Discord's 3s interaction window ("application did not respond").
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    if (!(await runBookPreflight(interaction, services)))
        return;
    await interaction.editReply({
        embeds: [(0, bookingEmbeds_1.buildServicePromptEmbed)()],
        components: [(0, bookingEmbeds_1.buildServiceRow)()],
    });
}
async function execute(interaction, services) {
    await startBooking(interaction, services);
}
async function handleBookButton(interaction, services) {
    // customId format: "gudhrides-book:<step>:<value>" (e.g. gudhrides-book:service:RIDE)
    const parts = interaction.customId.split(':');
    const step = parts[1];
    const value = parts[2];
    // Persistent "Book Now" button in #order-here.
    if (step === 'start') {
        await startBooking(interaction, services);
        return;
    }
    if (step === 'service') {
        const serviceType = value;
        services.booking.setDraft(interaction.user.id, { serviceType });
        if (serviceType === 'COURIER') {
            await interaction.showModal(detailsModal());
            return;
        }
        await interaction.update({
            embeds: [(0, bookingEmbeds_1.buildVehiclePromptEmbed)()],
            components: [(0, bookingEmbeds_1.buildVehicleRow)()],
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
    // Acknowledge immediately; booking creation performs several DB round-trips
    // that can otherwise exceed Discord's 3s window.
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const userId = interaction.user.id;
    const draft = services.booking.getDraft(userId);
    if (!draft?.serviceType) {
        await (0, discord_1.ephemeralReply)(interaction, 'Booking session expired. Run `/book` again.');
        return;
    }
    const preferredName = interaction.fields.getTextInputValue('preferredName').trim();
    const pickup = interaction.fields.getTextInputValue('pickup').trim();
    const destination = interaction.fields.getTextInputValue('destination').trim();
    const notes = interaction.fields.getTextInputValue('notes')?.trim() || undefined;
    if (!preferredName || !pickup || !destination) {
        await (0, discord_1.ephemeralReply)(interaction, 'Preferred name, pickup, and dropoff are required.');
        return;
    }
    try {
        const booking = await services.booking.createBooking({
            customerId: userId,
            preferredName,
            serviceType: draft.serviceType,
            vehicleType: draft.vehicleType,
            pickup,
            destination,
            notes,
        });
        await interaction.editReply({
            content: `Booking **${booking.bookingNumber}** created successfully!`,
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
const TICKET_DELETE_DELAY_MS = 30000;
function buildTranscriptText(booking, lines) {
    const header = [
        '═══════════════════════════════════════════',
        `  GUHD RIDES — Booking Transcript`,
        '═══════════════════════════════════════════',
        `Booking ID:     ${booking.bookingNumber}`,
        `Preferred Name: ${booking.preferredName ?? 'N/A'}`,
        `Service:        ${booking.serviceType}${booking.vehicleType ? ` (${booking.vehicleType})` : ''}`,
        `Pickup:         ${booking.pickup}`,
        `Dropoff:        ${booking.destination}`,
        `Notes:          ${booking.notes ?? 'N/A'}`,
        `Customer:       ${booking.customerId}`,
        `Provider:       ${booking.providerId ?? 'Unassigned'}`,
        `Status:         ${booking.status}`,
        `${booking.status === 'CANCELLED' ? 'Cancelled' : 'Completed'} At: ${new Date().toISOString()}`,
        '═══════════════════════════════════════════',
        '',
    ].join('\n');
    return `${header}${lines.join('\n')}\n`;
}
/**
 * Save a .txt transcript of the ticket channel to the transcript channel, then
 * delete the ticket channel after a short delay. Best-effort: failures here must
 * never block booking completion.
 */
async function saveTranscriptAndScheduleDelete(client, booking, channelNotice = 'Booking completed. Transcript saved — this ticket will be deleted in 30 seconds.') {
    if (!booking.channelId)
        return;
    try {
        const channel = await client.channels.fetch(booking.channelId);
        if (!channel || !channel.isTextBased() || channel.isDMBased())
            return;
        const fetched = await channel.messages.fetch({ limit: 100 });
        const lines = [...fetched.values()]
            .reverse()
            .map((m) => {
            const time = new Date(m.createdTimestamp).toISOString();
            const author = m.author?.tag ?? m.author?.id ?? 'unknown';
            const attachments = m.attachments.size > 0
                ? ' ' + [...m.attachments.values()].map((a) => `[attachment: ${a.url}]`).join(' ')
                : '';
            const embeds = m.embeds.length > 0 ? ' [embed]' : '';
            const content = m.content || (attachments || embeds ? '' : '[no text content]');
            return `[${time}] ${author}: ${content}${attachments}${embeds}`;
        });
        const transcript = buildTranscriptText(booking, lines);
        const file = new discord_js_1.AttachmentBuilder(Buffer.from(transcript, 'utf8'), {
            name: `transcript-${booking.bookingNumber}.txt`,
        });
        if (config_1.config.channels.transcript !== '0') {
            try {
                const target = await client.channels.fetch(config_1.config.channels.transcript);
                if (target?.isTextBased() && !target.isDMBased()) {
                    await target.send({
                        content: `Transcript for booking **${booking.bookingNumber}** (customer <@${booking.customerId}>, provider ${booking.providerId ? `<@${booking.providerId}>` : 'N/A'}).`,
                        files: [file],
                    });
                }
            }
            catch (err) {
                console.error('[Bot] Failed to post transcript:', err);
            }
        }
        try {
            await channel.send(channelNotice);
        }
        catch {
            /* notice is best-effort */
        }
        setTimeout(() => {
            channel.delete().catch((err) => console.error('[Bot] Failed to delete ticket channel:', err));
        }, TICKET_DELETE_DELAY_MS);
    }
    catch (err) {
        console.error('[Bot] Failed to build/save transcript:', err);
    }
}
async function handleBookingActionButton(interaction, services) {
    const [, action, bookingNumber] = interaction.customId.split(':');
    if (!action || !bookingNumber)
        return;
    // Acknowledge immediately; claim/complete/cancel each run multiple DB ops.
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
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
    if (action === 'complete' || action === 'incomplete') {
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
        if (interaction.guildId) {
            try {
                const cfg = await services.invite.admin.getConfig(interaction.guildId);
                if (cfg.lotteryEnabled && cfg.ticketsPerRide > 0) {
                    await services.lottery.grantTickets(interaction.guildId, updated.customerId, 'ride', cfg.ticketsPerRide);
                }
            }
            catch (err) {
                console.error('[Book] lottery ticket grant failed:', err);
            }
            try {
                await services.invite.reward.rewardFirstOrder(interaction.client, interaction.guildId, updated.customerId);
            }
            catch (err) {
                console.error('[Book] first-order invite bonus failed:', err);
            }
        }
        await updateTicketMessage(interaction.client, updated);
        if (action === 'complete') {
            await (0, reviewFlow_1.triggerReviewFlow)(interaction.client, updated);
        }
        const label = action === 'incomplete' ? 'marked as completed (no vouch)' : 'marked as completed';
        await (0, discord_1.ephemeralReply)(interaction, `Booking **${bookingNumber}** ${label}.`);
        await saveTranscriptAndScheduleDelete(interaction.client, updated);
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
        await saveTranscriptAndScheduleDelete(interaction.client, updated, 'Booking cancelled. Transcript saved — this ticket will be deleted in 30 seconds.');
    }
}
async function handleReviewButton(interaction, services) {
    // customId format: "gudhrides-review:rating:<bookingNumber>:<star>"
    const parts = interaction.customId.split(':');
    const bookingNumber = parts[2];
    const rating = Number(parts[3]);
    if (!bookingNumber || rating < 1 || rating > 5)
        return;
    // Acknowledge the component immediately; rating persistence + stats updates
    // run several DB ops before we edit the message.
    await interaction.deferUpdate();
    const booking = await services.booking.getByBookingNumber(bookingNumber);
    if (!booking || booking.customerId !== interaction.user.id) {
        await interaction.followUp({ content: 'You cannot rate this booking.' });
        return;
    }
    const result = await (0, reviewFlow_1.handleReviewRating)(bookingNumber, rating, services, interaction.client);
    await interaction.editReply({ content: result.message, components: [] });
}
