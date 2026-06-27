"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invitesLeaderboardData = exports.inviteUserData = void 0;
exports.handleInvite = handleInvite;
exports.handleInviteLeaderboard = handleInviteLeaderboard;
exports.handleLeaderboardButton = handleLeaderboardButton;
const discord_js_1 = require("discord.js");
const client_1 = require("@prisma/client");
const prisma_1 = require("../lib/prisma");
const discord_1 = require("../utils/discord");
const inviteEmbeds_1 = require("../utils/inviteEmbeds");
// ═══════════════════════════════════════════════════════════════════════════
//  /invite  — personal invite card + detail views
//  /invites — paginated invite leaderboard
// ═══════════════════════════════════════════════════════════════════════════
exports.inviteUserData = new discord_js_1.SlashCommandBuilder()
    .setName('invite')
    .setDescription('View your invite card, stats, history, rewards, and milestones')
    .addSubcommand((s) => s
    .setName('card')
    .setDescription('Your invite card overview')
    .addUserOption((o) => o.setName('user').setDescription('View another member').setRequired(false)))
    .addSubcommand((s) => s
    .setName('stats')
    .setDescription('Detailed invite statistics')
    .addUserOption((o) => o.setName('user').setDescription('View another member').setRequired(false)))
    .addSubcommand((s) => s
    .setName('history')
    .setDescription('Recent invites you brought in')
    .addUserOption((o) => o.setName('user').setDescription('View another member').setRequired(false)))
    .addSubcommand((s) => s
    .setName('rewards')
    .setDescription('Your invite reward history')
    .addUserOption((o) => o.setName('user').setDescription('View another member').setRequired(false)))
    .addSubcommand((s) => s.setName('milestones').setDescription('Invite milestones and your progress'));
exports.invitesLeaderboardData = new discord_js_1.SlashCommandBuilder()
    .setName('invites')
    .setDescription('Invite leaderboard')
    .addStringOption((o) => o
    .setName('window')
    .setDescription('Time window')
    .setRequired(false)
    .addChoices({ name: 'All Time', value: 'all' }, { name: 'This Week', value: 'weekly' }, { name: 'This Month', value: 'monthly' }));
async function handleInvite(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId) {
        await (0, discord_1.ephemeralReply)(interaction, 'Use this command inside the server.');
        return;
    }
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('user') ?? interaction.user;
    const guild = interaction.guild;
    switch (sub) {
        case 'card': {
            const cfg = await services.invite.admin.getConfig(guildId);
            const stats = await prisma_1.prisma.inviteUserStats.findUnique({
                where: { guildId_userId: { guildId, userId: target.id } },
            });
            const { rank, total } = await services.invite.leaderboard.getUserRank(guildId, target.id);
            const verified = stats?.verified ?? 0;
            const nextMilestone = await prisma_1.prisma.inviteMilestone.findFirst({
                where: { guildId, enabled: true, threshold: { gt: verified } },
                orderBy: { threshold: 'asc' },
            });
            await (0, discord_1.ephemeralEmbed)(interaction, (0, inviteEmbeds_1.buildInviteCardEmbed)({ user: target, guild, stats, rank, total, rewardAmount: cfg.rewardAmount, nextMilestone }));
            return;
        }
        case 'stats': {
            const stats = await prisma_1.prisma.inviteUserStats.findUnique({
                where: { guildId_userId: { guildId, userId: target.id } },
            });
            await (0, discord_1.ephemeralEmbed)(interaction, (0, inviteEmbeds_1.buildInviteStatsEmbed)(target, guild, stats));
            return;
        }
        case 'history': {
            const joins = await prisma_1.prisma.inviteJoin.findMany({
                where: { guildId, inviterUserId: target.id },
                orderBy: { joinedAt: 'desc' },
                take: 15,
            });
            await (0, discord_1.ephemeralEmbed)(interaction, (0, inviteEmbeds_1.buildInviteHistoryEmbed)(target, guild, joins));
            return;
        }
        case 'rewards': {
            const rewards = await prisma_1.prisma.inviteReward.findMany({
                where: { guildId, inviterUserId: target.id },
                orderBy: { createdAt: 'desc' },
                take: 15,
            });
            await (0, discord_1.ephemeralEmbed)(interaction, (0, inviteEmbeds_1.buildInviteRewardsEmbed)(target, guild, rewards));
            return;
        }
        case 'milestones': {
            const verified = await prisma_1.prisma.inviteJoin.count({
                where: { guildId, inviterUserId: interaction.user.id, status: { in: [client_1.InviteStatus.VERIFIED, client_1.InviteStatus.REWARDED] } },
            });
            const milestones = await services.invite.admin.listMilestones(guildId);
            const awards = await prisma_1.prisma.inviteMilestoneAward.findMany({
                where: { guildId, userId: interaction.user.id },
                select: { milestoneId: true },
            });
            const awardedIds = new Set(awards.map((a) => a.milestoneId));
            const awardedThresholds = new Set(milestones.filter((m) => awardedIds.has(m.id)).map((m) => m.threshold));
            await (0, discord_1.ephemeralEmbed)(interaction, (0, inviteEmbeds_1.buildInviteMilestonesEmbed)(interaction.user, guild, milestones, verified, awardedThresholds));
            return;
        }
        default:
            await (0, discord_1.ephemeralReply)(interaction, 'Unknown subcommand.');
    }
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
    // customId: invlb:<window>:<page>[:refresh]
    const parts = interaction.customId.split(':');
    const window = parts[1] ?? 'all';
    const page = Math.max(1, Number(parts[2]) || 1);
    const pageData = await services.invite.leaderboard.getPage(guildId, page, 10, window);
    const embed = (0, inviteEmbeds_1.buildInviteLeaderboardEmbed)(interaction.guild, pageData.entries, pageData.page, pageData.totalPages, window);
    const row = (0, inviteEmbeds_1.buildLeaderboardButtons)(pageData.page, pageData.totalPages, window);
    await interaction.update({ embeds: [embed], components: [row] });
}
