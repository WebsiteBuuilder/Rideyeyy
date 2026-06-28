import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Guild,
  SlashCommandBuilder,
} from 'discord.js';
import { InviteStatus, RedemptionStatus } from '@prisma/client';
import type { AppServices } from '../types';
import { prisma } from '../lib/prisma';
import { config as appConfig } from '../config';
import {
  BRAND,
  COLOR,
  ICON,
  LINE,
  brandedEmbed,
  ephemeralEmbed,
  ephemeralReply,
  progressBar,
} from '../utils/discord';
import {
  buildInviteLeaderboardEmbed,
  buildLeaderboardButtons,
} from '../utils/inviteEmbeds';
import type { LeaderboardWindow } from '../services/invite/InviteLeaderboardService';

// ═══════════════════════════════════════════════════════════════════════════
//  /invites — your invite dashboard (stats, milestones, recent joins)
//  /invite-leaderboard — top inviters
// ═══════════════════════════════════════════════════════════════════════════

export const invitesData = new SlashCommandBuilder()
  .setName('invites')
  .setDescription('Your invite stats, milestones, rewards, and recent joins')
  .addUserOption((o) => o.setName('user').setDescription('View another member').setRequired(false));

export const inviteLeaderboardData = new SlashCommandBuilder()
  .setName('invite-leaderboard')
  .setDescription('Top inviters leaderboard')
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

function statusLabel(status: InviteStatus): string {
  switch (status) {
    case InviteStatus.REWARDED:
      return `${ICON.check} Rewarded`;
    case InviteStatus.VERIFIED:
      return `${ICON.check} Verified`;
    case InviteStatus.PENDING:
      return '⏳ Pending';
    case InviteStatus.FAKE:
      return `${ICON.cross} Rejected`;
    default:
      return status;
  }
}

export async function handleInvites(
  interaction: ChatInputCommandInteraction,
  services: AppServices
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await ephemeralReply(interaction, 'Use this command inside the server.');
    return;
  }
  const target = interaction.options.getUser('user') ?? interaction.user;

  const [stats, pendingCount, cfg, tickets, activeCodes, recentJoins] = await Promise.all([
    prisma.inviteUserStats.findUnique({ where: { guildId_userId: { guildId, userId: target.id } } }),
    prisma.inviteJoin.count({ where: { guildId, inviterUserId: target.id, status: InviteStatus.PENDING } }),
    services.invite.admin.getConfig(guildId),
    services.lottery.getTickets(guildId, target.id),
    services.redemption.listForUser(guildId, target.id, RedemptionStatus.ACTIVE),
    prisma.inviteJoin.findMany({
      where: { guildId, inviterUserId: target.id },
      orderBy: { joinedAt: 'desc' },
      take: 5,
    }),
  ]);

  const verified = stats?.verified ?? 0;
  const fake = stats?.fake ?? 0;
  const rcEarned = stats?.rcEarned?.toString() ?? '0';
  const milestonesCompleted = stats?.milestonesCompleted ?? 0;
  const { rank, total } = await services.invite.leaderboard.getUserRank(guildId, target.id);

  const nextMilestone = await prisma.inviteMilestone.findFirst({
    where: { guildId, enabled: true, threshold: { gt: verified } },
    orderBy: { threshold: 'asc' },
  });

  const progress = nextMilestone
    ? `${progressBar(verified, nextMilestone.threshold)}  (${verified}/${nextMilestone.threshold})\n` +
      `Next: **${nextMilestone.label ?? `Milestone ${nextMilestone.threshold}`}** at ${nextMilestone.threshold} invites`
    : `${progressBar(1, 1)}\nYou've reached every milestone — legend! ${ICON.jackpot}`;

  const codeLines = activeCodes.length
    ? activeCodes.map((c) => `\`${c.code}\` — ${services.redemption.label(c.rewardKey)}`).join('\n')
    : '_None — earn via milestones, /shop, or the lottery._';

  const recentLines = recentJoins.length
    ? recentJoins
        .map((j) => `<@${j.invitedUserId}> — ${statusLabel(j.status)}`)
        .join('\n')
    : '_No invites yet — share your Discord invite link!_';

  const embed = brandedEmbed(COLOR.EPIC, undefined, interaction.guild)
    .setTitle(`${ICON.jackpot} Invites — ${target.username}`)
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .setDescription(`${LINE}\n${progress}`)
    .addFields(
      { name: 'Verified', value: `${verified}`, inline: true },
      { name: 'Pending', value: `${pendingCount}`, inline: true },
      { name: 'Rejected', value: `${fake}`, inline: true },
      { name: `${BRAND.ticker} Earned`, value: `${ICON.coin} ${rcEarned}`, inline: true },
      { name: 'Milestones', value: `${milestonesCompleted}`, inline: true },
      { name: 'Rank', value: rank > 0 ? `#${rank} / ${total}` : '—', inline: true },
      { name: 'Lottery Tickets', value: `${tickets}`, inline: true },
      { name: 'Per Verify', value: `${ICON.coin} ${cfg.rewardAmount} ${BRAND.ticker}`, inline: true },
      { name: 'First Ride Bonus', value: `${ICON.coin} ${appConfig.inviteEconomy.firstOrderBonusRc} ${BRAND.ticker}`, inline: true },
      { name: 'Recent Invites', value: recentLines, inline: false },
      { name: 'Active Reward Codes', value: codeLines, inline: false }
    );

  await ephemeralEmbed(interaction, embed);
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
