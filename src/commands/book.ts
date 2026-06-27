import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  GuildMember,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  OverwriteType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { Booking, ServiceType, VehicleType } from '@prisma/client';
import Decimal from 'decimal.js';
import { config } from '../config';
import type { AppServices } from '../types';
import { parseAmount } from '../utils/math';
import {
  actionButton,
  checkCooldown,
  ephemeralReply,
  hasProviderRole,
  hasStaffRole,
  memberFromInteraction,
} from '../utils/discord';
import {
  bookingChannelName,
  buildBookingActionRow,
  buildBookingEmbed,
} from '../utils/bookingEmbeds';
import { triggerReviewFlow, handleReviewRating } from '../utils/reviewFlow';

// Discord does not allow opening a modal in response to a modal submission,
// so all booking details are collected in a single modal (max 5 inputs)
// opened from the service/vehicle selection buttons.
export const DETAILS_MODAL = 'gudhrides-book-details-modal';

export const data = new SlashCommandBuilder()
  .setName('book')
  .setDescription('Book a ride or courier delivery with GUHD RIDES');

function detailsModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(DETAILS_MODAL)
    .setTitle('Booking Details')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('pickup')
          .setLabel('Pickup Address')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('destination')
          .setLabel('Destination Address')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('price')
          .setLabel('Offered Price (USD)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(20)
          .setPlaceholder('25.00')
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel('Additional Notes (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
      )
    );
}

async function runBookPreflight(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<boolean> {
  if (!interaction.inGuild()) {
    await ephemeralReply(interaction, 'Bookings must be created inside a server.');
    return false;
  }
  const userId = interaction.user.id;
  if (await services.blacklist.isBlacklisted(userId)) {
    await ephemeralReply(interaction, 'You are not permitted to create bookings.');
    return false;
  }
  const cd = checkCooldown(userId, 'book', config.limits.bookCooldownMs);
  if (cd) {
    await ephemeralReply(interaction, `Please wait **${cd}s** before starting another booking.`);
    return false;
  }
  const active = await services.booking.countActiveBookings(userId);
  if (active >= 3) {
    await ephemeralReply(interaction, 'You already have **3** active bookings. Complete or cancel one first.');
    return false;
  }
  return true;
}

export async function execute(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  // Acknowledge immediately so the DB-backed preflight checks below can never
  // blow past Discord's 3s interaction window ("application did not respond").
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!(await runBookPreflight(interaction, services))) return;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    actionButton('gudhrides-book:service:RIDE', 'Ride', ButtonStyle.Primary),
    actionButton('gudhrides-book:service:COURIER', 'Courier Delivery', ButtonStyle.Secondary)
  );
  await interaction.editReply({
    content: 'Select a **service type** to begin your booking:',
    components: [row],
  });
}

export async function handleBookButton(
  interaction: ButtonInteraction,
  services: AppServices
): Promise<void> {
  // customId format: "gudhrides-book:<step>:<value>" (e.g. gudhrides-book:service:RIDE)
  const parts = interaction.customId.split(':');
  const step = parts[1];
  const value = parts[2];

  if (step === 'service') {
    const serviceType = value as ServiceType;
    services.booking.setDraft(interaction.user.id, { serviceType });
    if (serviceType === 'COURIER') {
      await interaction.showModal(detailsModal());
      return;
    }
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      actionButton('gudhrides-book:vehicle:REGULAR', 'Regular', ButtonStyle.Secondary),
      actionButton('gudhrides-book:vehicle:COMFORT', 'Comfort', ButtonStyle.Primary),
      actionButton('gudhrides-book:vehicle:XL', 'XL', ButtonStyle.Success)
    );
    await interaction.update({
      content: 'Select a **vehicle type**:',
      components: [row],
    });
    return;
  }

  if (step === 'vehicle') {
    const draft = services.booking.getDraft(interaction.user.id);
    if (!draft?.serviceType) {
      await ephemeralReply(interaction, 'Booking session expired. Run `/book` again.');
      return;
    }
    services.booking.setDraft(interaction.user.id, {
      ...draft,
      vehicleType: value as VehicleType,
    });
    await interaction.showModal(detailsModal());
  }
}

export async function handleBookModal(
  interaction: ModalSubmitInteraction,
  services: AppServices
): Promise<void> {
  if (interaction.customId !== DETAILS_MODAL) return;

  // Acknowledge immediately; booking creation performs several DB round-trips
  // that can otherwise exceed Discord's 3s window.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const userId = interaction.user.id;
  const draft = services.booking.getDraft(userId);
  if (!draft?.serviceType) {
    await ephemeralReply(interaction, 'Booking session expired. Run `/book` again.');
    return;
  }

  const pickup = interaction.fields.getTextInputValue('pickup').trim();
  const destination = interaction.fields.getTextInputValue('destination').trim();
  const notes = interaction.fields.getTextInputValue('notes')?.trim() || undefined;

  if (!pickup || !destination) {
    await ephemeralReply(interaction, 'Pickup and destination are required.');
    return;
  }

  let price: Decimal;
  try {
    price = parseAmount(interaction.fields.getTextInputValue('price'));
  } catch {
    await ephemeralReply(interaction, 'Invalid price. Enter a positive number (e.g. `25.00`).');
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
    await interaction.editReply({
      content: `Booking **${booking.bookingNumber}** created successfully!`,
    });
    await createTicketChannel(interaction.client, interaction.guildId!, booking, services);
  } catch (err) {
    const msg = err instanceof Error && err.message === 'DUPLICATE_ROUTE'
      ? 'You already have an active booking with the same pickup and destination.'
      : 'Failed to create booking. Please try again.';
    await ephemeralReply(interaction, msg);
  }
}

async function createTicketChannel(
  client: Client,
  guildId: string,
  booking: Booking,
  services: AppServices
): Promise<void> {
  if (config.channels.bookingCategory === '0') {
    console.warn('[Bot] BOOKING_CATEGORY_ID not configured; ticket channel skipped.');
    return;
  }

  try {
    const guild = await client.guilds.fetch(guildId);
    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: booking.customerId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        type: OverwriteType.Member,
      },
    ];
    if (config.roles.provider !== '0') {
      overwrites.push({
        id: config.roles.provider,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        type: OverwriteType.Role,
      });
    }
    if (config.roles.admin !== '0') {
      overwrites.push({
        id: config.roles.admin,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        type: OverwriteType.Role,
      });
    }
    if (config.roles.staff !== '0') {
      overwrites.push({
        id: config.roles.staff,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        type: OverwriteType.Role,
      });
    }

    const channel = await guild.channels.create({
      name: bookingChannelName(booking.bookingNumber),
      type: ChannelType.GuildText,
      parent: config.channels.bookingCategory,
      permissionOverwrites: overwrites,
    });

    const embed = buildBookingEmbed(booking);
    const row = buildBookingActionRow(booking.bookingNumber, booking.status);
    const msg = await (channel as TextChannel).send({ embeds: [embed], components: [row] });
    await services.booking.updateTicketRefs(booking.bookingNumber, channel.id, msg.id);
  } catch (err) {
    console.error('[Bot] Failed to create booking ticket channel:', err);
  }
}

async function updateTicketMessage(
  client: Client,
  booking: Booking,
  providerTag?: string
): Promise<void> {
  if (!booking.channelId || !booking.messageId) return;
  try {
    const channel = await client.channels.fetch(booking.channelId);
    if (!channel?.isTextBased()) return;
    const msg = await channel.messages.fetch(booking.messageId);
    const embed = buildBookingEmbed(booking, providerTag);
    const row = buildBookingActionRow(booking.bookingNumber, booking.status);
    await msg.edit({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('[Bot] Failed to update booking embed:', err);
  }
}

export async function handleBookingActionButton(
  interaction: ButtonInteraction,
  services: AppServices
): Promise<void> {
  const [, action, bookingNumber] = interaction.customId.split(':');
  if (!action || !bookingNumber) return;

  // Acknowledge immediately; claim/complete/cancel each run multiple DB ops.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const booking = await services.booking.getByBookingNumber(bookingNumber);
  if (!booking) {
    await ephemeralReply(interaction, 'Booking not found.');
    return;
  }
  if (booking.channelId && interaction.channelId !== booking.channelId) {
    await ephemeralReply(interaction, 'Invalid booking channel.');
    return;
  }

  const member = interaction.member as GuildMember | null;

  if (action === 'claim') {
    if (!member || !hasProviderRole(member)) {
      await ephemeralReply(interaction, 'Only providers can claim bookings.');
      return;
    }
    const updated = await services.booking.claimBooking(bookingNumber, interaction.user.id);
    if (!updated) {
      await ephemeralReply(interaction, 'This booking has already been claimed.');
      return;
    }
    await services.providerStats.incrementClaims(interaction.user.id);
    await updateTicketMessage(interaction.client, updated, `<@${interaction.user.id}>`);
    try {
      const customer = await interaction.client.users.fetch(updated.customerId);
      await customer.send(
        `Your booking **${updated.bookingNumber}** has been claimed by <@${interaction.user.id}>.`
      );
    } catch {
      /* DM optional */
    }
    await ephemeralReply(interaction, `You claimed booking **${bookingNumber}**.`);
    return;
  }

  if (action === 'complete') {
    if (interaction.user.id !== booking.providerId) {
      await ephemeralReply(interaction, 'Only the assigned provider can complete this booking.');
      return;
    }
    const updated = await services.booking.completeBooking(bookingNumber, interaction.user.id);
    if (!updated) {
      await ephemeralReply(interaction, 'Unable to complete this booking.');
      return;
    }
    await services.providerStats.incrementCompleted(
      interaction.user.id,
      new Decimal(updated.price.toString())
    );
    await updateTicketMessage(interaction.client, updated);
    await triggerReviewFlow(interaction.client, updated);
    await ephemeralReply(interaction, `Booking **${bookingNumber}** marked as completed.`);
    return;
  }

  if (action === 'cancel') {
    if (!member || !hasStaffRole(member)) {
      await ephemeralReply(interaction, 'Only management can cancel bookings.');
      return;
    }
    const updated = await services.booking.cancelBooking(bookingNumber);
    if (!updated) {
      await ephemeralReply(interaction, 'This booking cannot be cancelled.');
      return;
    }
    if (updated.providerId) {
      await services.providerStats.incrementCancelled(updated.providerId);
    }
    await updateTicketMessage(interaction.client, updated);
    await ephemeralReply(interaction, `Booking **${bookingNumber}** has been cancelled.`);
  }
}

export async function handleReviewButton(
  interaction: ButtonInteraction,
  services: AppServices
): Promise<void> {
  // customId format: "gudhrides-review:rating:<bookingNumber>:<star>"
  const parts = interaction.customId.split(':');
  const bookingNumber = parts[2];
  const rating = Number(parts[3]);
  if (!bookingNumber || rating < 1 || rating > 5) return;

  // Acknowledge the component immediately; rating persistence + stats updates
  // run several DB ops before we edit the message.
  await interaction.deferUpdate();

  const booking = await services.booking.getByBookingNumber(bookingNumber);
  if (!booking || booking.customerId !== interaction.user.id) {
    await interaction.followUp({ content: 'You cannot rate this booking.' });
    return;
  }

  const result = await handleReviewRating(bookingNumber, rating, services, interaction.client);
  await interaction.editReply({ content: result.message, components: [] });
}
