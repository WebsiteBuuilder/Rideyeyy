import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { AppServices } from '../types';
import {
  ephemeralReply,
  hasAdminRole,
  hasStaffRole,
  memberFromInteraction,
} from '../utils/discord';

export const bookData = new SlashCommandBuilder()
  .setName('book')
  .setDescription('Open a private ride booking ticket');

export const ticketData = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Manage booking tickets')
  .addSubcommand((s) =>
    s
      .setName('close')
      .setDescription('Close this ticket')
      .addStringOption((o) => o.setName('reason').setDescription('Close reason').setRequired(false))
  )
  .addSubcommand((s) =>
    s
      .setName('assign')
      .setDescription('Assign staff to ticket')
      .addUserOption((o) => o.setName('staff').setDescription('Staff member').setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName('add_note')
      .setDescription('Add a note to ticket')
      .addStringOption((o) => o.setName('text').setDescription('Note text').setRequired(true))
  )
  .addSubcommand((s) => s.setName('reopen').setDescription('Reopen a closed ticket'));

export async function handleBook(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  if (!interaction.guild || !interaction.member) {
    await ephemeralReply(interaction, 'Must be used in a server.');
    return;
  }

  const member = memberFromInteraction(interaction);
  if (!member) return;

  try {
    const { ticketId, channelId } = await services.ticket.createBookingTicket(
      interaction.client,
      interaction.guild,
      member
    );
    await ephemeralReply(
      interaction,
      `Booking ticket created! <#${channelId}> (ID: \`${ticketId}\`)`
    );
  } catch (err) {
    await ephemeralReply(interaction, err instanceof Error ? err.message : 'Failed to create ticket.');
  }
}

export async function handleTicket(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const member = memberFromInteraction(interaction);
  if (!member || (!hasStaffRole(member) && !hasAdminRole(member))) {
    await ephemeralReply(interaction, 'Staff permission required.');
    return;
  }

  const channelId = interaction.channelId;
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case 'close': {
      const reason = interaction.options.getString('reason') ?? undefined;
      await services.ticket.closeTicket(interaction.client, channelId, reason);
      await ephemeralReply(interaction, 'Ticket closed.');
      break;
    }
    case 'assign': {
      const staff = interaction.options.getUser('staff', true);
      await services.ticket.assignTicket(channelId, staff.id);
      await ephemeralReply(interaction, `Assigned to ${staff.username}.`);
      break;
    }
    case 'add_note': {
      const text = interaction.options.getString('text', true);
      await services.ticket.addNote(channelId, text);
      await ephemeralReply(interaction, 'Note added.');
      break;
    }
    case 'reopen': {
      await services.ticket.reopenTicket(interaction.client, channelId);
      await ephemeralReply(interaction, 'Ticket reopened.');
      break;
    }
  }
}
