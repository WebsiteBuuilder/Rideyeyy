import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { InviteStatus, RedemptionStatus } from '@prisma/client';
import type { AppServices } from '../types';
import { prisma } from '../lib/prisma';
import { COLOR, BRAND, ICON, LINE, brandedEmbed, progressBar, ephemeralEmbed, ephemeralReply } from '../utils/discord';

// ═══════════════════════════════════════════════════════════════════════════
//  /referral — personal referral dashboard: verified/pending invites, progress
//  to the next milestone, rewards earned, and current weekly-lottery tickets.
// ═══════════════════════════════════════════════════════════════════════════

export const referralData = new SlashCommandBuilder()
  .setName('referral')
  .setDescription('Your referral progress, rewards, and lottery tickets')
  .addUserOption((o) => o.setName('user').setDescription('View another member').setRequired(false));

export async function handleReferral(interaction: ChatInputCommandInteraction, services: AppServices): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await ephemeralReply(interaction, 'Use this command inside the server.');
    return;
  }
  const target = interaction.options.getUser('user') ?? interaction.user;

  const [stats, pendingCount, cfg, tickets, activeCodes] = await Promise.all([
    prisma.inviteUserStats.findUnique({ where: { guildId_userId: { guildId, userId: target.id } } }),
    prisma.inviteJoin.count({ where: { guildId, inviterUserId: target.id, status: InviteStatus.PENDING } }),
    services.invite.admin.getConfig(guildId),
    services.lottery.getTickets(guildId, target.id),
    services.redemption.listForUser(guildId, target.id, RedemptionStatus.ACTIVE),
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

  const rewardKeyToLabel = (k: string): string => services.redemption.label(k);
  const codeLines = activeCodes.length
    ? activeCodes.map((c) => `\`${c.code}\` — ${rewardKeyToLabel(c.rewardKey)}`).join('\n')
    : '_None — earn rides via milestones, /shop, or the lottery._';

  const embed = brandedEmbed(COLOR.EPIC, undefined, interaction.guild)
    .setTitle(`${ICON.jackpot} Referral Card — ${target.username}`)
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .setDescription(`${LINE}\n${progress}`)
    .addFields(
      { name: 'Verified Invites', value: `${verified}`, inline: true },
      { name: 'Pending', value: `${pendingCount}`, inline: true },
      { name: 'Fake / Rejected', value: `${fake}`, inline: true },
      { name: 'Route Cash Earned', value: `${ICON.coin} ${rcEarned} ${BRAND.ticker}`, inline: true },
      { name: 'Milestones', value: `${milestonesCompleted}`, inline: true },
      { name: 'Leaderboard Rank', value: rank > 0 ? `#${rank} / ${total}` : '—', inline: true },
      { name: '🎟️ Lottery Tickets', value: `${tickets}`, inline: true },
      { name: 'Reward / Verified Invite', value: `${ICON.coin} ${cfg.rewardAmount} ${BRAND.ticker}`, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: 'Active Reward Codes', value: codeLines, inline: false }
    );

  await ephemeralEmbed(interaction, embed);
}
