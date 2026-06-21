import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { blacklistService } from '../../services/ride/BlacklistService';
import { rideService }      from '../../services/ride/RideService';
import { statsService }     from '../../services/ride/StatsService';
import { logService }       from '../../services/ride/LogService';
import { isStaff, isAdmin } from '../../utils/permissions/ridePermissions';
import { wizardState, rideCooldowns, RIDE_COOLDOWN_MS, MAX_ACTIVE_RIDES } from '../../utils/ride/wizardState';

// ── Command definition ────────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('ride')
  .setDescription('GUHDRIDES dispatch system')
  .addSubcommand((s) => s.setName('request').setDescription('Request a ride'))
  .addSubcommand((s) => s.setName('list').setDescription('List all active rides (staff)'))
  .addSubcommand((s) => s.setName('stats').setDescription('View ride statistics (staff)'))
  .addSubcommand((s) => s.setName('leaderboard').setDescription('Provider leaderboard (staff)'))
  .addSubcommand((s) =>
    s.setName('provider-stats')
      .setDescription('View provider profile (staff)')
      .addUserOption((o) => o.setName('provider').setDescription('Provider to view').setRequired(true)),
  )
  .addSubcommand((s) =>
    s.setName('blacklist')
      .setDescription('Blacklist a user (staff)')
      .addUserOption((o) => o.setName('user').setDescription('User to blacklist').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true)),
  )
  .addSubcommand((s) =>
    s.setName('unblacklist')
      .setDescription('Remove blacklist (staff)')
      .addUserOption((o) => o.setName('user').setDescription('User to unblacklist').setRequired(true)),
  )
  .addSubcommand((s) =>
    s.setName('force-close')
      .setDescription('Force close a ride (admin)')
      .addStringOption((o) => o.setName('ride-id').setDescription('Ride ID (e.g. GR-0001)').setRequired(true)),
  )
  .addSubcommand((s) =>
    s.setName('history')
      .setDescription('View ride history (staff)')
      .addIntegerOption((o) => o.setName('limit').setDescription('Number of rides').setMinValue(1).setMaxValue(50)),
  );

// ── Entry point ───────────────────────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand(true);

  switch (sub) {
    case 'request':        await handleRequest(interaction);       break;
    case 'list':           await handleList(interaction);          break;
    case 'stats':          await handleStats(interaction);         break;
    case 'leaderboard':    await handleLeaderboard(interaction);   break;
    case 'provider-stats': await handleProviderStats(interaction); break;
    case 'blacklist':      await handleBlacklist(interaction);     break;
    case 'unblacklist':    await handleUnblacklist(interaction);   break;
    case 'force-close':    await handleForceClose(interaction);    break;
    case 'history':        await handleHistory(interaction);       break;
    default:
      await interaction.reply({ content: '`Unknown subcommand.`', ephemeral: true });
  }
}

// ── /ride request ─────────────────────────────────────────────────────────────

async function handleRequest(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  // Blacklist check
  if (await blacklistService.isBlacklisted(userId)) {
    await interaction.reply({ content: '`You are blacklisted from using GUHDRIDES.`', ephemeral: true });
    return;
  }

  // Cooldown check
  const lastRequest = rideCooldowns.get(userId);
  if (lastRequest && Date.now() - lastRequest < RIDE_COOLDOWN_MS) {
    const remaining = Math.ceil((RIDE_COOLDOWN_MS - (Date.now() - lastRequest)) / 1000);
    await interaction.reply({ content: `\`Please wait ${remaining}s before requesting another ride.\``, ephemeral: true });
    return;
  }

  // Max active rides check
  const activeRides = await rideService.getActiveRidesByCustomer(userId);
  if (activeRides.length >= MAX_ACTIVE_RIDES) {
    await interaction.reply({ content: `\`You already have ${MAX_ACTIVE_RIDES} active rides. Complete or cancel them first.\``, ephemeral: true });
    return;
  }

  rideCooldowns.set(userId, Date.now());
  wizardState.set(userId, {});

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ride:step1:${userId}`)
      .setPlaceholder('Choose your ride type')
      .addOptions([
        { label: 'Standard Ride',    value: 'Standard Ride'    },
        { label: 'Premium Ride',     value: 'Premium Ride'     },
        { label: 'Airport Ride',     value: 'Airport Ride'     },
        { label: 'Scheduled Ride',   value: 'Scheduled Ride'   },
        { label: 'Delivery Request', value: 'Delivery Request' },
        { label: 'Custom Request',   value: 'Custom Request'   },
      ]),
  );

  await interaction.reply({
    content: 'Step 1 of 6 — Choose your ride type:',
    components: [row],
    ephemeral: true,
  });
}

// ── /ride list ────────────────────────────────────────────────────────────────

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = await interaction.guild!.members.fetch(interaction.user.id);
  if (!isStaff(member)) {
    await interaction.reply({ content: '`Staff only.`', ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const rides = await rideService.getAllActive();
  if (rides.length === 0) {
    await interaction.editReply('`No active rides.`');
    return;
  }

  const lines = rides.map((r) =>
    `**${r.rideId}** — ${r.status} — <@${r.customerId}>${r.providerId ? ` — Provider: <@${r.providerId}>` : ''}`,
  );
  const embed = new EmbedBuilder()
    .setTitle('Active Rides')
    .setDescription(lines.join('\n'))
    .setColor(0x5865f2)
    .setFooter({ text: 'GUHDRIDES DISPATCH SYSTEM' })
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

// ── /ride stats ───────────────────────────────────────────────────────────────

async function handleStats(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = await interaction.guild!.members.fetch(interaction.user.id);
  if (!isStaff(member)) {
    await interaction.reply({ content: '`Staff only.`', ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const [statusMap, revenue, avgRating] = await Promise.all([
    rideService.getRidesByStatus(),
    rideService.getTotalRevenue(),
    rideService.getAverageRating(),
  ]);

  const embed = new EmbedBuilder()
    .setTitle('GUHDRIDES Statistics')
    .setColor(0x5865f2)
    .addFields(
      { name: 'Open',      value: String(statusMap['OPEN']      ?? 0), inline: true },
      { name: 'Claimed',   value: String(statusMap['CLAIMED']   ?? 0), inline: true },
      { name: 'En Route',  value: String(statusMap['EN_ROUTE']  ?? 0), inline: true },
      { name: 'Completed', value: String(statusMap['COMPLETED'] ?? 0), inline: true },
      { name: 'Cancelled', value: String(statusMap['CANCELLED'] ?? 0), inline: true },
      { name: 'Revenue',   value: `$${revenue.toFixed(2)}`,            inline: true },
      { name: 'Avg Rating',value: avgRating.toFixed(2),                inline: true },
    )
    .setFooter({ text: 'GUHDRIDES DISPATCH SYSTEM' })
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

// ── /ride leaderboard ─────────────────────────────────────────────────────────

async function handleLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = await interaction.guild!.members.fetch(interaction.user.id);
  if (!isStaff(member)) {
    await interaction.reply({ content: '`Staff only.`', ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const rows = await statsService.getProviderLeaderboard();
  if (rows.length === 0) {
    await interaction.editReply('`No provider data yet.`');
    return;
  }

  const lines = rows.map(
    (r, i) =>
      `**${i + 1}.** <@${r.providerId}> — ${r.completedRides} rides — $${r.totalRevenue.toFixed(2)} — ${r.averageRating.toFixed(1)} avg`,
  );
  const embed = new EmbedBuilder()
    .setTitle('Provider Leaderboard')
    .setDescription(lines.join('\n'))
    .setColor(0xffd700)
    .setFooter({ text: 'GUHDRIDES DISPATCH SYSTEM' })
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

// ── /ride provider-stats ──────────────────────────────────────────────────────

async function handleProviderStats(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = await interaction.guild!.members.fetch(interaction.user.id);
  if (!isStaff(member)) {
    await interaction.reply({ content: '`Staff only.`', ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const provider = interaction.options.getUser('provider', true);
  const stats    = await statsService.getProviderStats(provider.id);

  if (!stats) {
    await interaction.editReply(`\`No stats found for ${provider.tag}.\``);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`Provider Profile — ${provider.tag}`)
    .setColor(0x5865f2)
    .addFields(
      { name: 'Total Rides',     value: String(stats.totalRides),            inline: true },
      { name: 'Completed',       value: String(stats.completedRides),        inline: true },
      { name: 'Cancelled',       value: String(stats.cancelledRides),        inline: true },
      { name: 'Total Revenue',   value: `$${stats.totalRevenue.toFixed(2)}`, inline: true },
      { name: 'Average Rating',  value: stats.averageRating.toFixed(2),      inline: true },
    )
    .setFooter({ text: 'GUHDRIDES DISPATCH SYSTEM' })
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

// ── /ride blacklist ───────────────────────────────────────────────────────────

async function handleBlacklist(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = await interaction.guild!.members.fetch(interaction.user.id);
  if (!isStaff(member)) {
    await interaction.reply({ content: '`Staff only.`', ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);
  await blacklistService.blacklist(target.id, reason);

  await logService.log(interaction.client, 'BLACKLISTED', [
    { name: 'User',      value: `<@${target.id}>`,           inline: true },
    { name: 'By',        value: `<@${interaction.user.id}>`, inline: true },
    { name: 'Reason',    value: reason,                      inline: false },
  ]);

  await interaction.editReply(`\`${target.tag} has been blacklisted.\``);
}

// ── /ride unblacklist ─────────────────────────────────────────────────────────

async function handleUnblacklist(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = await interaction.guild!.members.fetch(interaction.user.id);
  if (!isStaff(member)) {
    await interaction.reply({ content: '`Staff only.`', ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser('user', true);
  await blacklistService.unblacklist(target.id);

  await logService.log(interaction.client, 'UNBLACKLISTED', [
    { name: 'User', value: `<@${target.id}>`,           inline: true },
    { name: 'By',   value: `<@${interaction.user.id}>`, inline: true },
  ]);

  await interaction.editReply(`\`${target.tag} has been removed from the blacklist.\``);
}

// ── /ride force-close ─────────────────────────────────────────────────────────

async function handleForceClose(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = await interaction.guild!.members.fetch(interaction.user.id);
  if (!isAdmin(member)) {
    await interaction.reply({ content: '`Admin only.`', ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const rideId = interaction.options.getString('ride-id', true).toUpperCase();
  const ride   = await rideService.getByRideId(rideId);
  if (!ride) { await interaction.editReply('`Ride not found.`'); return; }

  await rideService.updateStatus(rideId, 'CANCELLED');
  await interaction.editReply(`\`Ride ${rideId} has been force-closed.\``);
}

// ── /ride history ─────────────────────────────────────────────────────────────

async function handleHistory(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = await interaction.guild!.members.fetch(interaction.user.id);
  if (!isStaff(member)) {
    await interaction.reply({ content: '`Staff only.`', ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const limit = interaction.options.getInteger('limit') ?? 20;
  const rides = await rideService.getHistory(limit);

  if (rides.length === 0) { await interaction.editReply('`No ride history found.`'); return; }

  const lines = rides.map(
    (r) => `**${r.rideId}** — ${r.status} — <@${r.customerId}> — $${r.fare.toFixed(2)}`,
  );
  const embed = new EmbedBuilder()
    .setTitle(`Ride History (last ${rides.length})`)
    .setDescription(lines.join('\n'))
    .setColor(0x5865f2)
    .setFooter({ text: 'GUHDRIDES DISPATCH SYSTEM' })
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}
