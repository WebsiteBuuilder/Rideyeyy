"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InviteMilestoneService = void 0;
const discord_js_1 = require("discord.js");
const client_1 = require("@prisma/client");
const decimal_js_1 = __importDefault(require("decimal.js"));
const prisma_1 = require("../../lib/prisma");
const wallet_1 = require("../../lib/wallet");
const discord_1 = require("../../utils/discord");
class InviteMilestoneService {
    constructor(logging, stats) {
        this.logging = logging;
        this.stats = stats;
    }
    async checkAndAward(ctx) {
        if (!ctx.milestonesEnabled)
            return [];
        const { guild, userId } = ctx;
        const guildId = guild.id;
        const verified = await prisma_1.prisma.inviteJoin.count({
            where: { guildId, inviterUserId: userId, status: { in: [client_1.InviteStatus.VERIFIED, client_1.InviteStatus.REWARDED] } },
        });
        const milestones = await prisma_1.prisma.inviteMilestone.findMany({
            where: { guildId, enabled: true, threshold: { lte: verified } },
            orderBy: { threshold: 'asc' },
        });
        const awarded = [];
        for (const m of milestones) {
            const exists = await prisma_1.prisma.inviteMilestoneAward.findUnique({
                where: { guildId_userId_milestoneId: { guildId, userId, milestoneId: m.id } },
            });
            if (exists)
                continue;
            try {
                await prisma_1.prisma.$transaction(async (tx) => {
                    await tx.inviteMilestoneAward.create({ data: { guildId, userId, milestoneId: m.id } });
                    if (m.rewardAmount > 0) {
                        await (0, wallet_1.adjustBalance)(tx, userId, new decimal_js_1.default(m.rewardAmount), 'invite_milestone', `Invite milestone: ${m.threshold} verified invites`);
                        await tx.inviteReward.create({
                            data: {
                                guildId,
                                inviterUserId: userId,
                                amount: new client_1.Prisma.Decimal(m.rewardAmount),
                                type: client_1.InviteRewardType.MILESTONE,
                                reason: `Milestone ${m.threshold}`,
                            },
                        });
                    }
                });
            }
            catch (err) {
                // Unique violation = awarded concurrently; anything else we log and skip.
                if (!(err instanceof client_1.Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
                    console.error('[Invite] Milestone award failed:', err);
                }
                continue;
            }
            if (m.rewardRoleId) {
                try {
                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (member)
                        await member.roles.add(m.rewardRoleId);
                }
                catch (err) {
                    console.warn('[Invite] Could not add milestone role:', err.message);
                }
            }
            awarded.push({
                threshold: m.threshold,
                label: m.label,
                rewardAmount: m.rewardAmount,
                rewardRoleId: m.rewardRoleId,
            });
            await this.logging.log({
                guildId,
                event: 'MILESTONE_COMPLETED',
                actorId: userId,
                detail: `Reached ${m.threshold} invites${m.label ? ` (${m.label})` : ''} → +${m.rewardAmount} ${discord_1.BRAND.ticker}`,
            }, { client: ctx.client, channelId: ctx.loggingChannelId });
            if (ctx.autoAnnounce) {
                await this.announce(ctx, m.threshold, m.label, m.rewardAmount, m.rewardRoleId);
            }
        }
        if (awarded.length > 0) {
            await this.stats.recomputeUserStats(guildId, userId);
        }
        return awarded;
    }
    async announce(ctx, threshold, label, rewardAmount, rewardRoleId) {
        if (!ctx.announceChannelId || ctx.announceChannelId === '0')
            return;
        try {
            const channel = await ctx.client.channels.fetch(ctx.announceChannelId).catch(() => null);
            if (!channel || !channel.isTextBased() || channel.isDMBased())
                return;
            const rewardLines = [];
            if (rewardAmount > 0)
                rewardLines.push(`${discord_1.ICON.coin} **${rewardAmount}** ${discord_1.BRAND.ticker}`);
            if (rewardRoleId)
                rewardLines.push(`${discord_1.ICON.jackpot} <@&${rewardRoleId}>`);
            const embed = new discord_js_1.EmbedBuilder()
                .setColor(discord_1.COLOR.JACKPOT)
                .setAuthor({ name: `${discord_1.BRAND.logo}  Invite Milestone` })
                .setTitle(`${discord_1.ICON.jackpot} Milestone Unlocked!`)
                .setDescription(`<@${ctx.userId}> just reached **${threshold} invites**${label ? ` — **${label}**` : ''}!\n\n` +
                (rewardLines.length ? `**Rewards**\n${rewardLines.join('\n')}` : ''))
                .setTimestamp();
            await channel.send({ content: `<@${ctx.userId}>`, embeds: [embed] });
        }
        catch (err) {
            console.error('[Invite] Milestone announce failed:', err);
        }
    }
}
exports.InviteMilestoneService = InviteMilestoneService;
