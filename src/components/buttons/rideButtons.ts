import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { rideService }          from '../../services/ride/RideService';
import { statsService }         from '../../services/ride/StatsService';
import { notificationService }  from '../../services/ride/NotificationService';
import { logService }           from '../../services/ride/LogService';
import { channelService }       from '../../services/ride/ChannelService';
import { buildRideEmbed, buildRideButtons, buildRatingButtons } from '../../utils/embeds/rideEmbed';
import { isProvider, isStaff }  from '../../utils/permissions/ridePermissions';
import { rideConfig }           from '../../config';

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function handleRideButton(interaction: ButtonInteraction): Promise<void> {
  // Format: ride:<action>:<rideId>[:<extra>]
  const parts  = interaction.customId.split(':');
  const action = parts[1];

  try {
    switch (action) {
      case 'claim':        await handleClaim(interaction, parts[2]);              break;
      case 'enroute':      await handleEnRoute(interaction, parts[2]);            break;
      case 'pickedup':     await handlePickedUp(interaction, parts[2]);           break;
      case 'complete':     await handleComplete(interaction, parts[2]);           break;
      case 'cancel':       await handleCancel(interaction, parts[2]);             break;
      case 'rate':         await handleRating(interaction, parts[2], parts[3]);   break;
      case 'opendropoff':  await handleOpenDropoff(interaction, parts[2]);        break;
      case 'openfare':     await handleOpenFare(interaction, parts[2]);           break;
      default:
        await interaction.reply({ content: '`Unknown action.`', ephemeral: true });
    }
  } catch (err) {
    console.error('[RideButton] Error:', err);
    try {
      const msg = '`An error occurred. Please try again.`';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: msg, ephemeral: true });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    } catch { /* ignore */ }
  }
}

// ── Open dropoff modal from a button ─────────────────────────────────────────

async function handleOpenDropoff(interaction: ButtonInteraction, userId: string): Promise<void> {
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: '`This is not your ride request.`', ephemeral: true });
    return;
  }
  const modal = new ModalBuilder()
    .setCustomId(`ride:modal:dropoff:${userId}`)
    .setTitle('Dropoff Location');
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('dropoff')
        .setLabel('Where are you going?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500),
    ),
  );
  await interaction.showModal(modal);
}

// ── Open fare modal from a button ─────────────────────────────────────────────

async function handleOpenFare(interaction: ButtonInteraction, userId: string): Promise<void> {
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: '`This is not your ride request.`', ephemeral: true });
    return;
  }
  const modal = new ModalBuilder()
    .setCustomId(`ride:modal:fare:${userId}`)
    .setTitle('Estimated Fare');
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('fare')
        .setLabel('Estimated fare in USD (numbers only)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g. 25.00')
        .setMaxLength(10),
    ),
  );
  await interaction.showModal(modal);
}

// ── Claim ─────────────────────────────────────────────────────────────────────

async function handleClaim(interaction: ButtonInteraction, rideId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const member = await interaction.guild!.members.fetch(interaction.user.id);
  if (!isProvider(member)) {
    await interaction.editReply('`Only providers can claim rides.`');
    return;
  }

  const ride = await rideService.getByRideId(rideId);
  if (!ride) { await interaction.editReply('`Ride not found.`'); return; }
  if (ride.status !== 'OPEN') { await interaction.editReply('`This ride is no longer available.`'); return; }

  const updated = await rideService.claimRide(rideId, interaction.user.id, interaction.channelId);
  await refreshRideEmbed(interaction, updated, interaction.user.tag);
  await notificationService.notify(interaction.client, updated.customerId, 'CLAIMED', rideId);
  await logService.log(interaction.client, 'CLAIMED', [
    { name: 'Ride ID',   value: rideId,                        inline: true },
    { name: 'Provider',  value: `<@${interaction.user.id}>`,   inline: true },
    { name: 'Customer',  value: `<@${updated.customerId}>`,    inline: true },
  ]);

  await interaction.editReply('`Ride claimed successfully.`');
}

// ── En Route ──────────────────────────────────────────────────────────────────

async function handleEnRoute(interaction: ButtonInteraction, rideId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const ride = await rideService.getByRideId(rideId);
  if (!ride)                               { await interaction.editReply('`Ride not found.`'); return; }
  if (ride.providerId !== interaction.user.id) { await interaction.editReply('`You are not the assigned provider.`'); return; }
  if (ride.status !== 'CLAIMED')           { await interaction.editReply('`Invalid status transition.`'); return; }

  const updated = await rideService.updateStatus(rideId, 'EN_ROUTE');
  await refreshRideEmbed(interaction, updated, interaction.user.tag);
  await notificationService.notify(interaction.client, updated.customerId, 'EN_ROUTE', rideId);
  await logService.log(interaction.client, 'EN_ROUTE', [
    { name: 'Ride ID',  value: rideId,                       inline: true },
    { name: 'Provider', value: `<@${interaction.user.id}>`,  inline: true },
  ]);

  await interaction.editReply('`Status updated to En Route.`');
}

// ── Picked Up ─────────────────────────────────────────────────────────────────

async function handlePickedUp(interaction: ButtonInteraction, rideId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const ride = await rideService.getByRideId(rideId);
  if (!ride)                               { await interaction.editReply('`Ride not found.`'); return; }
  if (ride.providerId !== interaction.user.id) { await interaction.editReply('`You are not the assigned provider.`'); return; }
  if (ride.status !== 'EN_ROUTE')          { await interaction.editReply('`Invalid status transition.`'); return; }

  const updated = await rideService.updateStatus(rideId, 'PICKED_UP');
  await refreshRideEmbed(interaction, updated, interaction.user.tag);
  await notificationService.notify(interaction.client, updated.customerId, 'PICKED_UP', rideId);
  await logService.log(interaction.client, 'PICKED_UP', [
    { name: 'Ride ID',  value: rideId,                       inline: true },
    { name: 'Provider', value: `<@${interaction.user.id}>`,  inline: true },
  ]);

  await interaction.editReply('`Status updated to Picked Up.`');
}

// ── Complete ──────────────────────────────────────────────────────────────────

async function handleComplete(interaction: ButtonInteraction, rideId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const ride = await rideService.getByRideId(rideId);
  if (!ride)                               { await interaction.editReply('`Ride not found.`'); return; }
  if (ride.providerId !== interaction.user.id) { await interaction.editReply('`You are not the assigned provider.`'); return; }
  if (ride.status !== 'PICKED_UP')         { await interaction.editReply('`Invalid status transition.`'); return; }

  const updated = await rideService.updateStatus(rideId, 'COMPLETED');
  await refreshRideEmbed(interaction, updated, interaction.user.tag);

  // Stats
  await statsService.upsertProviderStats(interaction.user.id, { completedRides: 1, revenue: ride.fare });
  await statsService.upsertCustomerStats(ride.customerId, { completedRides: 1, spent: ride.fare });

  await notificationService.notify(interaction.client, updated.customerId, 'COMPLETED', rideId);
  await logService.log(interaction.client, 'COMPLETED', [
    { name: 'Ride ID',  value: rideId,                            inline: true },
    { name: 'Provider', value: `<@${interaction.user.id}>`,       inline: true },
    { name: 'Customer', value: `<@${ride.customerId}>`,           inline: true },
    { name: 'Fare',     value: `$${ride.fare.toFixed(2)}`,        inline: true },
  ]);

  // Send rating DM
  try {
    const customer = await interaction.client.users.fetch(ride.customerId);
    const ratingEmbed = new EmbedBuilder()
      .setTitle('Rate Your Ride')
      .setDescription(`How was your ride **${rideId}**? Please select a rating below.`)
      .setColor(0x5865f2)
      .setFooter({ text: 'GUHDRIDES DISPATCH SYSTEM' });
    await customer.send({ embeds: [ratingEmbed], components: [buildRatingButtons(rideId)] });
  } catch { /* DMs disabled */ }

  // Archive channel after 10 minutes
  if (ride.channelId) {
    channelService.archiveChannel(interaction.client, ride.channelId, 10 * 60 * 1000);
  }

  await interaction.editReply('`Ride completed. Rating request sent to customer.`');
}

// ── Cancel ────────────────────────────────────────────────────────────────────

async function handleCancel(interaction: ButtonInteraction, rideId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const member = await interaction.guild!.members.fetch(interaction.user.id);
  if (!isStaff(member)) {
    await interaction.editReply('`Only staff can cancel rides.`');
    return;
  }

  const ride = await rideService.getByRideId(rideId);
  if (!ride) { await interaction.editReply('`Ride not found.`'); return; }
  if (['COMPLETED', 'CANCELLED'].includes(ride.status)) {
    await interaction.editReply('`This ride is already closed.`');
    return;
  }

  const updated = await rideService.updateStatus(rideId, 'CANCELLED');
  await refreshRideEmbed(interaction, updated);

  if (ride.providerId) {
    await statsService.upsertProviderStats(ride.providerId, { cancelledRides: 1 });
  }
  await statsService.upsertCustomerStats(ride.customerId, { cancelledRides: 1 });

  await notificationService.notify(interaction.client, ride.customerId, 'CANCELLED', rideId);
  await logService.log(interaction.client, 'CANCELLED', [
    { name: 'Ride ID',    value: rideId,                         inline: true },
    { name: 'Cancelled by', value: `<@${interaction.user.id}>`, inline: true },
    { name: 'Customer',   value: `<@${ride.customerId}>`,        inline: true },
  ]);

  // Archive channel after 5 minutes
  if (ride.channelId) {
    channelService.archiveChannel(interaction.client, ride.channelId, 5 * 60 * 1000);
  }

  await interaction.editReply('`Ride cancelled.`');
}

// ── Rating ────────────────────────────────────────────────────────────────────

async function handleRating(
  interaction: ButtonInteraction,
  rideId: string,
  ratingStr: string,
): Promise<void> {
  await interaction.deferUpdate();

  const rating = parseInt(ratingStr, 10);
  if (isNaN(rating) || rating < 1 || rating > 5) {
    await interaction.followUp({ content: '`Invalid rating.`', ephemeral: true });
    return;
  }

  const ride = await rideService.getByRideId(rideId);
  if (!ride) { await interaction.followUp({ content: '`Ride not found.`', ephemeral: true }); return; }
  if (ride.customerId !== interaction.user.id) {
    await interaction.followUp({ content: '`Only the customer can rate this ride.`', ephemeral: true });
    return;
  }
  if (ride.rating !== null) {
    await interaction.followUp({ content: '`You have already rated this ride.`', ephemeral: true });
    return;
  }

  await rideService.setRating(rideId, rating);
  if (ride.providerId) {
    await statsService.upsertProviderStats(ride.providerId, { rating });
  }

  await logService.log(interaction.client, 'RATED', [
    { name: 'Ride ID',  value: rideId,                       inline: true },
    { name: 'Rating',   value: '★'.repeat(rating),           inline: true },
    { name: 'Customer', value: `<@${interaction.user.id}>`,  inline: true },
  ]);

  // Vouch if rating >= 4
  if (rating >= 4 && ride.providerId) {
    const vouchChannelId = rideConfig.channels.vouches;
    if (vouchChannelId) {
      try {
        const ch = await interaction.client.channels.fetch(vouchChannelId);
        if (ch instanceof TextChannel) {
          const embed = new EmbedBuilder()
            .setTitle('NEW VERIFIED VOUCH')
            .setColor(0xffd700)
            .addFields(
              { name: 'Ride ID',  value: rideId,                      inline: true },
              { name: 'Customer', value: `<@${ride.customerId}>`,      inline: true },
              { name: 'Provider', value: `<@${ride.providerId}>`,      inline: true },
              { name: 'Rating',   value: '★'.repeat(rating),          inline: true },
              { name: 'Date',     value: new Date().toLocaleDateString(), inline: true },
            )
            .setFooter({ text: 'GUHDRIDES DISPATCH SYSTEM' })
            .setTimestamp();
          await ch.send({ embeds: [embed] });
        }
      } catch { /* ignore */ }
    }
  }

  await interaction.editReply({
    content: `Thank you for rating your ride **${rideId}** with ${'★'.repeat(rating)}!`,
    components: [],
    embeds: [],
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function refreshRideEmbed(
  interaction: ButtonInteraction,
  ride: import('@prisma/client').RideRequest,
  providerTag?: string,
): Promise<void> {
  try {
    const embed   = buildRideEmbed(ride, providerTag);
    const buttons = buildRideButtons(ride);
    await interaction.message.edit({ embeds: [embed], components: buttons });
  } catch { /* message may be gone */ }
}
