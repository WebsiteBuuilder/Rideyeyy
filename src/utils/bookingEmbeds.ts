import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import type { Booking, BookingStatus, ServiceType, VehicleType } from '@prisma/client';
import {
  actionButton,
  brandedEmbed,
  BRAND,
  COLOR,
  ICON,
  LINE,
  SPACER,
  statusBanner,
} from './discord';

// ═══════════════════════════════════════════════════════════════════════════
//  BOOKING EMBEDS & BUTTONS
// ═══════════════════════════════════════════════════════════════════════════

const SERVICE_LABELS: Record<ServiceType, string> = {
  RIDE: 'Ride',
  COURIER: 'Courier Delivery',
};

const SERVICE_ICON: Record<ServiceType, string> = {
  RIDE: '🚗',
  COURIER: '📦',
};

const VEHICLE_LABELS: Record<VehicleType, string> = {
  REGULAR: 'Regular',
  COMFORT: 'Comfort',
  XL: 'XL',
};

const VEHICLE_ICON: Record<VehicleType, string> = {
  REGULAR: '🚘',
  COMFORT: '✨',
  XL: '🚐',
};

const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: 'Pending',
  CLAIMED: 'Claimed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STATUS_COLOR: Record<BookingStatus, number> = {
  PENDING: COLOR.ACTIVE,
  CLAIMED: COLOR.JACKPOT,
  COMPLETED: COLOR.WIN,
  CANCELLED: COLOR.LOSS,
};

const STATUS_BANNER: Record<BookingStatus, { text: string; style: 'win' | 'loss' | 'jackpot' | 'info' | 'neutral' }> = {
  PENDING: { text: '◔  AWAITING PROVIDER  ◔', style: 'info' },
  CLAIMED: { text: '✦  PROVIDER ASSIGNED  ✦', style: 'jackpot' },
  COMPLETED: { text: '✓  TRIP COMPLETED  ✓', style: 'win' },
  CANCELLED: { text: '✕  CANCELLED  ✕', style: 'loss' },
};

export const BOOK_NOW_BUTTON_ID = 'gudhrides-book:start';

export function bookingChannelName(bookingNumber: string): string {
  return `booking-${bookingNumber.replace(/-/g, '').toLowerCase()}`;
}

/** Raw, copyable monospace text (not a clickable link). */
function copyable(value: string): string {
  const trimmed = value.trim();
  return trimmed ? `\`${trimmed}\`` : '—';
}

export function buildBookingEmbed(booking: Booking, providerTag?: string): EmbedBuilder {
  const banner = STATUS_BANNER[booking.status];

  const description =
    statusBanner(banner.text, banner.style) +
    `\n${LINE}\n` +
    `**${ICON.arrow} Pickup**\n${copyable(booking.pickup)}\n` +
    `**${ICON.arrow} Dropoff**\n${copyable(booking.destination)}\n` +
    (booking.notes ? `\n**${ICON.arrow} Notes**\n${booking.notes}\n` : '');

  const embed = brandedEmbed(STATUS_COLOR[booking.status])
    .setTitle(`${SERVICE_ICON[booking.serviceType]} ${SERVICE_LABELS[booking.serviceType]} · ${booking.bookingNumber}`)
    .setDescription(description)
    .addFields(
      { name: 'Preferred Name', value: booking.preferredName ?? '—', inline: true },
      {
        name: 'Vehicle',
        value: booking.vehicleType ? `${VEHICLE_ICON[booking.vehicleType]} ${VEHICLE_LABELS[booking.vehicleType]}` : '—',
        inline: true,
      },
      { name: 'Status', value: STATUS_LABELS[booking.status], inline: true },
      { name: 'Customer', value: `<@${booking.customerId}>`, inline: true },
      {
        name: 'Provider',
        value: providerTag ?? (booking.providerId ? `<@${booking.providerId}>` : '*Unassigned*'),
        inline: true,
      },
    );

  if (booking.rating != null) {
    embed.addFields({
      name: 'Rating',
      value: `${'★'.repeat(booking.rating)}${'☆'.repeat(5 - booking.rating)}`,
      inline: true,
    });
  }

  return embed;
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
      .setEmoji('✋')
      .setStyle(ButtonStyle.Success)
      .setDisabled(claimDisabled),
    new ButtonBuilder()
      .setCustomId(`gudhrides-booking:complete:${bookingNumber}`)
      .setLabel('Complete')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(completeDisabled),
    new ButtonBuilder()
      .setCustomId(`gudhrides-booking:cancel:${bookingNumber}`)
      .setLabel('Cancel')
      .setEmoji('🛑')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(cancelDisabled)
  );
}

// ── Selection prompts (ephemeral, shown to the customer) ────────────────────

export function buildServicePromptEmbed(): EmbedBuilder {
  return brandedEmbed(COLOR.ELECTRIC)
    .setTitle('🚗 New Booking')
    .setDescription(
      statusBanner('◈  STEP 1 OF 3  ·  SERVICE  ◈', 'info') +
      `\n${LINE}\n` +
      `Choose what you need below.\n\n` +
      `${SERVICE_ICON.RIDE} **Ride** ${ICON.arrow} get a lift from A to B\n` +
      `${SERVICE_ICON.COURIER} **Courier Delivery** ${ICON.arrow} send a package`
    );
}

export function buildVehiclePromptEmbed(): EmbedBuilder {
  return brandedEmbed(COLOR.ELECTRIC)
    .setTitle('🚗 New Booking')
    .setDescription(
      statusBanner('◈  STEP 2 OF 3  ·  VEHICLE  ◈', 'info') +
      `\n${LINE}\n` +
      `Pick the vehicle class for your ride.\n\n` +
      `${VEHICLE_ICON.REGULAR} **Regular** ${ICON.arrow} standard\n` +
      `${VEHICLE_ICON.COMFORT} **Comfort** ${ICON.arrow} premium\n` +
      `${VEHICLE_ICON.XL} **XL** ${ICON.arrow} extra space`
    );
}

export function buildServiceRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('gudhrides-book:service:RIDE')
      .setLabel('Ride')
      .setEmoji('🚗')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('gudhrides-book:service:COURIER')
      .setLabel('Courier Delivery')
      .setEmoji('📦')
      .setStyle(ButtonStyle.Secondary)
  );
}

export function buildVehicleRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('gudhrides-book:vehicle:REGULAR')
      .setLabel('Regular')
      .setEmoji('🚘')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('gudhrides-book:vehicle:COMFORT')
      .setLabel('Comfort')
      .setEmoji('✨')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('gudhrides-book:vehicle:XL')
      .setLabel('XL')
      .setEmoji('🚐')
      .setStyle(ButtonStyle.Success)
  );
}

// ── Order-here panel (persistent Book Now button) ───────────────────────────

export function buildOrderPanelEmbed(): EmbedBuilder {
  return brandedEmbed(COLOR.ELECTRIC)
    .setTitle('🚗 Book a Ride or Delivery')
    .setDescription(
      statusBanner('◈  GUHD RIDES  ·  ORDER HERE  ◈', 'info') +
      `\n${LINE}\n` +
      `Tap **Book Now** to start. You'll be guided through:\n\n` +
      `**1.** ${ICON.arrow} Choose Ride or Courier\n` +
      `**2.** ${ICON.arrow} Pick your vehicle (rides)\n` +
      `**3.** ${ICON.arrow} Paste your pickup & dropoff Google Maps links\n\n` +
      `A private booking ticket opens for you and a provider. ${ICON.check}`
    );
}

export function buildOrderPanelRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    actionButton(BOOK_NOW_BUTTON_ID, 'Book Now', ButtonStyle.Success)
  );
}

// ── Editable info panels (/invite, /howto) ──────────────────────────────────

export function buildInfoPanelEmbed(title: string, icon: string, content: string, color: number = COLOR.INFO): EmbedBuilder {
  return brandedEmbed(color)
    .setTitle(`${icon} ${title}`)
    .setDescription(`${LINE}\n${content}\n${SPACER}`);
}

export function buildVouchEmbed(
  booking: Booking,
  customerTag: string,
  providerTag: string
): EmbedBuilder {
  return brandedEmbed(COLOR.WIN)
    .setTitle('⭐ Customer Vouch')
    .setDescription(
      statusBanner(`${ICON.win}  VERIFIED REVIEW  ${ICON.win}`, 'win') +
      `\n${LINE}\n` +
      `**${'★'.repeat(booking.rating ?? 0)}${'☆'.repeat(5 - (booking.rating ?? 0))}**  (${booking.rating ?? 0}/5)\n` +
      (booking.notes ? `\n> ${booking.notes}\n` : '')
    )
    .addFields(
      { name: 'Booking', value: `\`${booking.bookingNumber}\``, inline: true },
      { name: 'Service', value: SERVICE_LABELS[booking.serviceType], inline: true },
      { name: 'Rating', value: `${booking.rating ?? 0}/5`, inline: true },
      { name: 'Customer', value: customerTag, inline: true },
      { name: 'Provider', value: providerTag, inline: true },
    )
    .setFooter({ text: `${BRAND.name}  ·  ${BRAND.tagline}` });
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
    .setTitle('📊 Provider Statistics')
    .setDescription(statusBanner('◈  PERFORMANCE  ◈', 'info') + `\n${LINE}`)
    .addFields(
      { name: 'Claims', value: String(stats.claims), inline: true },
      { name: 'Completed', value: String(stats.completed), inline: true },
      { name: 'Cancelled', value: String(stats.cancelled), inline: true },
      { name: 'Avg Rating', value: `${stats.avgRating} ★`, inline: true },
      { name: 'Completion', value: `${completionRate}%`, inline: true },
      { name: SPACER, value: SPACER, inline: true },
    )
    .setFooter({ text: `Provider: ${userId}` });
}

export function buildLeaderboardEmbed(
  title: string,
  entries: Array<{ discordId: string; value: string }>
): EmbedBuilder {
  const medals = ['🥇', '🥈', '🥉'];
  const body =
    entries.length === 0
      ? 'No providers ranked yet.'
      : entries
          .map((e, i) => `${medals[i] ?? `\`#${i + 1}\``}  <@${e.discordId}> ${ICON.arrow} **${e.value}**`)
          .join('\n');

  return brandedEmbed(COLOR.JACKPOT)
    .setTitle(`🏆 ${title}`)
    .setDescription(statusBanner(`${ICON.jackpot}  TOP PROVIDERS  ${ICON.jackpot}`, 'jackpot') + `\n${LINE}\n${body}`);
}
