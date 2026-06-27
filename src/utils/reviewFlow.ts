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

  // Persist the vouch record — best-effort; a DB hiccup here must never stop us
  // from posting the public vouch.
  try {
    const existing = await prisma.vouch.findUnique({ where: { bookingId: booking.id } });
    if (!existing) {
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
    }
  } catch (err) {
    console.error('[Bot] Failed to persist vouch record (continuing to post):', err);
  }

  if (config.channels.vouch === '0') {
    console.warn(
      '[Bot] VOUCH_CHANNEL_ID is not set — vouch recorded but cannot be posted. ' +
        'Set VOUCH_CHANNEL_ID to your vouch channel ID.'
    );
    return;
  }

  const channel = await client.channels.fetch(config.channels.vouch).catch(() => null);
  if (!channel) {
    console.error(
      `[Bot] Vouch channel ${config.channels.vouch} could not be fetched (wrong ID or missing access).`
    );
    return;
  }
  if (!channel.isTextBased() || channel.isDMBased()) {
    console.error(
      `[Bot] Vouch channel ${config.channels.vouch} is not a text channel the bot can post in.`
    );
    return;
  }

  try {
    const embed = buildVouchEmbed(booking, `<@${booking.customerId}>`, `<@${booking.providerId}>`);
    await (channel as TextChannel).send({ embeds: [embed] });
    console.log(`[Bot] Vouch posted to ${config.channels.vouch}: ${booking.bookingNumber}`);
  } catch (err) {
    console.error('[Bot] Failed to post vouch embed, trying plain-text fallback:', err);
    try {
      await (channel as TextChannel).send(
        `⭐ **Vouch** — <@${booking.providerId}> rated **${booking.rating ?? 0}/5** by <@${booking.customerId}> ` +
          `(booking \`${booking.bookingNumber}\`).`
      );
      console.log(`[Bot] Vouch posted (plain text): ${booking.bookingNumber}`);
    } catch (err2) {
      console.error('[Bot] Fallback vouch post also failed:', err2);
    }
  }
}
