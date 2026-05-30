import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import type { AppServices } from '../types';
import {
  ephemeralReply,
  hasAdminRole,
  hasStaffRole,
  memberFromInteraction,
  baseEmbed,
  ephemeralEmbed,
  COLOR,
  DIVIDER,
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

// ---------------------------------------------------------------------------
// /book — create a booking ticket
// ---------------------------------------------------------------------------

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

    const embed = baseEmbed(COLOR.WIN, '—', interaction.guild)
      .setTitle('🎫  Booking Ticket Created')
      .setDescription(
        `Your private booking channel is open.\n${DIVIDER}\n` +
        `A staff member will meet you here shortly.\n\n> <#${channelId}>`
      )
      .addFields({ name: '◈ Ticket ID', value: `\`${ticketId}\``, inline: true })
      .setThumbnail(interaction.user.displayAvatarURL());

    await ephemeralEmbed(interaction, embed);
  } catch (err) {
    const errEmbed = new EmbedBuilder()
      .setColor(COLOR.ERROR)
      .setTitle('✕  Failed to Create Ticket')
      .setDescription(`${DIVIDER}\n${err instanceof Error ? err.message : 'Something went wrong. Please try again.'}`)
      .setFooter({ text: 'Guhd Rides' })
      .setTimestamp();
    await ephemeralEmbed(interaction, errEmbed);
  }
}

// ---------------------------------------------------------------------------
// /ticket — manage an existing ticket (staff only)
// ---------------------------------------------------------------------------

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
  const sub       = interaction.options.getSubcommand();

  switch (sub) {
    case 'close': {
      const reason = interaction.options.getString('reason') ?? 'No reason provided';
      await services.ticket.closeTicket(interaction.client, channelId, reason);
      const embed = baseEmbed(COLOR.ERROR, '—', interaction.guild)
        .setTitle('🔒  Ticket Closed')
        .setDescription(`${DIVIDER}\n${reason}`);
      await ephemeralEmbed(interaction, embed);
      break;
    }
    case 'assign': {
      const staff = interaction.options.getUser('staff', true);
      await services.ticket.assignTicket(channelId, staff.id);
      const embed = baseEmbed(COLOR.PRIMARY, '—', interaction.guild)
        .setTitle('👤  Assigned')
        .setDescription(`${DIVIDER}\nStaff: <@${staff.id}>`)
        .addFields({ name: '✦ Handler', value: `<@${staff.id}>`, inline: true });
      await ephemeralEmbed(interaction, embed);
      break;
    }
    case 'add_note': {
      const text = interaction.options.getString('text', true);
      await services.ticket.addNote(channelId, text);
      const embed = baseEmbed(COLOR.INFO, '—', interaction.guild)
        .setTitle('📝  Note Added')
        .setDescription(`${DIVIDER}\n*${text}*`);
      await ephemeralEmbed(interaction, embed);
      break;
    }
    case 'reopen': {
      await services.ticket.reopenTicket(interaction.client, channelId);
      const embed = baseEmbed(COLOR.WIN, '—', interaction.guild)
        .setTitle('🔓  Ticket Reopened')
        .setDescription(`${DIVIDER}\nThis ticket is open. Staff have been notified.`);
      await ephemeralEmbed(interaction, embed);
      break;
    }
    default:
      await ephemeralReply(interaction, 'Unknown subcommand.');
  }
}
