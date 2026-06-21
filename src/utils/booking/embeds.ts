import { EmbedBuilder } from 'discord.js';

interface BookingData {
  bookingId: string;
  customerName: string;
  serviceType: string;
  orderAmount: number;
  address: string;
  deliveryTime: string;
  paymentMethod: string;
  status: string;
  providerName?: string;
  rating?: number;
}

export function createBookingEmbed(data: BookingData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('NEW GUHD EATS BOOKING')
    .setColor(0x2f3136)
    .addFields(
      { name: 'Booking ID', value: data.bookingId, inline: true },
      { name: 'Customer', value: data.customerName, inline: true },
      { name: 'Service', value: data.serviceType, inline: true },
      { name: 'Amount', value: `$${data.orderAmount}`, inline: true },
      { name: 'Address', value: data.address, inline: false },
      { name: 'Delivery Time', value: data.deliveryTime, inline: true },
      { name: 'Payment Method', value: data.paymentMethod, inline: true },
      { name: 'Status', value: data.status, inline: true }
    );

  if (data.providerName) {
    embed.addFields({ name: 'Assigned Provider', value: data.providerName, inline: true });
  }

  if (data.rating) {
    embed.addFields({ name: 'Rating', value: '⭐'.repeat(data.rating), inline: true });
  }

  embed.setFooter({ text: 'GUHD EATS BOOKING SYSTEM' });
  return embed;
}

export function createVouchEmbed(customerName: string, providerName: string, rating: number, bookingId: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('NEW VOUCH')
    .setColor(0x00ff00)
    .addFields(
      { name: 'Customer', value: customerName, inline: true },
      { name: 'Provider', value: providerName, inline: true },
      { name: 'Rating', value: '⭐'.repeat(rating), inline: true },
      { name: 'Booking ID', value: bookingId, inline: true }
    )
    .setFooter({ text: 'GUHD EATS BOOKING SYSTEM' });
}
