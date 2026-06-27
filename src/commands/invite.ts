import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Guild,
  SlashCommandBuilder,
} from 'discord.js';
import { InviteStatus } from '@prisma/client';
import type { AppServices } from '../types';
import { prisma } from '../lib/prisma';
import { ephemeralEmbed, ephemeralReply } from '../utils/discord';
import {
  buildInviteCardEmbed,
  buildInviteStatsEmbed,
  buildInviteHistoryEmbed,
  buildInviteRewardsEmbed,
  buildInviteMilestonesEmbed,
  buildInviteLeaderboardEmbed,
  buildLeaderboardButtons,
} from '../utils/inviteEmbeds';
import type { LeaderboardWindow } from '../services/invite/InviteLeaderboardService';

// ═══════════════════════════════════════════════════════════════════════════
//  /invite  — personal invite card + detail views
//  /invites — paginated invite leaderboard
// ═══════════════════════════════════════════════════════════════════════════

export const inviteUserData = new SlashCommandBuilder()
  .setName('invite')
  .setDescription('View your invite card, stats, history, rewards, and milestones')
  .addSubcommand((s) =>
    s
      .setName('card')
      .setDescription('Your invite card overview')
      .addUserOption((o) => o.setName('user').setDescription('View another member').setRequired(false))
  )
  .addSubcommand((s) =>
    s
      .setName('stats')
      .setDescription('Detailed invite statistics')
      .addUserOption((o) => o.setName('user').setDescription('View another member').setRequired(false))
  )
  .addSubcommand((s) =>
    s
      .setName('history')
      .setDescription('Recent invites you brought in')
      .addUserOption((o) => o.setName('user').setDescription('View another member').setRequired(false))
  )
  .addSubcommand((s) =>
    s
      .setName('rewards')
      .setDescription('Your invite reward history')
      .addUserOption((o) => o.setName('user').setDescription('View another member').setRequired(false))
  )
  .addSubcommand((s) =>
    s.setName('milestones').setDescription('Invite milestones and your progress'));

export const invitesLeaderboardData = new SlashCommandBuilder()
  .setName('invites')
  .setDescription('Invite leaderboard')
  .addStringOption((o) =>
    o
      .setName('window')
      .setDescription('Time window')
      .setRequired(false)
      .addChoices(
        { name: 'All Time', value: 'all' },
        { name: 'This Week', value: 'weekly' },
        { name: 'This Month', value: 'monthly' }
      )
  );

export async function handleInvite(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await ephemeralReply(interaction, 'Use this command inside the server.');
    return;
  }
  const sub = interaction.options.getSubcommand();
  const target = interaction.options.getUser('user') ?? interaction.user;
  const guild = interaction.guild;

  switch (sub) {
    case 'card': {
      const cfg = await services.invite.admin.getConfig(guildId);
      const stats = await prisma.inviteUserStats.findUnique({
        where: { guildId_userId: { guildId, userId: target.id } },
      });
      const { rank, total } = await services.invite.leaderboard.getUserRank(guildId, target.id);
      const verified = stats?.verified ?? 0;
      const nextMilestone = await prisma.inviteMilestone.findFirst({
        where: { guildId, enabled: true, threshold: { gt: verified } },
        orderBy: { threshold: 'asc' },
      });
      await ephemeralEmbed(
        interaction,
        buildInviteCardEmbed({ user: target, guild, stats, rank, total, rewardAmount: cfg.rewardAmount, nextMilestone })
      );
      return;
    }
    case 'stats': {
      const stats = await prisma.inviteUserStats.findUnique({
        where: { guildId_userId: { guildId, userId: target.id } },
      });
      await ephemeralEmbed(interaction, buildInviteStatsEmbed(target, guild, stats));
      return;
    }
    case 'history': {
      const joins = await prisma.inviteJoin.findMany({
        where: { guildId, inviterUserId: target.id },
        orderBy: { joinedAt: 'desc' },
        take: 15,
      });
      await ephemeralEmbed(interaction, buildInviteHistoryEmbed(target, guild, joins));
      return;
    }
    case 'rewards': {
      const rewards = await prisma.inviteReward.findMany({
        where: { guildId, inviterUserId: target.id },
        orderBy: { createdAt: 'desc' },
        take: 15,
      });
      await ephemeralEmbed(interaction, buildInviteRewardsEmbed(target, guild, rewards));
      return;
    }
    case 'milestones': {
      const verified = await prisma.inviteJoin.count({
        where: { guildId, inviterUserId: interaction.user.id, status: { in: [InviteStatus.VERIFIED, InviteStatus.REWARDED] } },
      });
      const milestones = await services.invite.admin.listMilestones(guildId);
      const awards = await prisma.inviteMilestoneAward.findMany({
        where: { guildId, userId: interaction.user.id },
        select: { milestoneId: true },
      });
      const awardedIds = new Set(awards.map((a) => a.milestoneId));
      const awardedThresholds = new Set(milestones.filter((m) => awardedIds.has(m.id)).map((m) => m.threshold));
      await ephemeralEmbed(
        interaction,
        buildInviteMilestonesEmbed(interaction.user, guild, milestones, verified, awardedThresholds)
      );
      return;
    }
    default:
      await ephemeralReply(interaction, 'Unknown subcommand.');
  }
}

export async function handleInviteLeaderboard(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await ephemeralReply(interaction, 'Use this command inside the server.');
    return;
  }
  const window = (interaction.options.getString('window') as LeaderboardWindow | null) ?? 'all';
  const pageData = await services.invite.leaderboard.getPage(guildId, 1, 10, window);
  const embed = buildInviteLeaderboardEmbed(
    interaction.guild,
    pageData.entries,
    pageData.page,
    pageData.totalPages,
    window
  );
  const row = buildLeaderboardButtons(pageData.page, pageData.totalPages, window);
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ embeds: [embed], components: [row] });
  } else {
    await interaction.reply({ embeds: [embed], components: [row] });
  }
}

export async function handleLeaderboardButton(
  interaction: ButtonInteraction,
  services: AppServices
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;
  // customId: invlb:<window>:<page>[:refresh]
  const parts = interaction.customId.split(':');
  const window = (parts[1] as LeaderboardWindow) ?? 'all';
  const page = Math.max(1, Number(parts[2]) || 1);

  const pageData = await services.invite.leaderboard.getPage(guildId, page, 10, window);
  const embed = buildInviteLeaderboardEmbed(
    interaction.guild as Guild | null,
    pageData.entries,
    pageData.page,
    pageData.totalPages,
    window
  );
  const row = buildLeaderboardButtons(pageData.page, pageData.totalPages, window);
  await interaction.update({ embeds: [embed], components: [row] });
}
