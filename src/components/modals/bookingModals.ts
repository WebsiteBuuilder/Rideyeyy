import { ModalSubmitInteraction, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { getWizardState } from './bookingSelectMenus';

export async function handleAmountModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const userId = interaction.user.id;
    const amount = interaction.fields.getTextInputValue('amount');

    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      await interaction.followUp({
        content: '`Invalid amount. Please enter a positive number.`',
        ephemeral: true,
      });
      return;
    }

    const state = getWizardState().get(userId) || {};
    state.amount = amount;
    getWizardState().set(userId, state);

    const modal = await import('discord.js').then((m) => {
      const { ModalBuilder, TextInputBuilder, TextInputStyle } = m;
      const mod = new ModalBuilder()
        .setCustomId(`book:modal:address:${userId}`)
        .setTitle('Delivery Address');
      const input = new TextInputBuilder()
        .setCustomId('address')
        .setLabel('Delivery Address')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500);
      mod.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      return mod;
    });

    await interaction.showModal(modal);
  } catch (err) {
    console.error('[bookingModals] Amount modal error:', err);
    await interaction.followUp({ content: '`Error occurred.`', ephemeral: true });
  }
}

export async function handleAddressModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const userId = interaction.user.id;
    const address = interaction.fields.getTextInputValue('address');

    if (!address || address.length < 5) {
      await interaction.followUp({
        content: '`Address must be at least 5 characters.`',
        ephemeral: true,
      });
      return;
    }

    const state = getWizardState().get(userId) || {};
    state.address = address;
    getWizardState().set(userId, state);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`book:deliverytime:${userId}`)
        .setPlaceholder('Select Delivery Time')
        .addOptions(
          { label: 'ASAP', value: 'asap' },
          { label: '30 Minutes', value: '30min' },
          { label: '1 Hour', value: '1hour' },
          { label: '2 Hours', value: '2hours' },
          { label: 'Custom', value: 'custom' }
        )
    );

    await interaction.followUp({
      content: 'Select a delivery time:',
      components: [row],
      ephemeral: true,
    });
  } catch (err) {
    console.error('[bookingModals] Address modal error:', err);
    await interaction.followUp({ content: '`Error occurred.`', ephemeral: true });
  }
}
