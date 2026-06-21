import {
  ButtonInteraction,
  CategoryChannel,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { BookingService } from '../../services/booking/BookingService';
import { createBookingEmbed, createVouchEmbed } from '../../utils/booking/embeds';
import { isStaff } from '../../utils/booking/permissions';
import { config } from '../../config';

const bookingService = new BookingService();

export async function handleBookingButton(interaction: ButtonInteraction): Promise<void> {
  const [action, bookingId, userId] = interaction.customId.split(':').slice(1);

  if (action === 'create') {
    await handleCreateChannel(interaction, bookingId);
  } else if (action === 'claim') {
    await handleClaimBooking(interaction, bookingId);
  } else if (action === 'inprogress') {
    await handleInProgress(interaction, bookingId);
  } else if (action === 'complete') {
    await handleComplete(interaction, bookingId);
  } else if (action === 'cancel') {
    await handleCancel(interaction, bookingId);
  } else if (action.startsWith('rate')) {
    await handleRating(interaction, bookingId, action);
  }
}

async function handleCreateChannel(interaction: ButtonInteraction, bookingId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const booking = await bookingService.getBooking(bookingId);
    if (!booking) {
      await interaction.followUp({ content: '`Booking not found.`', ephemeral: true });
      return;
    }

    const guild = interaction.guild;
    if (!guild) return;

    let category = await guild.channels.cache.find(
      (c) => c.name === 'Bookings' && c.type === ChannelType.GuildCategory
    );
    if (!category) {
      category = await guild.channels.create({
        name: 'Bookings',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        ],
      });
    }

    const channelName = `booking-${interaction.user.username.substring(0, 8)}-${bookingId.toLowerCase()}`;
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: config.roles.staff, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: config.roles.admin, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    });

    await bookingService.updateStatus(bookingId, 'OPEN');

    const embed = createBookingEmbed({
      bookingId,
      customerName: interaction.user.username,
      serviceType: booking.serviceType,
      orderAmount: booking.orderAmount,
      address: booking.address,
      deliveryTime: booking.deliveryTime,
      paymentMethod: booking.paymentMethod,
      status: 'OPEN',
    });

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`book:claim:${bookingId}`)
        .setLabel('CLAIM')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`book:cancel:${bookingId}`)
        .setLabel('CANCEL')
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [embed], components: [buttons] });
    await interaction.followUp({
      content: `✓ Channel created: <#${channel.id}>`,
      ephemeral: true,
    });
  } catch (err) {
    console.error('[bookingButtons] Create channel error:', err);
    await interaction.followUp({ content: '`Error occurred.`', ephemeral: true });
  }
}

async function handleClaimBooking(interaction: ButtonInteraction, bookingId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const member = await interaction.guild?.members.fetch(interaction.user.id);
    const isStaffMember = await isStaff(member || null, interaction.guild);

    if (!isStaffMember) {
      await interaction.followUp({ content: '`Only staff can claim bookings.`', ephemeral: true });
      return;
    }

    const booking = await bookingService.getBooking(bookingId);
    if (!booking) {
      await interaction.followUp({ content: '`Booking not found.`', ephemeral: true });
      return;
    }

    await bookingService.claimBooking(bookingId, interaction.user.id);

    const embed = new EmbedBuilder()
      .setTitle('BOOKING CLAIMED')
      .setColor(0x00ff00)
      .setDescription(`Booking claimed by <@${interaction.user.id}>`);

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`book:inprogress:${bookingId}`)
        .setLabel('IN PROGRESS')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`book:complete:${bookingId}`)
        .setLabel('COMPLETE')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`book:cancel:${bookingId}`)
        .setLabel('CANCEL')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.channel?.send({ embeds: [embed], components: [buttons] });
    await interaction.user.send(`✓ You claimed booking \`${bookingId}\``).catch(() => null);
    await interaction.followUp({ content: '✓ Booking claimed.', ephemeral: true });
  } catch (err) {
    console.error('[bookingButtons] Claim error:', err);
    await interaction.followUp({ content: '`Error occurred.`', ephemeral: true });
  }
}

async function handleInProgress(interaction: ButtonInteraction, bookingId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const booking = await bookingService.getBooking(bookingId);
    if (booking?.providerId !== interaction.user.id) {
      await interaction.followUp({ content: '`Only the assigned provider can update this.`', ephemeral: true });
      return;
    }

    await bookingService.updateStatus(bookingId, 'IN_PROGRESS');
    const embed = new EmbedBuilder().setTitle('STATUS: IN PROGRESS').setColor(0xffff00);
    await interaction.channel?.send({ embeds: [embed] });
    await interaction.user.send(`✓ Booking \`${bookingId}\` is now in progress.`).catch(() => null);
    await interaction.followUp({ content: '✓ Status updated.', ephemeral: true });
  } catch (err) {
    console.error('[bookingButtons] In progress error:', err);
    await interaction.followUp({ content: '`Error occurred.`', ephemeral: true });
  }
}

async function handleComplete(interaction: ButtonInteraction, bookingId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const booking = await bookingService.getBooking(bookingId);
    if (booking?.providerId !== interaction.user.id) {
      await interaction.followUp({ content: '`Only the assigned provider can complete this.`', ephemeral: true });
      return;
    }

    await bookingService.updateStatus(bookingId, 'COMPLETED');
    const embed = new EmbedBuilder().setTitle('STATUS: COMPLETED').setColor(0x00ff00);
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`book:rate1:${bookingId}`)
        .setLabel('⭐')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`book:rate2:${bookingId}`)
        .setLabel('⭐⭐')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`book:rate3:${bookingId}`)
        .setLabel('⭐⭐⭐')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`book:rate4:${bookingId}`)
        .setLabel('⭐⭐⭐⭐')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`book:rate5:${bookingId}`)
        .setLabel('⭐⭐⭐⭐⭐')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.channel?.send({ embeds: [embed], components: [buttons] });
    await interaction.user.send(`✓ Booking \`${bookingId}\` completed. Waiting for rating.`).catch(() => null);
    await interaction.followUp({ content: '✓ Booking completed. Awaiting customer rating.', ephemeral: true });
  } catch (err) {
    console.error('[bookingButtons] Complete error:', err);
    await interaction.followUp({ content: '`Error occurred.`', ephemeral: true });
  }
}

async function handleCancel(interaction: ButtonInteraction, bookingId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const booking = await bookingService.getBooking(bookingId);
    if (booking?.providerId && booking.providerId !== interaction.user.id) {
      await interaction.followUp({ content: '`Only the assigned provider or customer can cancel.`', ephemeral: true });
      return;
    }

    await bookingService.updateStatus(bookingId, 'CANCELLED');
    const embed = new EmbedBuilder().setTitle('STATUS: CANCELLED').setColor(0xff0000);
    await interaction.channel?.send({ embeds: [embed] });
    await interaction.followUp({ content: '✓ Booking cancelled.', ephemeral: true });
  } catch (err) {
    console.error('[bookingButtons] Cancel error:', err);
    await interaction.followUp({ content: '`Error occurred.`', ephemeral: true });
  }
}

async function handleRating(interaction: ButtonInteraction, bookingId: string, ratingType: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const rating = parseInt(ratingType.replace('rate', ''), 10);
    await bookingService.setRating(bookingId, rating);

    const booking = await bookingService.getBooking(bookingId);
    if (booking && booking.providerId) {
      const provider = await interaction.client.users.fetch(booking.providerId).catch(() => null);
      const vouchEmbed = createVouchEmbed(
        interaction.user.username,
        provider?.username || 'Unknown',
        rating,
        bookingId
      );

      const vouchChannel = interaction.guild?.channels.cache.find((c) => c.name === 'vouches');
      if (vouchChannel && vouchChannel.isTextBased()) {
        await vouchChannel.send({ embeds: [vouchEmbed] });
      }

      if (provider) {
        await provider.send(`✓ You received a ${rating}⭐ rating for booking \`${bookingId}\``).catch(() => null);
      }
    }

    await interaction.followUp({ content: `✓ Rating submitted: ${rating}⭐`, ephemeral: true });
  } catch (err) {
    console.error('[bookingButtons] Rating error:', err);
    await interaction.followUp({ content: '`Error occurred.`', ephemeral: true });
  }
}
