import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  SubcommandGroupBuilder,
} from 'discord.js';
import { BookingService } from '../../services/booking/BookingService';
import { isStaff, isAdmin } from '../../utils/booking/permissions';

const bookingService = new BookingService();

export const data = new SlashCommandBuilder()
  .setName('booking')
  .setDescription('Booking system commands')
  .addSubcommand((sub) =>
    sub
      .setName('request')
      .setDescription('Create a new booking request')
  )
  .addSubcommand((sub) =>
    sub
      .setName('stats')
      .setDescription('View booking statistics')
  )
  .addSubcommand((sub) =>
    sub
      .setName('provider-stats')
      .setDescription('View your provider statistics')
  )
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('List open bookings')
  )
  .addSubcommand((sub) =>
    sub
      .setName('blacklist')
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addUserOption((opt) =>
        opt.setName('user').setDescription('User to blacklist').setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Reason for blacklist').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('unblacklist')
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addUserOption((opt) =>
        opt.setName('user').setDescription('User to unblacklist').setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'request') {
      await handleRequest(interaction);
    } else if (subcommand === 'stats') {
      await handleStats(interaction);
    } else if (subcommand === 'provider-stats') {
      await handleProviderStats(interaction);
    } else if (subcommand === 'list') {
      await handleList(interaction);
    } else if (subcommand === 'blacklist') {
      await handleBlacklist(interaction);
    } else if (subcommand === 'unblacklist') {
      await handleUnblacklist(interaction);
    }
  } catch (err) {
    console.error('[book command] Error:', err);
    await interaction.followUp({ content: '`Error occurred.`', ephemeral: true });
  }
}

async function handleRequest(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const isBlacklisted = await bookingService.isBlacklisted(interaction.user.id);
    if (isBlacklisted) {
      await interaction.followUp({ content: '`You are blacklisted and cannot create bookings.`', ephemeral: true });
      return;
    }

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`book:service:${interaction.user.id}`)
        .setPlaceholder('Select a Service')
        .addOptions(
          { label: 'Uber Eats', value: 'ubereats' },
          { label: 'DoorDash', value: 'doordash' },
          { label: 'Instacart', value: 'instacart' },
          { label: 'Walmart', value: 'walmart' },
          { label: 'Special Request', value: 'special' }
        )
    );

    await interaction.followUp({
      content: 'Select a service type:',
      components: [row],
      ephemeral: true,
    });
  } catch (err) {
    console.error('[book command] Request error:', err);
    await interaction.followUp({ content: '`Error occurred.`', ephemeral: true });
  }
}

async function handleStats(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const stats = await bookingService.getStats();
    const embed = new (await import('discord.js')).EmbedBuilder()
      .setTitle('BOOKING STATISTICS')
      .setColor(0x2f3136)
      .addFields(
        { name: 'Open', value: String(stats.open), inline: true },
        { name: 'Claimed', value: String(stats.claimed), inline: true },
        { name: 'Completed', value: String(stats.completed), inline: true },
        { name: 'Cancelled', value: String(stats.cancelled), inline: true }
      )
      .setFooter({ text: 'GUHD EATS BOOKING SYSTEM' });

    await interaction.followUp({ embeds: [embed], ephemeral: true });
  } catch (err) {
    console.error('[book command] Stats error:', err);
    await interaction.followUp({ content: '`Error occurred.`', ephemeral: true });
  }
}

async function handleProviderStats(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const member = await interaction.guild?.members.fetch(interaction.user.id);
    const isStaffMember = await isStaff(member || null, interaction.guild || null);

    if (!isStaffMember) {
      await interaction.followUp({ content: '`Only staff can view provider stats.`', ephemeral: true });
      return;
    }

    const embed = new (await import('discord.js')).EmbedBuilder()
      .setTitle('PROVIDER STATISTICS')
      .setColor(0x2f3136)
      .addFields(
        { name: 'Bookings Completed', value: '0', inline: true },
        { name: 'Average Rating', value: '0', inline: true },
        { name: 'Completion Rate', value: '0%', inline: true }
      )
      .setFooter({ text: 'GUHD EATS BOOKING SYSTEM' });

    await interaction.followUp({ embeds: [embed], ephemeral: true });
  } catch (err) {
    console.error('[book command] Provider stats error:', err);
    await interaction.followUp({ content: '`Error occurred.`', ephemeral: true });
  }
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    await interaction.followUp({ content: 'Open bookings list coming soon.', ephemeral: true });
  } catch (err) {
    console.error('[book command] List error:', err);
    await interaction.followUp({ content: '`Error occurred.`', ephemeral: true });
  }
}

async function handleBlacklist(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    await bookingService.addBlacklist(user.id, reason);
    await interaction.followUp({
      content: `✓ User \`${user.username}\` blacklisted: ${reason}`,
      ephemeral: true,
    });
  } catch (err) {
    console.error('[book command] Blacklist error:', err);
    await interaction.followUp({ content: '`Error occurred.`', ephemeral: true });
  }
}

async function handleUnblacklist(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const user = interaction.options.getUser('user', true);
    await bookingService.removeBlacklist(user.id);
    await interaction.followUp({
      content: `✓ User \`${user.username}\` unblacklisted.`,
      ephemeral: true,
    });
  } catch (err) {
    console.error('[book command] Unblacklist error:', err);
    await interaction.followUp({ content: '`Error occurred.`', ephemeral: true });
  }
}
