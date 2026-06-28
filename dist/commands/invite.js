"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inviteLeaderboardData = exports.invitesData = void 0;
exports.handleInvites = handleInvites;
exports.handleInviteLeaderboard = handleInviteLeaderboard;
exports.handleLeaderboardButton = handleLeaderboardButton;
const discord_js_1 = require("discord.js");
const client_1 = require("@prisma/client");
const prisma_1 = require("../lib/prisma");
const config_1 = require("../config");
const discord_1 = require("../utils/discord");
const inviteEmbeds_1 = require("../utils/inviteEmbeds");
// ═══════════════════════════════════════════════════════════════════════════
//  /invites — your invite dashboard (stats, milestones, recent joins)
//  /invite-leaderboard — top inviters
// ═══════════════════════════════════════════════════════════════════════════
exports.invitesData = new discord_js_1.SlashCommandBuilder()
    .setName('invites')
    .setDescription('Your invite stats, milestones, rewards, and recent joins')
    .addUserOption((o) => o.setName('user').setDescription('View another member').setRequired(false));
exports.inviteLeaderboardData = new discord_js_1.SlashCommandBuilder()
    .setName('invite-leaderboard')
    .setDescription('Top inviters leaderboard')
    .addStringOption((o) => o
    .setName('window')
    .setDescription('Time window')
    .setRequired(false)
    .addChoices({ name: 'All Time', value: 'all' }, { name: 'This Week', value: 'weekly' }, { name: 'This Month', value: 'monthly' }));
function statusLabel(status) {
    switch (status) {
        case client_1.InviteStatus.REWARDED:
            return `${discord_1.ICON.check} Rewarded`;
        case client_1.InviteStatus.VERIFIED:
            return `${discord_1.ICON.check} Verified`;
        case client_1.InviteStatus.PENDING:
            return '⏳ Pending';
        case client_1.InviteStatus.FAKE:
            return `${discord_1.ICON.cross} Rejected`;
        default:
            return status;
    }
}
async function handleInvites(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId) {
        await (0, discord_1.ephemeralReply)(interaction, 'Use this command inside the server.');
        return;
    }
    const target = interaction.options.getUser('user') ?? interaction.user;
    const [stats, pendingCount, cfg, tickets, activeCodes, recentJoins] = await Promise.all([
        prisma_1.prisma.inviteUserStats.findUnique({ where: { guildId_userId: { guildId, userId: target.id } } }),
        prisma_1.prisma.inviteJoin.count({ where: { guildId, inviterUserId: target.id, status: client_1.InviteStatus.PENDING } }),
        services.invite.admin.getConfig(guildId),
        services.lottery.getTickets(guildId, target.id),
        services.redemption.listForUser(guildId, target.id, client_1.RedemptionStatus.ACTIVE),
        prisma_1.prisma.inviteJoin.findMany({
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
    const nextMilestone = await prisma_1.prisma.inviteMilestone.findFirst({
        where: { guildId, enabled: true, threshold: { gt: verified } },
        orderBy: { threshold: 'asc' },
    });
    const progress = nextMilestone
        ? `${(0, discord_1.progressBar)(verified, nextMilestone.threshold)}  (${verified}/${nextMilestone.threshold})\n` +
            `Next: **${nextMilestone.label ?? `Milestone ${nextMilestone.threshold}`}** at ${nextMilestone.threshold} invites`
        : `${(0, discord_1.progressBar)(1, 1)}\nYou've reached every milestone — legend! ${discord_1.ICON.jackpot}`;
    const codeLines = activeCodes.length
        ? activeCodes.map((c) => `\`${c.code}\` — ${services.redemption.label(c.rewardKey)}`).join('\n')
        : '_None — earn via milestones, /shop, or the lottery._';
    const recentLines = recentJoins.length
        ? recentJoins
            .map((j) => `<@${j.invitedUserId}> — ${statusLabel(j.status)}`)
            .join('\n')
        : '_No invites yet — share your Discord invite link!_';
    const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.EPIC, undefined, interaction.guild)
        .setTitle(`${discord_1.ICON.jackpot} Invites — ${target.username}`)
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .setDescription(`${discord_1.LINE}\n${progress}`)
        .addFields({ name: 'Verified', value: `${verified}`, inline: true }, { name: 'Pending', value: `${pendingCount}`, inline: true }, { name: 'Rejected', value: `${fake}`, inline: true }, { name: `${discord_1.BRAND.ticker} Earned`, value: `${discord_1.ICON.coin} ${rcEarned}`, inline: true }, { name: 'Milestones', value: `${milestonesCompleted}`, inline: true }, { name: 'Rank', value: rank > 0 ? `#${rank} / ${total}` : '—', inline: true }, { name: 'Lottery Tickets', value: `${tickets}`, inline: true }, { name: 'Per Verify', value: `${discord_1.ICON.coin} ${cfg.rewardAmount} ${discord_1.BRAND.ticker}`, inline: true }, { name: 'First Ride Bonus', value: `${discord_1.ICON.coin} ${config_1.config.inviteEconomy.firstOrderBonusRc} ${discord_1.BRAND.ticker}`, inline: true }, { name: 'Recent Invites', value: recentLines, inline: false }, { name: 'Active Reward Codes', value: codeLines, inline: false });
    await (0, discord_1.ephemeralEmbed)(interaction, embed);
}
async function handleInviteLeaderboard(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId) {
        await (0, discord_1.ephemeralReply)(interaction, 'Use this command inside the server.');
        return;
    }
    const window = interaction.options.getString('window') ?? 'all';
    const pageData = await services.invite.leaderboard.getPage(guildId, 1, 10, window);
    const embed = (0, inviteEmbeds_1.buildInviteLeaderboardEmbed)(interaction.guild, pageData.entries, pageData.page, pageData.totalPages, window);
    const row = (0, inviteEmbeds_1.buildLeaderboardButtons)(pageData.page, pageData.totalPages, window);
    if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ embeds: [embed], components: [row] });
    }
    else {
        await interaction.reply({ embeds: [embed], components: [row] });
    }
}
async function handleLeaderboardButton(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId)
        return;
    const parts = interaction.customId.split(':');
    const window = parts[1] ?? 'all';
    const page = Math.max(1, Number(parts[2]) || 1);
    const pageData = await services.invite.leaderboard.getPage(guildId, page, 10, window);
    const embed = (0, inviteEmbeds_1.buildInviteLeaderboardEmbed)(interaction.guild, pageData.entries, pageData.page, pageData.totalPages, window);
    const row = (0, inviteEmbeds_1.buildLeaderboardButtons)(pageData.page, pageData.totalPages, window);
    await interaction.update({ embeds: [embed], components: [row] });
}
