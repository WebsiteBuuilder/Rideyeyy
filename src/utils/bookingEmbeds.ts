import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import type { Booking, BookingStatus, ServiceType, VehicleType } from '@prisma/client';
import {
  brandedEmbed,
  COLOR,
  kvRow,
  LINE,
  statBlock,
} from './discord';

// ═══════════════════════════════════════════════════════════════════════════
//  BOOKING EMBEDS & BUTTONS
// ═══════════════════════════════════════════════════════════════════════════

const SERVICE_LABELS: Record<ServiceType, string> = {
  RIDE: 'Ride',
  COURIER: 'Courier Delivery',
};

const VEHICLE_LABELS: Record<VehicleType, string> = {
  REGULAR: 'Regular',
  COMFORT: 'Comfort',
  XL: 'XL',
};

const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: 'Pending',
  CLAIMED: 'Claimed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function bookingChannelName(bookingNumber: string): string {
  return `booking-${bookingNumber.replace(/-/g, '').toLowerCase()}`;
}

export function buildBookingEmbed(
  booking: Booking,
  providerTag?: string
): EmbedBuilder {
  const vehicleLine =
    booking.vehicleType != null
      ? kvRow('Vehicle', VEHICLE_LABELS[booking.vehicleType])
      : null;

  const fields = [
    kvRow('Booking ID', `\`${booking.bookingNumber}\``),
    kvRow('Status', STATUS_LABELS[booking.status]),
    kvRow('Service', SERVICE_LABELS[booking.serviceType]),
    vehicleLine,
    kvRow('Pickup', booking.pickup),
    kvRow('Destination', booking.destination),
    kvRow('Price', `$${booking.price.toString()}`),
    booking.notes ? kvRow('Notes', booking.notes) : null,
    kvRow('Customer', `<@${booking.customerId}>`),
    providerTag
      ? kvRow('Provider', providerTag)
      : booking.providerId
        ? kvRow('Provider', `<@${booking.providerId}>`)
        : kvRow('Provider', 'Unassigned'),
    booking.rating != null ? kvRow('Rating', `${booking.rating}/5`) : null,
  ].filter((line): line is string => line !== null);

  return brandedEmbed(COLOR.INFO)
    .setTitle('New Booking Request')
    .setDescription(`${LINE}\n${fields.join('\n')}`);
}

export function buildBookingActionRow(
  bookingNumber: string,
  status: BookingStatus
): ActionRowBuilder<ButtonBuilder> {
  const claimDisabled = status !== 'PENDING';
  const completeDisabled = status !== 'CLAIMED';
  const cancelDisabled = status === 'COMPLETED' || status === 'CANCELLED';

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`gudhrides-booking:claim:${bookingNumber}`)
      .setLabel('Claim')
      .setStyle(ButtonStyle.Success)
      .setDisabled(claimDisabled),
    new ButtonBuilder()
      .setCustomId(`gudhrides-booking:complete:${bookingNumber}`)
      .setLabel('Complete')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(completeDisabled),
    new ButtonBuilder()
      .setCustomId(`gudhrides-booking:cancel:${bookingNumber}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(cancelDisabled)
  );
}

export function buildVouchEmbed(
  booking: Booking,
  customerTag: string,
  providerTag: string
): EmbedBuilder {
  return brandedEmbed(COLOR.WIN)
    .setTitle('Customer Vouch')
    .setDescription(
      [
        LINE,
        kvRow('Booking', `\`${booking.bookingNumber}\``),
        kvRow('Rating', `${'★'.repeat(booking.rating ?? 0)}${'☆'.repeat(5 - (booking.rating ?? 0))}`),
        kvRow('Customer', customerTag),
        kvRow('Provider', providerTag),
        kvRow('Service', SERVICE_LABELS[booking.serviceType]),
        booking.notes ? kvRow('Notes', booking.notes) : null,
      ]
        .filter(Boolean)
        .join('\n')
    );
}

export function buildProviderStatsEmbed(
  stats: {
    claims: number;
    completed: number;
    cancelled: number;
    avgRating: string;
    revenue: string;
  },
  userId: string
): EmbedBuilder {
  const total = stats.claims || 1;
  const completionRate = ((stats.completed / total) * 100).toFixed(1);

  return brandedEmbed(COLOR.INFO)
    .setTitle('Provider Statistics')
    .setDescription(
      [
        statBlock('Claims', String(stats.claims)),
        statBlock('Completed', String(stats.completed)),
        statBlock('Cancelled', String(stats.cancelled)),
        statBlock('Avg Rating', stats.avgRating),
        statBlock('Revenue', `$${stats.revenue}`),
        statBlock('Completion Rate', `${completionRate}%`),
      ].join('\n')
    )
    .setFooter({ text: `Provider: ${userId}` });
}

export function buildLeaderboardEmbed(
  title: string,
  entries: Array<{ discordId: string; value: string }>
): EmbedBuilder {
  const body =
    entries.length === 0
      ? 'No providers ranked yet.'
      : entries
          .map((e, i) => `${i + 1}. <@${e.discordId}> — ${e.value}`)
          .join('\n');

  return brandedEmbed(COLOR.JACKPOT).setTitle(title).setDescription(body);
}
