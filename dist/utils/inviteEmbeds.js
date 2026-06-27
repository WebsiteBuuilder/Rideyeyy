"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildInviteCardEmbed = buildInviteCardEmbed;
exports.buildInviteStatsEmbed = buildInviteStatsEmbed;
exports.buildInviteHistoryEmbed = buildInviteHistoryEmbed;
exports.buildInviteRewardsEmbed = buildInviteRewardsEmbed;
exports.buildInviteMilestonesEmbed = buildInviteMilestonesEmbed;
exports.buildInviteLeaderboardEmbed = buildInviteLeaderboardEmbed;
exports.buildLeaderboardButtons = buildLeaderboardButtons;
const discord_js_1 = require("discord.js");
const discord_1 = require("./discord");
// ═══════════════════════════════════════════════════════════════════════════
//  Invite system embeds — styled to match the GUHD RIDES brand.
// ═══════════════════════════════════════════════════════════════════════════
const MEDALS = ['🥇', '🥈', '🥉'];
function statsOrZero(stats) {
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
function buildInviteCardEmbed(data) {
    const s = statsOrZero(data.stats);
    const rankText = data.rank > 0 ? `#${data.rank} / ${data.total}` : 'Unranked';
    let milestoneText;
    if (data.nextMilestone) {
        const m = data.nextMilestone;
        milestoneText =
            `**${m.label ?? `${m.threshold} invites`}** — ${s.verified}/${m.threshold}\n` +
                `${(0, discord_1.progressBar)(s.verified, m.threshold, 12)}\n` +
                `Reward: ${discord_1.ICON.coin} **${m.rewardAmount}** ${discord_1.BRAND.ticker}` +
                (m.rewardRoleId ? ` + <@&${m.rewardRoleId}>` : '');
    }
    else {
        milestoneText = '`All milestones complete!` 🏆';
    }
    return (0, discord_1.brandedEmbed)(discord_1.COLOR.EPIC, undefined, data.guild)
        .setTitle(`${discord_1.ICON.jackpot} Invite Card`)
        .setThumbnail(data.user.displayAvatarURL({ size: 256 }))
        .setDescription(`**${data.user.username}** · Rank **${rankText}**\n` +
        `Reward per verified invite: ${discord_1.ICON.coin} **${data.rewardAmount}** ${discord_1.BRAND.ticker}\n${discord_1.LINE}`)
        .addFields({ name: `${discord_1.ICON.check} Verified`, value: `**${s.verified}**`, inline: true }, { name: `${discord_1.ICON.time} Pending`, value: `**${s.pending}**`, inline: true }, { name: `${discord_1.ICON.cross} Fake`, value: `**${s.fake}**`, inline: true }, { name: `${discord_1.ICON.coin} RC Earned`, value: `**${s.rcEarned}** ${discord_1.BRAND.ticker}`, inline: true }, { name: `${discord_1.ICON.streak} Streak`, value: `**${s.streak}**`, inline: true }, { name: `${discord_1.ICON.jackpot} Milestones`, value: `**${s.milestonesCompleted}**`, inline: true }, { name: `${discord_1.ICON.arrow} Next Milestone`, value: milestoneText, inline: false });
}
function buildInviteStatsEmbed(user, guild, stats) {
    const s = statsOrZero(stats);
    return (0, discord_1.brandedEmbed)(discord_1.COLOR.INFO, undefined, guild)
        .setTitle(`${discord_1.ICON.check} Invite Stats — ${user.username}`)
        .setDescription(discord_1.LINE)
        .addFields({ name: 'Lifetime', value: `**${s.lifetime}**`, inline: true }, { name: 'Verified', value: `**${s.verified}**`, inline: true }, { name: 'Pending', value: `**${s.pending}**`, inline: true }, { name: 'Fake', value: `**${s.fake}**`, inline: true }, { name: 'This Week', value: `**${s.weeklyCount}**`, inline: true }, { name: 'This Month', value: `**${s.monthlyCount}**`, inline: true }, { name: 'RC Earned', value: `${discord_1.ICON.coin} **${s.rcEarned}** ${discord_1.BRAND.ticker}`, inline: true }, { name: 'Streak', value: `${discord_1.ICON.streak} **${s.streak}**`, inline: true }, { name: 'Milestones', value: `${discord_1.ICON.jackpot} **${s.milestonesCompleted}**`, inline: true });
}
function buildInviteHistoryEmbed(user, guild, joins) {
    const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.NEUTRAL, undefined, guild).setTitle(`${discord_1.ICON.time} Invite History — ${user.username}`);
    if (joins.length === 0) {
        return embed.setDescription('No invites recorded yet.');
    }
    const statusIcon = {
        PENDING: discord_1.ICON.time,
        VERIFIED: discord_1.ICON.check,
        REWARDED: discord_1.ICON.coin,
        FAKE: discord_1.ICON.cross,
        REJECTED: discord_1.ICON.cross,
    };
    const lines = joins.map((j) => {
        const icon = statusIcon[j.status] ?? '•';
        const when = `<t:${Math.floor(j.joinedAt.getTime() / 1000)}:R>`;
        const reason = j.fakeReason ? ` _(${j.fakeReason})_` : '';
        return `${icon} <@${j.invitedUserId}> · \`${j.status}\`${reason} · ${when}`;
    });
    return embed.setDescription(`${discord_1.LINE}\n${lines.join('\n')}`);
}
function buildInviteRewardsEmbed(user, guild, rewards) {
    const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.WIN, undefined, guild).setTitle(`${discord_1.ICON.coin} Reward History — ${user.username}`);
    if (rewards.length === 0) {
        return embed.setDescription('No rewards earned yet.');
    }
    const lines = rewards.map((r) => {
        const when = `<t:${Math.floor(r.createdAt.getTime() / 1000)}:R>`;
        return `${discord_1.ICON.win} **+${r.amount.toString()}** ${discord_1.BRAND.ticker} · \`${r.type}\` · ${when}`;
    });
    return embed.setDescription(`${discord_1.LINE}\n${lines.join('\n')}`);
}
function buildInviteMilestonesEmbed(user, guild, milestones, verified, awardedThresholds) {
    const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.JACKPOT, undefined, guild).setTitle(`${discord_1.ICON.jackpot} Milestones — ${user.username}`);
    if (milestones.length === 0) {
        return embed.setDescription('No milestones configured.');
    }
    const lines = milestones.map((m) => {
        const done = awardedThresholds.has(m.threshold);
        const mark = done ? discord_1.ICON.check : verified >= m.threshold ? '◍' : '○';
        const reward = `${discord_1.ICON.coin} ${m.rewardAmount} ${discord_1.BRAND.ticker}${m.rewardRoleId ? ` + <@&${m.rewardRoleId}>` : ''}`;
        return `${mark} **${m.threshold}** — ${m.label ?? 'Milestone'} · ${reward}`;
    });
    return embed.setDescription(`${discord_1.LINE}\nVerified invites: **${verified}**\n\n${lines.join('\n')}\n${discord_1.SPACER}`);
}
function buildInviteLeaderboardEmbed(guild, entries, page, totalPages, window) {
    const windowLabel = window === 'weekly' ? 'This Week' : window === 'monthly' ? 'This Month' : 'All Time';
    const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.ACTIVE, undefined, guild)
        .setTitle(`${discord_1.ICON.jackpot} Invite Leaderboard · ${windowLabel}`)
        .setFooter({ text: `Page ${page}/${totalPages}  ·  ${discord_1.BRAND.name}` });
    if (entries.length === 0) {
        return embed.setDescription('No invites tracked yet. Be the first!');
    }
    const lines = entries.map((e) => {
        const badge = e.rank <= 3 ? MEDALS[e.rank - 1] : `\`#${e.rank}\``;
        return `${badge} <@${e.userId}> — **${e.count}** invites · ${discord_1.ICON.coin} ${e.rcEarned} ${discord_1.BRAND.ticker}`;
    });
    return embed.setDescription(`${discord_1.LINE}\n${lines.join('\n')}`);
}
function buildLeaderboardButtons(page, totalPages, window) {
    return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId(`invlb:${window}:${page - 1}`)
        .setLabel('Prev')
        .setStyle(discord_js_1.ButtonStyle.Secondary)
        .setDisabled(page <= 1), new discord_js_1.ButtonBuilder()
        .setCustomId(`invlb:${window}:${page}:refresh`)
        .setLabel('Refresh')
        .setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder()
        .setCustomId(`invlb:${window}:${page + 1}`)
        .setLabel('Next')
        .setStyle(discord_js_1.ButtonStyle.Secondary)
        .setDisabled(page >= totalPages));
}
