import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, TextChannel } from 'discord.js';
import type { Booking } from '@prisma/client';
import { config } from '../config';
import type { AppServices } from '../types';
import { buildVouchEmbed } from './bookingEmbeds';
import { prisma } from '../lib/prisma';

export async function triggerReviewFlow(client: Client, booking: Booking): Promise<void> {
  try {
    const customer = await client.users.fetch(booking.customerId);
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let star = 1; star <= 5; star++) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`gudhrides-review:rating:${booking.bookingNumber}:${star}`)
          .setLabel(`${star} Star${star > 1 ? 's' : ''}`)
          .setStyle(star >= 4 ? ButtonStyle.Success : ButtonStyle.Secondary)
      );
    }
    await customer.send({
      content: `Your booking **${booking.bookingNumber}** has been completed! Please rate your experience:`,
      components: [row],
    });
  } catch (err) {
    console.error(`[Bot] Failed to DM customer for review: ${booking.customerId}`, err);
  }
}

export async function handleReviewRating(
  bookingNumber: string,
  rating: number,
  services: AppServices,
  client: Client
): Promise<{ ok: boolean; message: string }> {
  const booking = await services.booking.setRating(bookingNumber, rating);
  if (!booking) {
    return { ok: false, message: 'This booking cannot be rated or was already rated.' };
  }
  if (booking.providerId) {
    await services.providerStats.recalculateAvgRating(booking.providerId);
  }
  if (rating >= 4 && booking.providerId) {
    await createVouch(client, booking);
  }
  return { ok: true, message: `Thank you! You rated this booking **${rating}/5** stars.` };
}

async function createVouch(client: Client, booking: Booking): Promise<void> {
  if (!booking.providerId) return;
  const existing = await prisma.vouch.findUnique({ where: { bookingId: booking.id } });
  if (existing) return;

  await prisma.user.upsert({
    where: { discordId: booking.customerId },
    create: { discordId: booking.customerId },
    update: {},
  });
  await prisma.user.upsert({
    where: { discordId: booking.providerId },
    create: { discordId: booking.providerId },
    update: {},
  });
  await prisma.vouch.create({
    data: {
      bookingId: booking.id,
      customerId: booking.customerId,
      providerId: booking.providerId,
      rating: booking.rating ?? 0,
    },
  });

  if (config.channels.vouch === '0') {
    console.warn('[Bot] VOUCH_CHANNEL_ID not configured; vouch saved but not posted.');
    console.log(`[Bot] Vouch Created: ${booking.bookingNumber}`);
    return;
  }

  try {
    const channel = await client.channels.fetch(config.channels.vouch);
    if (!channel?.isTextBased()) return;
    const embed = buildVouchEmbed(booking, `<@${booking.customerId}>`, `<@${booking.providerId}>`);
    await (channel as TextChannel).send({ embeds: [embed] });
    console.log(`[Bot] Vouch Created: ${booking.bookingNumber}`);
  } catch (err) {
    console.error('[Bot] Failed to post vouch embed:', err);
  }
}
