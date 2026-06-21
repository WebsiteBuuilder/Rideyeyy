import {
  ActionRowBuilder,
  ModalBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { wizardState } from '../../utils/ride/wizardState';

// ── Step 1 — Ride Type ────────────────────────────────────────────────────────

export async function handleStep1(interaction: StringSelectMenuInteraction): Promise<void> {
  const userId = interaction.user.id;
  const rideType = interaction.values[0];
  wizardState.set(userId, { rideType });

  const modal = new ModalBuilder()
    .setCustomId(`ride:modal:pickup:${userId}`)
    .setTitle('Pickup Location');

  const input = new TextInputBuilder()
    .setCustomId('pickup')
    .setLabel('Where should the driver pick you up?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

// ── Step 5 — Requested Time ───────────────────────────────────────────────────

export async function handleStep5(interaction: StringSelectMenuInteraction): Promise<void> {
  const userId = interaction.user.id;
  const state  = wizardState.get(userId) ?? {};
  state.requestedTime = interaction.values[0];
  wizardState.set(userId, state);

  const row = new ActionRowBuilder<import('discord.js').StringSelectMenuBuilder>().addComponents(
    new (await import('discord.js')).StringSelectMenuBuilder()
      .setCustomId(`ride:step6:${userId}`)
      .setPlaceholder('Choose your payment method')
      .addOptions([
        { label: 'Cash App',  value: 'Cash App'  },
        { label: 'Apple Pay', value: 'Apple Pay' },
        { label: 'Zelle',     value: 'Zelle'     },
        { label: 'PayPal',    value: 'PayPal'    },
        { label: 'Other',     value: 'Other'     },
      ]),
  );

  await interaction.update({
    content: 'Step 6 of 6 — Choose your payment method:',
    components: [row],
  });
}

// ── Step 6 — Payment Method + Ride Creation ───────────────────────────────────

export async function handleStep6(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferUpdate();

  const userId = interaction.user.id;
  const state  = wizardState.get(userId);

  if (
    !state?.rideType      ||
    !state.pickup         ||
    !state.dropoff        ||
    state.fare === undefined ||
    !state.requestedTime
  ) {
    await interaction.editReply({ content: '`Wizard state lost. Please run /ride again.`', components: [] });
    return;
  }

  state.paymentMethod = interaction.values[0];
  wizardState.delete(userId);

  // Lazy import to avoid circular deps at module load time
  const { rideService }        = await import('../../services/ride/RideService');
  const { channelService }     = await import('../../services/ride/ChannelService');
  const { notificationService }= await import('../../services/ride/NotificationService');
  const { logService }         = await import('../../services/ride/LogService');
  const { statsService }       = await import('../../services/ride/StatsService');
  const { buildRideEmbed, buildRideButtons } = await import('../../utils/embeds/rideEmbed');
  const { rideConfig }         = await import('../../config');

  const ride = await rideService.createRide({
    customerId:    userId,
    rideType:      state.rideType,
    pickup:        state.pickup,
    dropoff:       state.dropoff,
    fare:          state.fare,
    requestedTime: state.requestedTime,
    paymentMethod: state.paymentMethod,
  });

  await statsService.upsertCustomerStats(userId, { totalRequests: 1 });

  const member   = await interaction.guild!.members.fetch(userId);
  const username = member.user.username;
  const client   = interaction.client;
  const guildId  = interaction.guildId!;

  const channel = await channelService.createRideChannel(client, guildId, ride, username);
  if (channel) {
    await rideService.setChannelId(ride.rideId, channel.id);
    const embed   = buildRideEmbed(ride);
    const buttons = buildRideButtons(ride);
    await channel.send({ embeds: [embed], components: buttons });
  }

  const dispatchChannelId = rideConfig.channels.dispatch;
  if (dispatchChannelId) {
    try {
      const dispatch = await client.channels.fetch(dispatchChannelId);
      if (dispatch && dispatch.isTextBased()) {
        const embed   = buildRideEmbed(ride);
        const buttons = buildRideButtons(ride);
        await (dispatch as import('discord.js').TextChannel).send({ embeds: [embed], components: buttons });
      }
    } catch { /* ignore */ }
  }

  await notificationService.notify(client, userId, 'CREATED', ride.rideId);
  await logService.log(client, 'CREATED', [
    { name: 'Ride ID',  value: ride.rideId,           inline: true },
    { name: 'Customer', value: `<@${userId}>`,         inline: true },
    { name: 'Type',     value: ride.rideType,          inline: true },
    { name: 'Pickup',   value: ride.pickup,            inline: false },
    { name: 'Dropoff',  value: ride.dropoff,           inline: false },
    { name: 'Fare',     value: `$${ride.fare.toFixed(2)}`, inline: true },
  ]);

  await interaction.editReply({
    content: `Your ride **${ride.rideId}** has been submitted! Check <#${channel?.id ?? dispatchChannelId}> for updates.`,
    components: [],
  });
}
