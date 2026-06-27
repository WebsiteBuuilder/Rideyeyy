"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.referralData = void 0;
exports.handleReferral = handleReferral;
const discord_js_1 = require("discord.js");
const client_1 = require("@prisma/client");
const prisma_1 = require("../lib/prisma");
const discord_1 = require("../utils/discord");
// ═══════════════════════════════════════════════════════════════════════════
//  /referral — personal referral dashboard: verified/pending invites, progress
//  to the next milestone, rewards earned, and current weekly-lottery tickets.
// ═══════════════════════════════════════════════════════════════════════════
exports.referralData = new discord_js_1.SlashCommandBuilder()
    .setName('referral')
    .setDescription('Your referral progress, rewards, and lottery tickets')
    .addUserOption((o) => o.setName('user').setDescription('View another member').setRequired(false));
async function handleReferral(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId) {
        await (0, discord_1.ephemeralReply)(interaction, 'Use this command inside the server.');
        return;
    }
    const target = interaction.options.getUser('user') ?? interaction.user;
    const [stats, pendingCount, cfg, tickets, activeCodes] = await Promise.all([
        prisma_1.prisma.inviteUserStats.findUnique({ where: { guildId_userId: { guildId, userId: target.id } } }),
        prisma_1.prisma.inviteJoin.count({ where: { guildId, inviterUserId: target.id, status: client_1.InviteStatus.PENDING } }),
        services.invite.admin.getConfig(guildId),
        services.lottery.getTickets(guildId, target.id),
        services.redemption.listForUser(guildId, target.id, client_1.RedemptionStatus.ACTIVE),
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
    const rewardKeyToLabel = (k) => services.redemption.label(k);
    const codeLines = activeCodes.length
        ? activeCodes.map((c) => `\`${c.code}\` — ${rewardKeyToLabel(c.rewardKey)}`).join('\n')
        : '_None — earn rides via milestones, /shop, or the lottery._';
    const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.EPIC, undefined, interaction.guild)
        .setTitle(`${discord_1.ICON.jackpot} Referral Card — ${target.username}`)
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .setDescription(`${discord_1.LINE}\n${progress}`)
        .addFields({ name: 'Verified Invites', value: `${verified}`, inline: true }, { name: 'Pending', value: `${pendingCount}`, inline: true }, { name: 'Fake / Rejected', value: `${fake}`, inline: true }, { name: 'Route Cash Earned', value: `${discord_1.ICON.coin} ${rcEarned} ${discord_1.BRAND.ticker}`, inline: true }, { name: 'Milestones', value: `${milestonesCompleted}`, inline: true }, { name: 'Leaderboard Rank', value: rank > 0 ? `#${rank} / ${total}` : '—', inline: true }, { name: '🎟️ Lottery Tickets', value: `${tickets}`, inline: true }, { name: 'Reward / Verified Invite', value: `${discord_1.ICON.coin} ${cfg.rewardAmount} ${discord_1.BRAND.ticker}`, inline: true }, { name: '\u200b', value: '\u200b', inline: true }, { name: 'Active Reward Codes', value: codeLines, inline: false });
    await (0, discord_1.ephemeralEmbed)(interaction, embed);
}
