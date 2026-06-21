import {
  ActionRowBuilder,
  ButtonBuilder,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
} from 'discord.js';
import { wizardState } from '../../utils/ride/wizardState';

// ── Step 2 — Pickup Modal submit ──────────────────────────────────────────────

export async function handlePickupModal(interaction: ModalSubmitInteraction): Promise<void> {
  const userId = interaction.user.id;
  const pickup = interaction.fields.getTextInputValue('pickup').trim();

  const state = wizardState.get(userId) ?? {};
  state.pickup = pickup;
  wizardState.set(userId, state);

  // Step 3 — open dropoff modal is not possible to chain here in Discord.
  // We show an intermediate button that opens the next modal on click.
  const { ButtonStyle } = await import('discord.js');
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ride:opendropoff:${userId}`)
      .setLabel('Continue — Enter Dropoff Location')
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({
    content: `Pickup set to: **${pickup}**\nClick below to enter your dropoff location.`,
    components: [row],
    ephemeral: true,
  });
}

// ── Step 3 — Dropoff Modal submit ─────────────────────────────────────────────

export async function handleDropoffModal(interaction: ModalSubmitInteraction): Promise<void> {
  const userId  = interaction.user.id;
  const dropoff = interaction.fields.getTextInputValue('dropoff').trim();

  const state = wizardState.get(userId) ?? {};
  state.dropoff = dropoff;
  wizardState.set(userId, state);

  const { ButtonStyle } = await import('discord.js');
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ride:openfare:${userId}`)
      .setLabel('Continue — Enter Estimated Fare')
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({
    content: `Dropoff set to: **${dropoff}**\nClick below to enter the estimated fare.`,
    components: [row],
    ephemeral: true,
  });
}

// ── Step 4 — Fare Modal submit ────────────────────────────────────────────────

export async function handleFareModal(interaction: ModalSubmitInteraction): Promise<void> {
  const userId = interaction.user.id;
  const raw    = interaction.fields.getTextInputValue('fare').trim();
  const fare   = parseFloat(raw);

  if (isNaN(fare) || fare <= 0) {
    await interaction.reply({ content: '`Please enter a valid fare amount (e.g. 25.00).`', ephemeral: true });
    return;
  }

  const state = wizardState.get(userId) ?? {};
  state.fare  = fare;
  wizardState.set(userId, state);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ride:step5:${userId}`)
      .setPlaceholder('When do you need this ride?')
      .addOptions([
        { label: 'ASAP',           value: 'ASAP'           },
        { label: '30 Minutes',     value: '30 Minutes'     },
        { label: '1 Hour',         value: '1 Hour'         },
        { label: '2 Hours',        value: '2 Hours'        },
        { label: 'Schedule Later', value: 'Schedule Later' },
      ]),
  );

  await interaction.reply({
    content: `Fare set to: **$${fare.toFixed(2)}**\nStep 5 of 6 — When do you need this ride?`,
    components: [row],
    ephemeral: true,
  });
}
