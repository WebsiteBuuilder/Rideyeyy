import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Guild,
  User,
} from 'discord.js';
import { InviteUserStats, InviteMilestone, InviteReward, InviteJoin } from '@prisma/client';
import { COLOR, BRAND, ICON, LINE, SPACER, progressBar, brandedEmbed } from './discord';
import type { LeaderboardEntry, LeaderboardWindow } from '../services/invite/InviteLeaderboardService';

// ═══════════════════════════════════════════════════════════════════════════
//  Invite system embeds — styled to match the GUHD RIDES brand.
// ═══════════════════════════════════════════════════════════════════════════

const MEDALS = ['🥇', '🥈', '🥉'];

export interface InviteCardData {
  user: User;
  guild: Guild | null;
  stats: InviteUserStats | null;
  rank: number;
  total: number;
  rewardAmount: number;
  nextMilestone: InviteMilestone | null;
}

function statsOrZero(stats: InviteUserStats | null): {
  verified: number;
  pending: number;
  fake: number;
  lifetime: number;
  rcEarned: string;
  milestonesCompleted: number;
  streak: number;
  weeklyCount: number;
  monthlyCount: number;
} {
  return {
    verified: stats?.verified ?? 0,
    pending: stats?.pending ?? 0,
    fake: stats?.fake ?? 0,
    lifetime: stats?.lifetime ?? 0,
    rcEarned: stats?.rcEarned.toString() ?? '0',
    milestonesCompleted: stats?.milestonesCompleted ?? 0,
    streak: stats?.streak ?? 0,
    weeklyCount: stats?.weeklyCount ?? 0,
    monthlyCount: stats?.monthlyCount ?? 0,
  };
}

export function buildInviteCardEmbed(data: InviteCardData): EmbedBuilder {
  const s = statsOrZero(data.stats);
  const rankText = data.rank > 0 ? `#${data.rank} / ${data.total}` : 'Unranked';

  let milestoneText: string;
  if (data.nextMilestone) {
    const m = data.nextMilestone;
    milestoneText =
      `**${m.label ?? `${m.threshold} invites`}** — ${s.verified}/${m.threshold}\n` +
      `${progressBar(s.verified, m.threshold, 12)}\n` +
      `Reward: ${ICON.coin} **${m.rewardAmount}** ${BRAND.ticker}` +
      (m.rewardRoleId ? ` + <@&${m.rewardRoleId}>` : '');
  } else {
    milestoneText = '`All milestones complete!` 🏆';
  }

  return brandedEmbed(COLOR.EPIC, undefined, data.guild)
    .setTitle(`${ICON.jackpot} Invite Card`)
    .setThumbnail(data.user.displayAvatarURL({ size: 256 }))
    .setDescription(
      `**${data.user.username}** · Rank **${rankText}**\n` +
        `Reward per verified invite: ${ICON.coin} **${data.rewardAmount}** ${BRAND.ticker}\n${LINE}`
    )
    .addFields(
      { name: `${ICON.check} Verified`, value: `**${s.verified}**`, inline: true },
      { name: `${ICON.time} Pending`, value: `**${s.pending}**`, inline: true },
      { name: `${ICON.cross} Fake`, value: `**${s.fake}**`, inline: true },
      { name: `${ICON.coin} RC Earned`, value: `**${s.rcEarned}** ${BRAND.ticker}`, inline: true },
      { name: `${ICON.streak} Streak`, value: `**${s.streak}**`, inline: true },
      { name: `${ICON.jackpot} Milestones`, value: `**${s.milestonesCompleted}**`, inline: true },
      { name: `${ICON.arrow} Next Milestone`, value: milestoneText, inline: false }
    );
}

export function buildInviteStatsEmbed(user: User, guild: Guild | null, stats: InviteUserStats | null): EmbedBuilder {
  const s = statsOrZero(stats);
  return brandedEmbed(COLOR.INFO, undefined, guild)
    .setTitle(`${ICON.check} Invite Stats — ${user.username}`)
    .setDescription(LINE)
    .addFields(
      { name: 'Lifetime', value: `**${s.lifetime}**`, inline: true },
      { name: 'Verified', value: `**${s.verified}**`, inline: true },
      { name: 'Pending', value: `**${s.pending}**`, inline: true },
      { name: 'Fake', value: `**${s.fake}**`, inline: true },
      { name: 'This Week', value: `**${s.weeklyCount}**`, inline: true },
      { name: 'This Month', value: `**${s.monthlyCount}**`, inline: true },
      { name: 'RC Earned', value: `${ICON.coin} **${s.rcEarned}** ${BRAND.ticker}`, inline: true },
      { name: 'Streak', value: `${ICON.streak} **${s.streak}**`, inline: true },
      { name: 'Milestones', value: `${ICON.jackpot} **${s.milestonesCompleted}**`, inline: true }
    );
}

export function buildInviteHistoryEmbed(user: User, guild: Guild | null, joins: InviteJoin[]): EmbedBuilder {
  const embed = brandedEmbed(COLOR.NEUTRAL, undefined, guild).setTitle(`${ICON.time} Invite History — ${user.username}`);
  if (joins.length === 0) {
    return embed.setDescription('No invites recorded yet.');
  }
  const statusIcon: Record<string, string> = {
    PENDING: ICON.time,
    VERIFIED: ICON.check,
    REWARDED: ICON.coin,
    FAKE: ICON.cross,
    REJECTED: ICON.cross,
  };
  const lines = joins.map((j) => {
    const icon = statusIcon[j.status] ?? '•';
    const when = `<t:${Math.floor(j.joinedAt.getTime() / 1000)}:R>`;
    const reason = j.fakeReason ? ` _(${j.fakeReason})_` : '';
    return `${icon} <@${j.invitedUserId}> · \`${j.status}\`${reason} · ${when}`;
  });
  return embed.setDescription(`${LINE}\n${lines.join('\n')}`);
}

export function buildInviteRewardsEmbed(user: User, guild: Guild | null, rewards: InviteReward[]): EmbedBuilder {
  const embed = brandedEmbed(COLOR.WIN, undefined, guild).setTitle(`${ICON.coin} Reward History — ${user.username}`);
  if (rewards.length === 0) {
    return embed.setDescription('No rewards earned yet.');
  }
  const lines = rewards.map((r) => {
    const when = `<t:${Math.floor(r.createdAt.getTime() / 1000)}:R>`;
    return `${ICON.win} **+${r.amount.toString()}** ${BRAND.ticker} · \`${r.type}\` · ${when}`;
  });
  return embed.setDescription(`${LINE}\n${lines.join('\n')}`);
}

export function buildInviteMilestonesEmbed(
  user: User,
  guild: Guild | null,
  milestones: InviteMilestone[],
  verified: number,
  awardedThresholds: Set<number>
): EmbedBuilder {
  const embed = brandedEmbed(COLOR.JACKPOT, undefined, guild).setTitle(`${ICON.jackpot} Milestones — ${user.username}`);
  if (milestones.length === 0) {
    return embed.setDescription('No milestones configured.');
  }
  const lines = milestones.map((m) => {
    const done = awardedThresholds.has(m.threshold);
    const mark = done ? ICON.check : verified >= m.threshold ? '◍' : '○';
    const reward = `${ICON.coin} ${m.rewardAmount} ${BRAND.ticker}${m.rewardRoleId ? ` + <@&${m.rewardRoleId}>` : ''}`;
    return `${mark} **${m.threshold}** — ${m.label ?? 'Milestone'} · ${reward}`;
  });
  return embed.setDescription(`${LINE}\nVerified invites: **${verified}**\n\n${lines.join('\n')}\n${SPACER}`);
}

export function buildInviteLeaderboardEmbed(
  guild: Guild | null,
  entries: LeaderboardEntry[],
  page: number,
  totalPages: number,
  window: LeaderboardWindow
): EmbedBuilder {
  const windowLabel = window === 'weekly' ? 'This Week' : window === 'monthly' ? 'This Month' : 'All Time';
  const embed = brandedEmbed(COLOR.ACTIVE, undefined, guild)
    .setTitle(`${ICON.jackpot} Invite Leaderboard · ${windowLabel}`)
    .setFooter({ text: `Page ${page}/${totalPages}  ·  ${BRAND.name}` });

  if (entries.length === 0) {
    return embed.setDescription('No invites tracked yet. Be the first!');
  }

  const lines = entries.map((e) => {
    const badge = e.rank <= 3 ? MEDALS[e.rank - 1] : `\`#${e.rank}\``;
    return `${badge} <@${e.userId}> — **${e.count}** invites · ${ICON.coin} ${e.rcEarned} ${BRAND.ticker}`;
  });
  return embed.setDescription(`${LINE}\n${lines.join('\n')}`);
}

export function buildLeaderboardButtons(page: number, totalPages: number, window: LeaderboardWindow): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`invlb:${window}:${page - 1}`)
      .setLabel('Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`invlb:${window}:${page}:refresh`)
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`invlb:${window}:${page + 1}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages)
  );
}
