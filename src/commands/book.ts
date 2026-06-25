import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  GuildMember,
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

export const PICKUP_MODAL = 'gudhrides-book-pickup-modal';
export const DEST_MODAL = 'gudhrides-book-destination-modal';
export const PRICE_MODAL = 'gudhrides-book-price-modal';
export const NOTES_MODAL = 'gudhrides-book-notes-modal';

export const data = new SlashCommandBuilder()
  .setName('book')
  .setDescription('Book a ride or courier delivery with GUHD RIDES');

function pickupModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(PICKUP_MODAL)
    .setTitle('Pickup Address')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('pickup')
          .setLabel('Pickup Address')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500)
      )
    );
}

function destinationModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(DEST_MODAL)
    .setTitle('Destination Address')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('destination')
          .setLabel('Destination Address')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500)
      )
    );
}

function priceModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(PRICE_MODAL)
    .setTitle('Customer Offered Price')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('price')
          .setLabel('Price (USD)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(20)
          .setPlaceholder('25.00')
      )
    );
}

function notesModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(NOTES_MODAL)
    .setTitle('Additional Notes')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel('Notes (optional)')
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
  if (!(await runBookPreflight(interaction, services))) return;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    actionButton('gudhrides-book:service:RIDE', 'Ride', ButtonStyle.Primary),
    actionButton('gudhrides-book:service:COURIER', 'Courier Delivery', ButtonStyle.Secondary)
  );
  await interaction.reply({
    content: 'Select a **service type** to begin your booking:',
    components: [row],
    ephemeral: true,
  });
}

export async function handleBookButton(
  interaction: ButtonInteraction,
  services: AppServices
): Promise<void> {
  const parts = interaction.customId.split(':');
  const step = parts[2];
  const value = parts[3];

  if (step === 'service') {
    const serviceType = value as ServiceType;
    services.booking.setDraft(interaction.user.id, { serviceType });
    if (serviceType === 'COURIER') {
      await interaction.showModal(pickupModal());
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
    await interaction.showModal(pickupModal());
  }
}

export async function handleBookModal(
  interaction: ModalSubmitInteraction,
  services: AppServices
): Promise<void> {
  const userId = interaction.user.id;
  const draft = services.booking.getDraft(userId);

  if (interaction.customId === PICKUP_MODAL) {
    if (!draft?.serviceType) {
      await ephemeralReply(interaction, 'Booking session expired. Run `/book` again.');
      return;
    }
    const pickup = interaction.fields.getTextInputValue('pickup').trim();
    if (!pickup) {
      await ephemeralReply(interaction, 'Pickup address is required.');
      return;
    }
    services.booking.setDraft(userId, { ...draft, pickup });
    await interaction.showModal(destinationModal());
    return;
  }

  if (interaction.customId === DEST_MODAL) {
    if (!draft?.pickup) {
      await ephemeralReply(interaction, 'Booking session expired. Run `/book` again.');
      return;
    }
    const destination = interaction.fields.getTextInputValue('destination').trim();
    if (!destination) {
      await ephemeralReply(interaction, 'Destination address is required.');
      return;
    }
    services.booking.setDraft(userId, { ...draft, destination });
    await interaction.showModal(priceModal());
    return;
  }

  if (interaction.customId === PRICE_MODAL) {
    if (!draft?.destination) {
      await ephemeralReply(interaction, 'Booking session expired. Run `/book` again.');
      return;
    }
    try {
      const price = parseAmount(interaction.fields.getTextInputValue('price'));
      services.booking.setDraft(userId, { ...draft, price });
      await interaction.showModal(notesModal());
    } catch {
      await ephemeralReply(interaction, 'Invalid price. Enter a positive number (e.g. `25.00`).');
    }
    return;
  }

  if (interaction.customId === NOTES_MODAL) {
    if (!draft?.serviceType || !draft.pickup || !draft.destination || !draft.price) {
      await ephemeralReply(interaction, 'Booking session expired. Run `/book` again.');
      return;
    }
    const notes = interaction.fields.getTextInputValue('notes')?.trim() || undefined;
    try {
      const booking = await services.booking.createBooking({
        customerId: userId,
        serviceType: draft.serviceType,
        vehicleType: draft.vehicleType,
        pickup: draft.pickup,
        destination: draft.destination,
        price: draft.price,
        notes,
      });
      await interaction.reply({
        content: `Booking **${booking.bookingNumber}** created successfully!`,
        ephemeral: true,
      });
      await createTicketChannel(interaction.client, interaction.guildId!, booking, services);
    } catch (err) {
      const msg = err instanceof Error && err.message === 'DUPLICATE_ROUTE'
        ? 'You already have an active booking with the same pickup and destination.'
        : 'Failed to create booking. Please try again.';
      await ephemeralReply(interaction, msg);
    }
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
  const parts = interaction.customId.split(':');
  const bookingNumber = parts[3];
  const rating = Number(parts[4]);
  if (!bookingNumber || rating < 1 || rating > 5) return;

  const booking = await services.booking.getByBookingNumber(bookingNumber);
  if (!booking || booking.customerId !== interaction.user.id) {
    await ephemeralReply(interaction, 'You cannot rate this booking.');
    return;
  }

  const result = await handleReviewRating(bookingNumber, rating, services, interaction.client);
  await interaction.update({ content: result.message, components: [] });
}
