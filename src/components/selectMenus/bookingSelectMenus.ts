import { StringSelectMenuInteraction, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } from 'discord.js';
import { BookingService } from '../../services/booking/BookingService';

const bookingService = new BookingService();
const wizardState = new Map<string, Record<string, any>>();

export async function handleServiceSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const userId = interaction.user.id;
    const serviceType = interaction.values[0];

    if (!wizardState.has(userId)) {
      wizardState.set(userId, {});
    }
    wizardState.get(userId)!.serviceType = serviceType;

    const modal = new ModalBuilder()
      .setCustomId(`book:modal:amount:${userId}`)
      .setTitle('Order Amount');
    const input = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel('Order Amount (USD)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., 50')
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
  } catch (err) {
    console.error('[bookingSelectMenus] Service select error:', err);
    await interaction.followUp({ content: '`Error occurred.`', ephemeral: true });
  }
}

export async function handleDeliveryTimeSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const userId = interaction.user.id;
    const deliveryTime = interaction.values[0];

    if (!wizardState.has(userId)) {
      wizardState.set(userId, {});
    }
    wizardState.get(userId)!.deliveryTime = deliveryTime;

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`book:payment:${userId}`)
        .setPlaceholder('Select Payment Method')
        .addOptions(
          { label: 'Cash App', value: 'cashapp' },
          { label: 'Apple Pay', value: 'applepay' },
          { label: 'Zelle', value: 'zelle' },
          { label: 'PayPal', value: 'paypal' },
          { label: 'Other', value: 'other' }
        )
    );

    await interaction.followUp({
      content: 'Select a payment method:',
      components: [row],
      ephemeral: true,
    });
  } catch (err) {
    console.error('[bookingSelectMenus] Delivery time select error:', err);
    await interaction.followUp({ content: '`Error occurred.`', ephemeral: true });
  }
}

export async function handlePaymentMethodSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const userId = interaction.user.id;
    const paymentMethod = interaction.values[0];

    if (!wizardState.has(userId)) {
      wizardState.set(userId, {});
    }
    const state = wizardState.get(userId)!;
    state.paymentMethod = paymentMethod;

    if (!state.serviceType || !state.amount || !state.address || !state.deliveryTime) {
      await interaction.followUp({
        content: '`Booking data incomplete. Please start over with /book.`',
        ephemeral: true,
      });
      return;
    }

    const isBlacklisted = await bookingService.isBlacklisted(userId);
    if (isBlacklisted) {
      await interaction.followUp({
        content: '`You are blacklisted and cannot create bookings.`',
        ephemeral: true,
      });
      wizardState.delete(userId);
      return;
    }

    const openCount = await bookingService.getOpenBookingsForUser(userId);
    if (openCount >= 3) {
      await interaction.followUp({
        content: '`Maximum 3 open bookings per customer. Complete or cancel existing bookings first.`',
        ephemeral: true,
      });
      wizardState.delete(userId);
      return;
    }

    const { bookingId, channelName } = await bookingService.createBooking({
      userId,
      serviceType: state.serviceType,
      orderAmount: parseFloat(state.amount),
      address: state.address,
      deliveryTime: state.deliveryTime,
      paymentMethod,
    });

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`book:create:${bookingId}`)
        .setLabel('Create Channel')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.followUp({
      content: `✓ Booking created! ID: \`${bookingId}\`\n\nChannel: \`${channelName}\``,
      components: [buttons],
      ephemeral: true,
    });

    wizardState.delete(userId);
  } catch (err) {
    console.error('[bookingSelectMenus] Payment select error:', err);
    await interaction.followUp({ content: '`Error occurred.`', ephemeral: true });
  }
}

export function getWizardState(): Map<string, Record<string, any>> {
  return wizardState;
}
