"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InviteRewardService = void 0;
const discord_js_1 = require("discord.js");
const client_1 = require("@prisma/client");
const decimal_js_1 = __importDefault(require("decimal.js"));
const prisma_1 = require("../../lib/prisma");
const wallet_1 = require("../../lib/wallet");
const discord_1 = require("../../utils/discord");
// ═══════════════════════════════════════════════════════════════════════════
//  InviteRewardService — credits RouteCash to an inviter for a verified invite,
//  atomically (economy + invite tables in one transaction) with cap enforcement
//  and full rollback if the economy write fails.
// ═══════════════════════════════════════════════════════════════════════════
const DAY_MS = 24 * 60 * 60 * 1000;
class InviteRewardService {
    constructor(logging, stats, milestones) {
        this.logging = logging;
        this.stats = stats;
        this.milestones = milestones;
    }
    /** Reward a join that has already passed verification. */
    async rewardJoin(client, guild, join, config) {
        const guildId = guild.id;
        const inviterId = join.inviterUserId;
        if (!inviterId) {
            await this.markVerifiedNoReward(join.id);
            return { rewarded: false, reason: 'NO_INVITER' };
        }
        if (!config.rewardEnabled) {
            await this.finishVerifiedUnpaid(client, guild, join.id, inviterId, config);
            return { rewarded: false, reason: 'DISABLED' };
        }
        const cap = await this.checkCaps(guildId, inviterId, config);
        if (cap) {
            await this.finishVerifiedUnpaid(client, guild, join.id, inviterId, config);
            await this.logging.log({ guildId, event: 'REWARD_CAPPED', actorId: inviterId, targetUserId: join.invitedUserId, joinId: join.id, detail: cap }, { client, channelId: config.loggingChannelId });
            return { rewarded: false, reason: cap };
        }
        const amount = config.rewardAmount;
        try {
            await prisma_1.prisma.$transaction(async (tx) => {
                await (0, wallet_1.adjustBalance)(tx, inviterId, new decimal_js_1.default(amount), 'invite_reward', `Invite reward for ${join.invitedUserId}`);
                await tx.inviteJoin.update({
                    where: { id: join.id },
                    data: {
                        status: client_1.InviteStatus.REWARDED,
                        rewarded: true,
                        verifiedAt: new Date(),
                        rewardAmount: amount,
                        fakeReason: null,
                    },
                });
                await tx.inviteReward.create({
                    data: {
                        guildId,
                        inviterUserId: inviterId,
                        invitedUserId: join.invitedUserId,
                        joinId: join.id,
                        amount: new client_1.Prisma.Decimal(amount),
                        type: client_1.InviteRewardType.INVITE,
                        reason: `Invite reward for ${join.invitedUserId}`,
                    },
                });
            });
        }
        catch (err) {
            console.error('[Invite] Reward transaction failed (will retry next sweep):', err);
            await this.logging.log({ guildId, event: 'REWARD_FAILED', actorId: inviterId, targetUserId: join.invitedUserId, joinId: join.id, detail: err.message }, { client, channelId: config.loggingChannelId });
            return { rewarded: false, reason: 'ECONOMY_ERROR' };
        }
        await this.stats.registerVerifiedInvite(guildId, inviterId);
        await this.stats.recomputeUserStats(guildId, inviterId);
        await this.logging.log({ guildId, event: 'REWARD_PAID', actorId: inviterId, targetUserId: join.invitedUserId, joinId: join.id, detail: `+${amount} ${discord_1.BRAND.ticker}` }, { client, channelId: config.loggingChannelId });
        await this.notify(client, guild, inviterId, join.invitedUserId, amount, config);
        await this.milestones.checkAndAward({
            client,
            guild,
            userId: inviterId,
            milestonesEnabled: config.milestonesEnabled,
            autoAnnounce: config.autoAnnounce,
            announceChannelId: config.announceChannelId,
            loggingChannelId: config.loggingChannelId,
        });
        return { rewarded: true, amount };
    }
    async checkCaps(guildId, inviterId, config) {
        const now = Date.now();
        const base = { guildId, inviterUserId: inviterId, status: client_1.InviteStatus.REWARDED };
        if (config.dailyCap > 0) {
            const c = await prisma_1.prisma.inviteJoin.count({ where: { ...base, verifiedAt: { gte: new Date(now - DAY_MS) } } });
            if (c >= config.dailyCap)
                return 'CAP_DAILY';
        }
        if (config.weeklyCap > 0) {
            const c = await prisma_1.prisma.inviteJoin.count({ where: { ...base, verifiedAt: { gte: new Date(now - 7 * DAY_MS) } } });
            if (c >= config.weeklyCap)
                return 'CAP_WEEKLY';
        }
        if (config.monthlyCap > 0) {
            const c = await prisma_1.prisma.inviteJoin.count({ where: { ...base, verifiedAt: { gte: new Date(now - 30 * DAY_MS) } } });
            if (c >= config.monthlyCap)
                return 'CAP_MONTHLY';
        }
        if (config.maxRewardsPerInviter > 0) {
            const c = await prisma_1.prisma.inviteJoin.count({ where: base });
            if (c >= config.maxRewardsPerInviter)
                return 'CAP_MAX';
        }
        return null;
    }
    /** Mark verified but unpaid (no inviter resolvable). */
    async markVerifiedNoReward(joinId) {
        await prisma_1.prisma.inviteJoin.update({
            where: { id: joinId },
            data: { status: client_1.InviteStatus.VERIFIED, verifiedAt: new Date(), fakeReason: null },
        });
    }
    /** Mark verified (counts as a real invite) but without paying RC; still runs milestones. */
    async finishVerifiedUnpaid(client, guild, joinId, inviterId, config) {
        await prisma_1.prisma.inviteJoin.update({
            where: { id: joinId },
            data: { status: client_1.InviteStatus.VERIFIED, verifiedAt: new Date(), fakeReason: null },
        });
        await this.stats.registerVerifiedInvite(guild.id, inviterId);
        await this.stats.recomputeUserStats(guild.id, inviterId);
        await this.milestones.checkAndAward({
            client,
            guild,
            userId: inviterId,
            milestonesEnabled: config.milestonesEnabled,
            autoAnnounce: config.autoAnnounce,
            announceChannelId: config.announceChannelId,
            loggingChannelId: config.loggingChannelId,
        });
    }
    async notify(client, guild, inviterId, invitedUserId, amount, config) {
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(discord_1.COLOR.WIN)
            .setAuthor({ name: `${discord_1.BRAND.logo}  Invite Reward` })
            .setTitle(`${discord_1.ICON.coin} +${amount} ${discord_1.BRAND.ticker}`)
            .setDescription(`Your invite was verified — <@${invitedUserId}> stuck around!\nYou earned **${amount}** ${discord_1.BRAND.ticker}.`)
            .setTimestamp();
        // DM the inviter (best-effort).
        try {
            const user = await client.users.fetch(inviterId);
            await user.send({ embeds: [embed] });
        }
        catch {
            /* DMs closed — ignore */
        }
        // Public announcement (best-effort).
        if (config.autoAnnounce && config.announceChannelId && config.announceChannelId !== '0') {
            try {
                const channel = await client.channels.fetch(config.announceChannelId).catch(() => null);
                if (channel && channel.isTextBased() && !channel.isDMBased()) {
                    const pub = new discord_js_1.EmbedBuilder()
                        .setColor(discord_1.COLOR.WIN)
                        .setAuthor({ name: `${discord_1.BRAND.logo}  Invite Reward` })
                        .setDescription(`${discord_1.ICON.win} <@${inviterId}> earned **${amount}** ${discord_1.BRAND.ticker} for inviting a verified member!`)
                        .setTimestamp();
                    await channel.send({ embeds: [pub] });
                }
            }
            catch {
                /* ignore */
            }
        }
    }
}
exports.InviteRewardService = InviteRewardService;
