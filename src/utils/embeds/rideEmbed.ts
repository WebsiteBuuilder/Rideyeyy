import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import type { RideRequest } from '../../types/ride';

const STATUS_COLORS: Record<string, number> = {
  OPEN:      0x5865f2,
  CLAIMED:   0xfee75c,
  EN_ROUTE:  0xf79454,
  PICKED_UP: 0x57f287,
  COMPLETED: 0x2ecc71,
  CANCELLED: 0xed4245,
};

const STATUS_LABELS: Record<string, string> = {
  OPEN:      'OPEN',
  CLAIMED:   'CLAIMED',
  EN_ROUTE:  'EN ROUTE',
  PICKED_UP: 'PICKED UP',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

export function buildRideEmbed(ride: RideRequest, providerTag?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('NEW GUHDRIDES REQUEST')
    .setColor(STATUS_COLORS[ride.status] ?? 0x5865f2)
    .addFields(
      { name: 'Ride ID',        value: ride.rideId,                             inline: true  },
      { name: 'Customer',       value: `<@${ride.customerId}>`,                 inline: true  },
      { name: 'Ride Type',      value: ride.rideType,                           inline: true  },
      { name: 'Pickup',         value: ride.pickup,                             inline: false },
      { name: 'Dropoff',        value: ride.dropoff,                            inline: false },
      { name: 'Fare',           value: `$${ride.fare.toFixed(2)}`,              inline: true  },
      { name: 'Requested Time', value: ride.requestedTime,                      inline: true  },
      { name: 'Payment',        value: ride.paymentMethod,                      inline: true  },
      { name: 'Provider',       value: providerTag ?? 'Unassigned',             inline: true  },
      { name: 'Status',         value: STATUS_LABELS[ride.status] ?? ride.status, inline: true },
    )
    .setFooter({ text: 'GUHDRIDES DISPATCH SYSTEM' })
    .setTimestamp(ride.createdAt);
}

export function buildRideButtons(ride: RideRequest): ActionRowBuilder<ButtonBuilder>[] {
  const isOpen      = ride.status === 'OPEN';
  const isClaimed   = ride.status === 'CLAIMED';
  const isEnRoute   = ride.status === 'EN_ROUTE';
  const isPickedUp  = ride.status === 'PICKED_UP';
  const isDone      = ['COMPLETED', 'CANCELLED'].includes(ride.status);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ride:claim:${ride.rideId}`)
      .setLabel('Claim Ride')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!isOpen),
    new ButtonBuilder()
      .setCustomId(`ride:enroute:${ride.rideId}`)
      .setLabel('En Route')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!isClaimed),
    new ButtonBuilder()
      .setCustomId(`ride:pickedup:${ride.rideId}`)
      .setLabel('Picked Up')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!isEnRoute),
    new ButtonBuilder()
      .setCustomId(`ride:complete:${ride.rideId}`)
      .setLabel('Completed')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!isPickedUp),
    new ButtonBuilder()
      .setCustomId(`ride:cancel:${ride.rideId}`)
      .setLabel('Cancel Ride')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(isDone),
  );

  return [row1];
}

export function buildRatingButtons(rideId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...[1, 2, 3, 4, 5].map((n) =>
      new ButtonBuilder()
        .setCustomId(`ride:rate:${rideId}:${n}`)
        .setLabel('★'.repeat(n))
        .setStyle(ButtonStyle.Secondary),
    ),
  );
}
