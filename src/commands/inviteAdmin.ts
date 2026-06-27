import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { InviteConfig, InviteFakeReason } from '@prisma/client';
import type { AppServices } from '../types';
import { prisma } from '../lib/prisma';
import { COLOR, BRAND, ICON, LINE, brandedEmbed, ephemeralReply } from '../utils/discord';

// ═══════════════════════════════════════════════════════════════════════════
//  /invite-admin — full configuration & management panel (Administrator only)
// ═══════════════════════════════════════════════════════════════════════════

export const inviteAdminData = new SlashCommandBuilder()
  .setName('invite-admin')
  .setDescription('Configure and manage the invite reward system (admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

type Section =
  | 'overview'
  | 'settings'
  | 'rewards'
  | 'verification'
  | 'milestones'
  | 'statistics'
  | 'reset'
  | 'logs'
  | 'leaderboard'
  | 'exports'
  | 'manageuser'
  | 'danger';

const SECTIONS: { value: Section; label: string; description: string; emoji: string }[] = [
  { value: 'overview', label: 'Overview', description: 'Current configuration summary', emoji: '🏠' },
  { value: 'settings', label: 'General Settings', description: 'Toggles & channels', emoji: '⚙️' },
  { value: 'rewards', label: 'Reward Settings', description: 'Amount & caps', emoji: '💰' },
  { value: 'verification', label: 'Verification', description: 'Delay & anti-alt', emoji: '🛡️' },
  { value: 'milestones', label: 'Milestones', description: 'Add / remove milestones', emoji: '🏆' },
  { value: 'statistics', label: 'Statistics', description: 'Guild-wide analytics', emoji: '📊' },
  { value: 'leaderboard', label: 'Leaderboard', description: 'Top inviters', emoji: '🥇' },
  { value: 'logs', label: 'Logs', description: 'Recent events', emoji: '📜' },
  { value: 'exports', label: 'Exports', description: 'CSV / JSON data', emoji: '📤' },
  { value: 'manageuser', label: 'Manage User', description: 'Per-user overrides', emoji: '🧰' },
  { value: 'reset', label: 'Reset', description: 'Counters & data', emoji: '🔄' },
  { value: 'danger', label: 'Danger Zone', description: 'Wipe all invite data', emoji: '⚠️' },
];

function isAdmin(interaction: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction): boolean {
  if (!interaction.inGuild()) return false;
  const perms = interaction.memberPermissions;
  return perms?.has(PermissionFlagsBits.Administrator) ?? false;
}

// ── Entry point ─────────────────────────────────────────────────────────────

export async function handleInviteAdmin(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  if (!interaction.guildId || !isAdmin(interaction)) {
    await ephemeralReply(interaction, 'You need Administrator permission to use this.');
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const view = await renderSection('overview', interaction.guildId, services);
  await interaction.editReply(view);
}

// ── Navigation (select menu) ──────────────────────────────────────────────---

export async function handleAdminSelect(
  interaction: StringSelectMenuInteraction,
  services: AppServices
): Promise<void> {
  if (!interaction.guildId || !isAdmin(interaction)) return;
  const section = interaction.values[0] as Section;
  const view = await renderSection(section, interaction.guildId, services);
  await interaction.update(view);
}

// ── Buttons ─────────────────────────────────────────────────────────────────

export async function handleAdminButton(
  interaction: ButtonInteraction,
  services: AppServices
): Promise<void> {
  if (!interaction.guildId || !isAdmin(interaction)) {
    await interaction.reply({ content: 'Administrator only.', flags: MessageFlags.Ephemeral });
    return;
  }
  const guildId = interaction.guildId;
  // customId: invadm:btn:<section>:<action>[:arg]
  const [, , section, action, arg] = interaction.customId.split(':');

  // Modal-opening actions must call showModal directly (no defer).
  if (action === 'edit') {
    await openSectionModal(interaction, section as Section, services);
    return;
  }
  if (action === 'modal') {
    await openSectionModal(interaction, arg as Section, services);
    return;
  }

  // Toggle config booleans.
  if (action === 'toggle') {
    const cfg = await services.invite.admin.getConfig(guildId);
    const field = arg as keyof InviteConfig;
    const current = cfg[field];
    if (typeof current === 'boolean') {
      await services.invite.admin.updateConfig(guildId, { [field]: !current });
    }
    const view = await renderSection(section as Section, guildId, services);
    await interaction.update(view);
    return;
  }

  // Reset actions are confirm-gated.
  if (action === 'reset') {
    await interaction.update(buildConfirmView(section as Section, arg));
    return;
  }
  if (action === 'confirm') {
    await runReset(interaction, arg, services);
    return;
  }
  if (action === 'cancel') {
    const view = await renderSection(section as Section, guildId, services);
    await interaction.update(view);
    return;
  }

  // Exports.
  if (action === 'export') {
    await sendExport(interaction, arg, services);
    return;
  }

  // Recalculate aggregates.
  if (action === 'recalc') {
    await interaction.deferUpdate();
    const n = await services.invite.admin.recalculateAll(guildId);
    const view = await renderSection('statistics', guildId, services);
    await interaction.editReply(view);
    await interaction.followUp({ content: `Recomputed ${n} inviter aggregates.`, flags: MessageFlags.Ephemeral });
    return;
  }
}

// ── Modals ──────────────────────────────────────────────────────────────────

export async function handleAdminModal(
  interaction: ModalSubmitInteraction,
  services: AppServices
): Promise<void> {
  if (!interaction.guildId || !isAdmin(interaction)) return;
  const guildId = interaction.guildId;
  const action = interaction.customId.split(':')[2]; // invadm:modal:<action>
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const num = (id: string): number | null => {
    const raw = interaction.fields.getTextInputValue(id).trim();
    if (raw === '') return null;
    const n = Number(raw.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const str = (id: string): string => interaction.fields.getTextInputValue(id).trim();

  switch (action) {
    case 'rewards': {
      const data: Record<string, number> = {};
      const rewardAmount = num('rewardAmount');
      const dailyCap = num('dailyCap');
      const weeklyCap = num('weeklyCap');
      const monthlyCap = num('monthlyCap');
      const maxRewards = num('maxRewards');
      if (rewardAmount != null) data.rewardAmount = Math.max(0, Math.round(rewardAmount));
      if (dailyCap != null) data.dailyCap = Math.max(0, Math.round(dailyCap));
      if (weeklyCap != null) data.weeklyCap = Math.max(0, Math.round(weeklyCap));
      if (monthlyCap != null) data.monthlyCap = Math.max(0, Math.round(monthlyCap));
      if (maxRewards != null) data.maxRewardsPerInviter = Math.max(0, Math.round(maxRewards));
      await services.invite.admin.updateConfig(guildId, data);
      await ephemeralReply(interaction, 'Reward settings updated.');
      return;
    }
    case 'verification': {
      const data: Record<string, number> = {};
      const delaySec = num('delaySec');
      const minAge = num('minAge');
      if (delaySec != null) data.verificationDelaySec = Math.max(0, Math.round(delaySec));
      if (minAge != null) data.minAccountAgeDays = Math.max(0, Math.round(minAge));
      await services.invite.admin.updateConfig(guildId, data);
      await ephemeralReply(interaction, 'Verification settings updated.');
      return;
    }
    case 'channels': {
      const logging = str('logging');
      const announce = str('announce');
      await services.invite.admin.updateConfig(guildId, {
        loggingChannelId: logging || null,
        announceChannelId: announce || null,
      });
      await ephemeralReply(interaction, 'Channels updated.');
      return;
    }
    case 'milestoneadd': {
      const threshold = num('threshold');
      const rewardAmount = num('rewardAmount') ?? 0;
      const roleId = str('roleId') || null;
      const label = str('label') || null;
      if (threshold == null || threshold <= 0) {
        await ephemeralReply(interaction, 'Threshold must be a positive number.');
        return;
      }
      await services.invite.admin.addMilestone(guildId, Math.round(threshold), Math.max(0, Math.round(rewardAmount)), roleId, label);
      await ephemeralReply(interaction, `Milestone at **${Math.round(threshold)}** invites saved.`);
      return;
    }
    case 'milestoneremove': {
      const threshold = num('threshold');
      if (threshold == null) {
        await ephemeralReply(interaction, 'Provide a milestone threshold to remove.');
        return;
      }
      const ok = await services.invite.admin.removeMilestone(guildId, Math.round(threshold));
      await ephemeralReply(interaction, ok ? `Removed milestone at ${Math.round(threshold)}.` : 'No milestone at that threshold.');
      return;
    }
    case 'manageuser': {
      const userId = str('userId');
      const joinId = str('joinId');
      const act = str('action').toLowerCase();
      const amount = num('amount');
      await runManageUser(interaction, services, guildId, { userId, joinId, action: act, amount });
      return;
    }
    default:
      await ephemeralReply(interaction, 'Unknown action.');
  }
}

async function runManageUser(
  interaction: ModalSubmitInteraction,
  services: AppServices,
  guildId: string,
  input: { userId: string; joinId: string; action: string; amount: number | null }
): Promise<void> {
  const { userId, joinId, action, amount } = input;
  const admin = services.invite.admin;
  try {
    switch (action) {
      case 'give':
        if (!userId || amount == null) return void (await ephemeralReply(interaction, 'give requires userId and amount.'));
        await admin.giveManual(guildId, userId, Math.round(amount), interaction.user.id);
        return void (await ephemeralReply(interaction, `Granted ${Math.round(amount)} ${BRAND.ticker} to <@${userId}>.`));
      case 'resetuser':
        if (!userId) return void (await ephemeralReply(interaction, 'resetuser requires userId.'));
        await admin.resetUser(guildId, userId, interaction.user.id);
        return void (await ephemeralReply(interaction, `Reset all invite data for <@${userId}>.`));
      case 'recalc':
        if (!userId) return void (await ephemeralReply(interaction, 'recalc requires userId.'));
        await services.invite.stats.recomputeUserStats(guildId, userId);
        return void (await ephemeralReply(interaction, `Recomputed stats for <@${userId}>.`));
      case 'reverify':
        if (!joinId) return void (await ephemeralReply(interaction, 'reverify requires joinId.'));
        return void (await ephemeralReply(interaction, (await admin.reverify(guildId, joinId)) ? 'Join set to re-verify on next sweep.' : 'Join not found.'));
      case 'markfake':
        if (!joinId) return void (await ephemeralReply(interaction, 'markfake requires joinId.'));
        return void (await ephemeralReply(interaction, (await admin.markFake(guildId, joinId, InviteFakeReason.MANUAL)) ? 'Join marked fake.' : 'Join not found.'));
      case 'removereward':
        if (!joinId) return void (await ephemeralReply(interaction, 'removereward requires joinId.'));
        return void (await ephemeralReply(interaction, (await admin.removeReward(guildId, joinId)) ? 'Reward removed and RouteCash clawed back.' : 'No paid reward on that join.'));
      default:
        await ephemeralReply(interaction, 'Unknown action. Use: give, resetuser, recalc, reverify, markfake, removereward.');
    }
  } catch (err) {
    console.error('[Invite] manage-user failed:', err);
    await ephemeralReply(interaction, `Action failed: ${(err as Error).message}`);
  }
}

// ── Reset execution ─────────────────────────────────────────────────────────

async function runReset(interaction: ButtonInteraction, type: string, services: AppServices): Promise<void> {
  const guildId = interaction.guildId as string;
  const admin = services.invite.admin;
  const by = interaction.user.id;
  await interaction.deferUpdate();
  let msg = '';
  switch (type) {
    case 'weekly':
      await admin.resetWeekly(guildId, by);
      msg = 'Weekly counters reset.';
      break;
    case 'monthly':
      await admin.resetMonthly(guildId, by);
      msg = 'Monthly counters reset.';
      break;
    case 'leaderboard':
      await admin.resetLeaderboard(guildId, by);
      msg = 'Leaderboard aggregates cleared (recompute via Statistics → Recalculate).';
      break;
    case 'rewards':
      await admin.resetRewards(guildId, by);
      msg = 'Reward audit history cleared.';
      break;
    case 'cache':
      if (interaction.guild) await services.invite.resetCache(interaction.guild);
      msg = 'Invite cache re-primed.';
      break;
    case 'guild':
      await admin.resetGuild(guildId, by);
      msg = 'ALL invite tracking data wiped.';
      break;
    default:
      msg = 'Unknown reset.';
  }
  const view = await renderSection(type === 'guild' ? 'danger' : 'reset', guildId, services);
  await interaction.editReply(view);
  await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
}

// ── Exports ─────────────────────────────────────────────────────────────────

async function sendExport(interaction: ButtonInteraction, format: string, _services: AppServices): Promise<void> {
  const guildId = interaction.guildId as string;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const stats = await prisma.inviteUserStats.findMany({ where: { guildId }, orderBy: { verified: 'desc' } });

  if (format === 'json') {
    const joins = await prisma.inviteJoin.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' }, take: 5000 });
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), guildId, stats, joins }, null, 2);
    const file = new AttachmentBuilder(Buffer.from(payload, 'utf8'), { name: `invite-export-${guildId}.json` });
    await interaction.editReply({ content: 'Invite data export (JSON):', files: [file] });
    return;
  }

  // CSV (leaderboard / per-user stats).
  const header = 'userId,verified,pending,fake,lifetime,rcEarned,milestonesCompleted,weeklyCount,monthlyCount,streak';
  const rows = stats.map((s) =>
    [s.userId, s.verified, s.pending, s.fake, s.lifetime, s.rcEarned.toString(), s.milestonesCompleted, s.weeklyCount, s.monthlyCount, s.streak].join(',')
  );
  const csv = [header, ...rows].join('\n');
  const file = new AttachmentBuilder(Buffer.from(csv, 'utf8'), { name: `invite-stats-${guildId}.csv` });
  await interaction.editReply({ content: 'Invite stats export (CSV):', files: [file] });
}

// ── Section rendering ─────────────────────────────────────────────────────---

function navRow(active: Section): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('invadm:nav')
    .setPlaceholder('Jump to a section…')
    .addOptions(
      SECTIONS.map((s) => ({
        label: s.label,
        value: s.value,
        description: s.description,
        emoji: s.emoji,
        default: s.value === active,
      }))
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function onOff(v: boolean): string {
  return v ? `${ICON.check} On` : `${ICON.cross} Off`;
}

async function renderSection(
  section: Section,
  guildId: string,
  services: AppServices
): Promise<{ embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] }> {
  const cfg = await services.invite.admin.getConfig(guildId);
  const nav = navRow(section);
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [nav];
  let embed: EmbedBuilder;

  switch (section) {
    case 'settings': {
      embed = brandedEmbed(COLOR.INFO)
        .setTitle(`${ICON.coin} General Settings`)
        .setDescription(LINE)
        .addFields(
          { name: 'Rewards Enabled', value: onOff(cfg.rewardEnabled), inline: true },
          { name: 'Milestones Enabled', value: onOff(cfg.milestonesEnabled), inline: true },
          { name: 'Anti-Alt', value: onOff(cfg.antiAltEnabled), inline: true },
          { name: 'Auto Announce', value: onOff(cfg.autoAnnounce), inline: true },
          { name: 'Logging Channel', value: cfg.loggingChannelId ? `<#${cfg.loggingChannelId}>` : '—', inline: true },
          { name: 'Announce Channel', value: cfg.announceChannelId ? `<#${cfg.announceChannelId}>` : '—', inline: true }
        );
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          toggleBtn('settings', 'rewardEnabled', 'Rewards'),
          toggleBtn('settings', 'milestonesEnabled', 'Milestones'),
          toggleBtn('settings', 'antiAltEnabled', 'Anti-Alt'),
          toggleBtn('settings', 'autoAnnounce', 'Announce')
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          modalBtn('settings', 'channels', 'Set Channels', ButtonStyle.Secondary)
        )
      );
      break;
    }
    case 'rewards': {
      embed = brandedEmbed(COLOR.WIN)
        .setTitle(`${ICON.coin} Reward Settings`)
        .setDescription(`${LINE}\n_0 means unlimited for caps._`)
        .addFields(
          { name: 'Reward / Invite', value: `${cfg.rewardAmount} ${BRAND.ticker}`, inline: true },
          { name: 'Daily Cap', value: `${cfg.dailyCap}`, inline: true },
          { name: 'Weekly Cap', value: `${cfg.weeklyCap}`, inline: true },
          { name: 'Monthly Cap', value: `${cfg.monthlyCap}`, inline: true },
          { name: 'Max / Inviter', value: `${cfg.maxRewardsPerInviter}`, inline: true }
        );
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(modalBtn('rewards', 'rewards', 'Edit Rewards & Caps', ButtonStyle.Primary)));
      break;
    }
    case 'verification': {
      embed = brandedEmbed(COLOR.ELECTRIC)
        .setTitle(`${ICON.check} Verification`)
        .setDescription(LINE)
        .addFields(
          { name: 'Verification Delay', value: `${cfg.verificationDelaySec}s (${Math.round(cfg.verificationDelaySec / 60)} min)`, inline: true },
          { name: 'Min Account Age', value: `${cfg.minAccountAgeDays} days`, inline: true },
          { name: 'Anti-Alt', value: onOff(cfg.antiAltEnabled), inline: true }
        );
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          modalBtn('verification', 'verification', 'Edit Verification', ButtonStyle.Primary),
          toggleBtn('verification', 'antiAltEnabled', 'Toggle Anti-Alt')
        )
      );
      break;
    }
    case 'milestones': {
      const milestones = await services.invite.admin.listMilestones(guildId);
      const list = milestones.length
        ? milestones
            .map((m) => `**${m.threshold}** — ${m.label ?? 'Milestone'} · ${ICON.coin} ${m.rewardAmount} ${BRAND.ticker}${m.rewardRoleId ? ` + <@&${m.rewardRoleId}>` : ''}${m.enabled ? '' : ' _(disabled)_'}`)
            .join('\n')
        : '_No milestones configured._';
      embed = brandedEmbed(COLOR.JACKPOT).setTitle(`${ICON.jackpot} Milestones`).setDescription(`${LINE}\n${list}`);
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          modalBtn('milestones', 'milestoneadd', 'Add / Edit', ButtonStyle.Success),
          modalBtn('milestones', 'milestoneremove', 'Remove', ButtonStyle.Danger)
        )
      );
      break;
    }
    case 'statistics': {
      const s = await services.invite.stats.getGuildStats(guildId);
      const top = s.topInviters.length
        ? s.topInviters.map((t, i) => `\`${i + 1}.\` <@${t.userId}> — ${t.verified} (${ICON.coin} ${t.rcEarned})`).join('\n')
        : '—';
      embed = brandedEmbed(COLOR.ACTIVE)
        .setTitle(`${ICON.jackpot} Statistics`)
        .setDescription(LINE)
        .addFields(
          { name: 'Total Joins', value: `${s.totalJoins}`, inline: true },
          { name: 'Verified', value: `${s.verified}`, inline: true },
          { name: 'Fake', value: `${s.fake}`, inline: true },
          { name: 'Pending', value: `${s.pending}`, inline: true },
          { name: 'Rewards Paid', value: `${s.rewardsPaid}`, inline: true },
          { name: 'RC Distributed', value: `${s.rcDistributed}`, inline: true },
          { name: 'Growth (24h/7d/30d)', value: `${s.dailyGrowth} / ${s.weeklyGrowth} / ${s.monthlyGrowth}`, inline: true },
          { name: 'Avg Verify Time', value: s.avgVerificationMinutes != null ? `${s.avgVerificationMinutes} min` : '—', inline: true },
          { name: 'Top Inviters', value: top, inline: false }
        );
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(actionBtn('statistics', 'recalc', 'Recalculate Aggregates', ButtonStyle.Secondary)));
      break;
    }
    case 'leaderboard': {
      const page = await services.invite.leaderboard.getPage(guildId, 1, 10, 'all');
      const body = page.entries.length
        ? page.entries.map((e) => `\`#${e.rank}\` <@${e.userId}> — **${e.verified}** · ${ICON.coin} ${e.rcEarned}`).join('\n')
        : '_No data yet._';
      embed = brandedEmbed(COLOR.ACTIVE).setTitle(`${ICON.jackpot} Top Inviters`).setDescription(`${LINE}\n${body}`);
      break;
    }
    case 'logs': {
      const recent = await services.invite.logging.recent(guildId, 15);
      const body = recent.length
        ? recent
            .map((l) => `\`${l.createdAt.toISOString().slice(5, 16).replace('T', ' ')}\` **${l.event}**${l.targetUserId ? ` <@${l.targetUserId}>` : ''}${l.detail ? ` — ${l.detail}` : ''}`)
            .join('\n')
        : '_No log entries yet._';
      embed = brandedEmbed(COLOR.NEUTRAL).setTitle(`${ICON.time} Recent Logs`).setDescription(`${LINE}\n${body}`);
      break;
    }
    case 'exports': {
      embed = brandedEmbed(COLOR.INFO)
        .setTitle(`${ICON.arrow} Exports`)
        .setDescription(`${LINE}\nDownload invite data for analysis or backup.`);
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('invadm:btn:exports:export:csv').setLabel('Export CSV').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('invadm:btn:exports:export:json').setLabel('Export JSON').setStyle(ButtonStyle.Secondary)
        )
      );
      break;
    }
    case 'manageuser': {
      embed = brandedEmbed(COLOR.INFO)
        .setTitle(`${ICON.arrow} Manage User`)
        .setDescription(
          `${LINE}\nPer-user overrides. Open the form and provide the fields for your action:\n\n` +
            '`give` — userId + amount\n' +
            '`resetuser` — userId\n' +
            '`recalc` — userId\n' +
            '`reverify` — joinId\n' +
            '`markfake` — joinId\n' +
            '`removereward` — joinId (claws back RC)'
        );
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(modalBtn('manageuser', 'manageuser', 'Open Form', ButtonStyle.Primary)));
      break;
    }
    case 'reset': {
      embed = brandedEmbed(COLOR.LOSS)
        .setTitle(`${ICON.time} Reset`)
        .setDescription(`${LINE}\nEach action asks for confirmation. These do not refund RouteCash already paid.`);
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          resetBtn('reset', 'weekly', 'Reset Weekly'),
          resetBtn('reset', 'monthly', 'Reset Monthly'),
          resetBtn('reset', 'leaderboard', 'Reset Leaderboard')
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          resetBtn('reset', 'rewards', 'Clear Reward Log'),
          new ButtonBuilder().setCustomId('invadm:btn:reset:reset:cache').setLabel('Re-prime Cache').setStyle(ButtonStyle.Secondary)
        )
      );
      break;
    }
    case 'danger': {
      embed = brandedEmbed(COLOR.LOSS)
        .setTitle(`${ICON.cross} Danger Zone`)
        .setDescription(`${LINE}\n**Wipe ALL invite tracking data** for this server (joins, rewards, milestone awards, aggregates). Config and milestone definitions are kept. This cannot be undone.`);
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(resetBtn('danger', 'guild', 'WIPE ALL INVITE DATA')));
      break;
    }
    case 'overview':
    default: {
      const s = await services.invite.stats.getGuildStats(guildId);
      embed = brandedEmbed(COLOR.EPIC)
        .setTitle(`${BRAND.logo} Invite System — Admin`)
        .setDescription(`${LINE}\nUse the menu below to configure and manage invites.`)
        .addFields(
          { name: 'Status', value: `${onOff(cfg.rewardEnabled)} rewards · ${onOff(cfg.milestonesEnabled)} milestones`, inline: false },
          { name: 'Reward / Invite', value: `${cfg.rewardAmount} ${BRAND.ticker}`, inline: true },
          { name: 'Verify Delay', value: `${Math.round(cfg.verificationDelaySec / 60)} min`, inline: true },
          { name: 'Min Age', value: `${cfg.minAccountAgeDays}d`, inline: true },
          { name: 'Verified', value: `${s.verified}`, inline: true },
          { name: 'Pending', value: `${s.pending}`, inline: true },
          { name: 'Fake', value: `${s.fake}`, inline: true }
        );
      break;
    }
  }

  return { embeds: [embed], components: rows };
}

function buildConfirmView(section: Section, type: string): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const embed = brandedEmbed(COLOR.LOSS)
    .setTitle(`${ICON.cross} Confirm: ${type}`)
    .setDescription(`${LINE}\nAre you sure? This action cannot be undone.`);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`invadm:btn:${section}:confirm:${type}`).setLabel('CONFIRM').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`invadm:btn:${section}:cancel`).setLabel('CANCEL').setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

// ── Button factories ─────────────────────────────────────────────────────---

function toggleBtn(section: Section, field: string, label: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(`invadm:btn:${section}:toggle:${field}`).setLabel(label).setStyle(ButtonStyle.Secondary);
}
function modalBtn(section: Section, modal: string, label: string, style: ButtonStyle): ButtonBuilder {
  return new ButtonBuilder().setCustomId(`invadm:btn:${section}:modal:${modal}`).setLabel(label).setStyle(style);
}
function actionBtn(section: Section, action: string, label: string, style: ButtonStyle): ButtonBuilder {
  return new ButtonBuilder().setCustomId(`invadm:btn:${section}:${action}`).setLabel(label).setStyle(style);
}
function resetBtn(section: Section, type: string, label: string): ButtonBuilder {
  return new ButtonBuilder().setCustomId(`invadm:btn:${section}:reset:${type}`).setLabel(label).setStyle(ButtonStyle.Danger);
}

// ── Modal builders ───────────────────────────────────────────────────────---

async function openSectionModal(
  interaction: ButtonInteraction,
  modal: Section | string,
  services: AppServices
): Promise<void> {
  const guildId = interaction.guildId as string;
  const cfg = await services.invite.admin.getConfig(guildId);

  const input = (id: string, label: string, value: string, required = false, style: TextInputStyle = TextInputStyle.Short): ActionRowBuilder<TextInputBuilder> =>
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId(id).setLabel(label.slice(0, 45)).setStyle(style).setRequired(required).setValue(value).setMaxLength(100)
    );

  let builder: ModalBuilder;
  switch (modal) {
    case 'rewards':
      builder = new ModalBuilder().setCustomId('invadm:modal:rewards').setTitle('Reward Settings').addComponents(
        input('rewardAmount', 'Reward per invite (RC)', String(cfg.rewardAmount)),
        input('dailyCap', 'Daily cap (0 = unlimited)', String(cfg.dailyCap)),
        input('weeklyCap', 'Weekly cap (0 = unlimited)', String(cfg.weeklyCap)),
        input('monthlyCap', 'Monthly cap (0 = unlimited)', String(cfg.monthlyCap)),
        input('maxRewards', 'Max rewards per inviter (0 = ∞)', String(cfg.maxRewardsPerInviter))
      );
      break;
    case 'verification':
      builder = new ModalBuilder().setCustomId('invadm:modal:verification').setTitle('Verification').addComponents(
        input('delaySec', 'Verification delay (seconds)', String(cfg.verificationDelaySec)),
        input('minAge', 'Min account age (days)', String(cfg.minAccountAgeDays))
      );
      break;
    case 'channels':
      builder = new ModalBuilder().setCustomId('invadm:modal:channels').setTitle('Channels').addComponents(
        input('logging', 'Logging channel ID (blank = off)', cfg.loggingChannelId ?? ''),
        input('announce', 'Announce channel ID (blank = off)', cfg.announceChannelId ?? '')
      );
      break;
    case 'milestoneadd':
      builder = new ModalBuilder().setCustomId('invadm:modal:milestoneadd').setTitle('Add / Edit Milestone').addComponents(
        input('threshold', 'Invite threshold', '', true),
        input('rewardAmount', 'Reward RC (0 for role-only)', '0'),
        input('roleId', 'Reward role ID (optional)', ''),
        input('label', 'Label (optional)', '')
      );
      break;
    case 'milestoneremove':
      builder = new ModalBuilder().setCustomId('invadm:modal:milestoneremove').setTitle('Remove Milestone').addComponents(
        input('threshold', 'Invite threshold to remove', '', true)
      );
      break;
    case 'manageuser':
      builder = new ModalBuilder().setCustomId('invadm:modal:manageuser').setTitle('Manage User').addComponents(
        input('action', 'Action (give/resetuser/recalc/...)', '', true),
        input('userId', 'User ID (for user actions)', ''),
        input('joinId', 'Join ID (for join actions)', ''),
        input('amount', 'Amount (for give)', '')
      );
      break;
    default:
      await interaction.reply({ content: 'Unknown form.', flags: MessageFlags.Ephemeral });
      return;
  }
  await interaction.showModal(builder);
}
