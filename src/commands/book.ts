import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonInteraction,
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
  StringSelectMenuInteraction,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { Booking, ServiceType, VehicleType } from '@prisma/client';
import Decimal from 'decimal.js';
import { config } from '../config';
import type { AppServices } from '../types';
import {
  checkCooldown,
  ephemeralReply,
  hasProviderRole,
  hasStaffRole,
} from '../utils/discord';
import {
  bookingChannelName,
  buildBookingActionRow,
  buildBookingEmbed,
  buildServicePromptEmbed,
  buildServiceRow,
  buildRewardPromptEmbed,
  buildRewardSelectRow,
  buildVehiclePromptEmbed,
  buildVehicleRow,
} from '../utils/bookingEmbeds';
import { triggerReviewFlow, handleReviewRating } from '../utils/reviewFlow';

// Discord does not allow opening a modal in response to a modal submission,
// so all booking details are collected in a single modal (max 5 inputs)
// opened from the service/vehicle selection buttons.
export const DETAILS_MODAL = 'gudhrides-book-details-modal';
export const REWARD_SELECT_ID = 'gudhrides-book:reward';

async function proceedToRewardOrDetails(
  interaction: ButtonInteraction,
  services: AppServices,
  draft: import('../types').BookingDraft
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await ephemeralReply(interaction, 'Bookings must be created inside a server.');
    return;
  }
  const rewards = await services.redemption.listAvailable(guildId, interaction.user.id);
  if (rewards.length === 0) {
    await interaction.showModal(detailsModal());
    return;
  }
  await interaction.update({
    embeds: [buildRewardPromptEmbed()],
    components: [
      buildRewardSelectRow(
        rewards,
        (key) => services.redemption.label(key),
        (source) => services.redemption.sourceLabel(source)
      ),
    ],
  });
}

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
          .setCustomId('preferredName')
          .setLabel('Preferred Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('pickup')
          .setLabel('Pickup (Google Maps link)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(500)
          .setPlaceholder('https://maps.google.com/...')
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('destination')
          .setLabel('Dropoff (Google Maps link)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(500)
          .setPlaceholder('https://maps.google.com/...')
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
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  services: AppServices
): Promise<boolean> {
  if (!interaction.inGuild()) {
    await ephemeralReply(interaction, 'Bookings must be created inside a server.');
    return false;
  }
  if (!(await services.operations.isBookingsOpen(interaction.guildId!))) {
    await ephemeralReply(
      interaction,
      'Bookings are currently **closed**. Check the order channel — staff will `/open` when rides are available again.'
    );
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

/**
 * Shared booking entry point. Works from both the `/book` slash command and the
 * persistent "Book Now" button posted in the order-here channel.
 */
export async function startBooking(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  services: AppServices
): Promise<void> {
  // Acknowledge immediately so the DB-backed preflight checks below can never
  // blow past Discord's 3s interaction window ("application did not respond").
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!(await runBookPreflight(interaction, services))) return;
  await interaction.editReply({
    embeds: [buildServicePromptEmbed()],
    components: [buildServiceRow()],
  });
}

export async function execute(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  await startBooking(interaction, services);
}

export async function handleBookButton(
  interaction: ButtonInteraction,
  services: AppServices
): Promise<void> {
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
    const serviceType = value as ServiceType;
    services.booking.setDraft(interaction.user.id, { serviceType });
    if (serviceType === 'COURIER') {
      await proceedToRewardOrDetails(interaction, services, { serviceType });
      return;
    }
    await interaction.update({
      embeds: [buildVehiclePromptEmbed()],
      components: [buildVehicleRow()],
    });
    return;
  }

  if (step === 'vehicle') {
    const draft = services.booking.getDraft(interaction.user.id);
    if (!draft?.serviceType) {
      await ephemeralReply(interaction, 'Booking session expired. Run `/book` again.');
      return;
    }
    const updated = { ...draft, vehicleType: value as VehicleType };
    services.booking.setDraft(interaction.user.id, updated);
    await proceedToRewardOrDetails(interaction, services, updated);
  }
}

export async function handleBookSelect(
  interaction: StringSelectMenuInteraction,
  services: AppServices
): Promise<void> {
  if (interaction.customId !== REWARD_SELECT_ID) return;

  const draft = services.booking.getDraft(interaction.user.id);
  if (!draft?.serviceType) {
    await ephemeralReply(interaction, 'Booking session expired. Run `/book` again.');
    return;
  }

  const value = interaction.values[0];
  const redemptionId = value === 'none' ? undefined : value;
  services.booking.setDraft(interaction.user.id, { ...draft, redemptionId });
  await interaction.showModal(detailsModal());
}

export async function handleBookModal(
  interaction: ModalSubmitInteraction,
  services: AppServices
): Promise<void> {
  if (interaction.customId !== DETAILS_MODAL) return;

  // Acknowledge immediately; booking creation performs several DB round-trips
  // that can otherwise exceed Discord's 3s window.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.guildId || !(await services.operations.isBookingsOpen(interaction.guildId))) {
    await ephemeralReply(
      interaction,
      'Bookings are currently **closed**. Check the order channel — staff will `/open` when rides are available again.'
    );
    return;
  }

  const userId = interaction.user.id;
  const draft = services.booking.getDraft(userId);
  if (!draft?.serviceType) {
    await ephemeralReply(interaction, 'Booking session expired. Run `/book` again.');
    return;
  }

  const preferredName = interaction.fields.getTextInputValue('preferredName').trim();
  const pickup = interaction.fields.getTextInputValue('pickup').trim();
  const destination = interaction.fields.getTextInputValue('destination').trim();
  const notes = interaction.fields.getTextInputValue('notes')?.trim() || undefined;

  if (!preferredName || !pickup || !destination) {
    await ephemeralReply(interaction, 'Preferred name, pickup, and dropoff are required.');
    return;
  }

  try {
    const booking = await services.booking.createBooking({
      customerId: userId,
      guildId: interaction.guildId,
      preferredName,
      serviceType: draft.serviceType,
      vehicleType: draft.vehicleType,
      pickup,
      destination,
      notes,
      redemptionId: draft.redemptionId,
    });
    await interaction.editReply({
      content: `Booking **${booking.bookingNumber}** created successfully!`,
    });
    await createTicketChannel(interaction.client, interaction.guildId!, booking, services);
  } catch (err) {
    const msg =
      err instanceof Error && err.message === 'DUPLICATE_ROUTE'
        ? 'You already have an active booking with the same pickup and destination.'
        : err instanceof Error && err.message === 'REWARD_UNAVAILABLE'
          ? 'That reward is no longer available. Run `/book` again and pick another reward.'
          : 'Failed to create booking. Please try again.';
    await ephemeralReply(interaction, msg);
  }
}

async function rewardLabelForBooking(booking: Booking, services: AppServices): Promise<string | undefined> {
  if (!booking.redemptionId) return undefined;
  const row = await services.redemption.findById(booking.redemptionId);
  return row ? services.redemption.label(row.rewardKey) : undefined;
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

    const rewardLabel = await rewardLabelForBooking(booking, services);
    const embed = buildBookingEmbed(booking, undefined, rewardLabel);
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
  services: AppServices,
  providerTag?: string
): Promise<void> {
  if (!booking.channelId || !booking.messageId) return;
  try {
    const channel = await client.channels.fetch(booking.channelId);
    if (!channel?.isTextBased()) return;
    const msg = await channel.messages.fetch(booking.messageId);
    const rewardLabel = await rewardLabelForBooking(booking, services);
    const embed = buildBookingEmbed(booking, providerTag, rewardLabel);
    const row = buildBookingActionRow(booking.bookingNumber, booking.status);
    await msg.edit({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('[Bot] Failed to update booking embed:', err);
  }
}

const TICKET_DELETE_DELAY_MS = 30_000;

function buildTranscriptText(booking: Booking, lines: string[]): string {
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
async function saveTranscriptAndScheduleDelete(
  client: Client,
  booking: Booking,
  channelNotice = 'Booking completed. Transcript saved — this ticket will be deleted in 30 seconds.'
): Promise<void> {
  if (!booking.channelId) return;
  try {
    const channel = await client.channels.fetch(booking.channelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) return;

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
    const file = new AttachmentBuilder(Buffer.from(transcript, 'utf8'), {
      name: `transcript-${booking.bookingNumber}.txt`,
    });

    if (config.channels.transcript !== '0') {
      try {
        const target = await client.channels.fetch(config.channels.transcript);
        if (target?.isTextBased() && !target.isDMBased()) {
          await (target as TextChannel).send({
            content: `Transcript for booking **${booking.bookingNumber}** (customer <@${booking.customerId}>, provider ${booking.providerId ? `<@${booking.providerId}>` : 'N/A'}).`,
            files: [file],
          });
        }
      } catch (err) {
        console.error('[Bot] Failed to post transcript:', err);
      }
    }

    try {
      await (channel as TextChannel).send(channelNotice);
    } catch {
      /* notice is best-effort */
    }

    setTimeout(() => {
      channel.delete().catch((err) => console.error('[Bot] Failed to delete ticket channel:', err));
    }, TICKET_DELETE_DELAY_MS);
  } catch (err) {
    console.error('[Bot] Failed to build/save transcript:', err);
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
    await updateTicketMessage(interaction.client, updated, services, `<@${interaction.user.id}>`);
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

  if (action === 'complete' || action === 'incomplete') {
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
    try {
      await services.redemption.finalizeForBooking(updated.id, interaction.user.id);
    } catch (err) {
      console.error('[Book] reward finalize failed:', err);
    }
    if (interaction.guildId) {
      try {
        const cfg = await services.invite.admin.getConfig(interaction.guildId);
        if (cfg.lotteryEnabled && cfg.ticketsPerRide > 0) {
          await services.lottery.grantTickets(interaction.guildId, updated.customerId, 'ride', cfg.ticketsPerRide);
        }
      } catch (err) {
        console.error('[Book] lottery ticket grant failed:', err);
      }
      try {
        await services.invite.reward.rewardFirstOrder(interaction.client, interaction.guildId, updated.customerId);
      } catch (err) {
        console.error('[Book] first-order invite bonus failed:', err);
      }
    }
    await updateTicketMessage(interaction.client, updated, services);
    if (action === 'complete') {
      await triggerReviewFlow(interaction.client, updated);
    }
    const label = action === 'incomplete' ? 'marked as completed (no vouch)' : 'marked as completed';
    await ephemeralReply(interaction, `Booking **${bookingNumber}** ${label}.`);
    await saveTranscriptAndScheduleDelete(interaction.client, updated);
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
    try {
      await services.redemption.releaseForBooking(updated.id);
    } catch (err) {
      console.error('[Book] reward release failed:', err);
    }
    await updateTicketMessage(interaction.client, updated, services);
    await ephemeralReply(interaction, `Booking **${bookingNumber}** has been cancelled.`);
    await saveTranscriptAndScheduleDelete(
      interaction.client,
      updated,
      'Booking cancelled. Transcript saved — this ticket will be deleted in 30 seconds.'
    );
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
