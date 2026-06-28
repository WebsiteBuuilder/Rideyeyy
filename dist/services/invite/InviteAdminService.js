"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InviteAdminService = void 0;
const client_1 = require("@prisma/client");
const decimal_js_1 = __importDefault(require("decimal.js"));
const prisma_1 = require("../../lib/prisma");
const wallet_1 = require("../../lib/wallet");
const config_1 = require("../../config");
// ═══════════════════════════════════════════════════════════════════════════
//  InviteAdminService — configuration CRUD, milestones, resets, and manual
//  overrides used by the /admin economy panel.
// ═══════════════════════════════════════════════════════════════════════════
class InviteAdminService {
    constructor(stats, logging) {
        this.stats = stats;
        this.logging = logging;
    }
    // ── Config ────────────────────────────────────────────────────────────────
    async ensureConfig(guildId) {
        return prisma_1.prisma.inviteConfig.upsert({
            where: { guildId },
            create: {
                guildId,
                rewardAmount: config_1.config.invite.defaultReward,
                verificationDelaySec: config_1.config.invite.defaultVerifyDelaySec,
                minAccountAgeDays: config_1.config.invite.defaultMinAccountAgeDays,
            },
            update: {
                rewardAmount: config_1.config.invite.defaultReward,
            },
        });
    }
    async ensureMilestones(guildId) {
        // Upsert the default ladder by threshold so the configured reward set (RC,
        // role, ride code, tickets) is present. Admins can edit via /admin economy.
        for (const m of config_1.config.invite.defaultMilestones) {
            await prisma_1.prisma.inviteMilestone.upsert({
                where: { guildId_threshold: { guildId, threshold: m.threshold } },
                create: {
                    guildId,
                    threshold: m.threshold,
                    rewardAmount: m.rewardAmount,
                    rewardRoleId: m.rewardRoleId,
                    rewardRideKey: m.rewardRideKey,
                    rewardTickets: m.rewardTickets,
                    label: m.label,
                },
                update: {},
            });
        }
    }
    async getConfig(guildId) {
        return this.ensureConfig(guildId);
    }
    async updateConfig(guildId, data) {
        await this.ensureConfig(guildId);
        return prisma_1.prisma.inviteConfig.update({ where: { guildId }, data });
    }
    // ── Milestones ──────────────────────────────────────────────────────────--
    async listMilestones(guildId) {
        return prisma_1.prisma.inviteMilestone.findMany({ where: { guildId }, orderBy: { threshold: 'asc' } });
    }
    async addMilestone(guildId, threshold, rewardAmount, rewardRoleId, label, rewardRideKey = null, rewardTickets = 0) {
        return prisma_1.prisma.inviteMilestone.upsert({
            where: { guildId_threshold: { guildId, threshold } },
            create: { guildId, threshold, rewardAmount, rewardRoleId, rewardRideKey, rewardTickets, label },
            update: { rewardAmount, rewardRoleId, rewardRideKey, rewardTickets, label, enabled: true },
        });
    }
    async removeMilestone(guildId, threshold) {
        const res = await prisma_1.prisma.inviteMilestone.deleteMany({ where: { guildId, threshold } });
        return res.count > 0;
    }
    // ── Resets ────────────────────────────────────────────────────────────────
    async resetUser(guildId, userId, performedBy) {
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.inviteJoin.deleteMany({ where: { guildId, inviterUserId: userId } }),
            prisma_1.prisma.inviteReward.deleteMany({ where: { guildId, inviterUserId: userId } }),
            prisma_1.prisma.inviteMilestoneAward.deleteMany({ where: { guildId, userId } }),
            prisma_1.prisma.inviteUserStats.deleteMany({ where: { guildId, userId } }),
        ]);
        await this.recordReset(guildId, 'USER', performedBy, `Reset all invite data for ${userId}`);
    }
    async resetGuild(guildId, performedBy) {
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.inviteJoin.deleteMany({ where: { guildId } }),
            prisma_1.prisma.inviteReward.deleteMany({ where: { guildId } }),
            prisma_1.prisma.inviteMilestoneAward.deleteMany({ where: { guildId } }),
            prisma_1.prisma.inviteUserStats.deleteMany({ where: { guildId } }),
        ]);
        await this.recordReset(guildId, 'GUILD', performedBy, 'Reset all invite tracking data');
    }
    async resetWeekly(guildId, performedBy) {
        await prisma_1.prisma.inviteUserStats.updateMany({ where: { guildId }, data: { weeklyCount: 0 } });
        await this.recordReset(guildId, 'WEEKLY', performedBy, 'Reset weekly counters');
    }
    async resetMonthly(guildId, performedBy) {
        await prisma_1.prisma.inviteUserStats.updateMany({ where: { guildId }, data: { monthlyCount: 0 } });
        await this.recordReset(guildId, 'MONTHLY', performedBy, 'Reset monthly counters');
    }
    async resetLeaderboard(guildId, performedBy) {
        await prisma_1.prisma.inviteUserStats.deleteMany({ where: { guildId } });
        await this.recordReset(guildId, 'LEADERBOARD', performedBy, 'Cleared aggregate leaderboard (recomputes lazily)');
    }
    async resetRewards(guildId, performedBy) {
        await prisma_1.prisma.inviteReward.deleteMany({ where: { guildId } });
        await this.recordReset(guildId, 'REWARDS', performedBy, 'Cleared reward audit history');
    }
    // ── Manual overrides ───────────────────────────────────────────────────---
    async markFake(guildId, joinId, reason) {
        const join = await prisma_1.prisma.inviteJoin.findUnique({ where: { id: joinId } });
        if (!join || join.guildId !== guildId)
            return false;
        await prisma_1.prisma.inviteJoin.update({
            where: { id: joinId },
            data: { status: client_1.InviteStatus.FAKE, fakeReason: reason },
        });
        if (join.inviterUserId)
            await this.stats.recomputeUserStats(guildId, join.inviterUserId);
        await this.logging.log({ guildId, event: 'MANUAL_MARK_FAKE', joinId, targetUserId: join.invitedUserId, detail: reason });
        return true;
    }
    /** Set a join back to PENDING so the next sweep re-verifies it. */
    async reverify(guildId, joinId) {
        const join = await prisma_1.prisma.inviteJoin.findUnique({ where: { id: joinId } });
        if (!join || join.guildId !== guildId)
            return false;
        await prisma_1.prisma.inviteJoin.update({
            where: { id: joinId },
            data: { status: client_1.InviteStatus.PENDING, verifyAt: new Date(), verifiedAt: null, rewarded: false, fakeReason: null },
        });
        if (join.inviterUserId)
            await this.stats.recomputeUserStats(guildId, join.inviterUserId);
        await this.logging.log({ guildId, event: 'MANUAL_REVERIFY', joinId, targetUserId: join.invitedUserId });
        return true;
    }
    /** Remove a paid reward for a join and claw back the RouteCash atomically. */
    async removeReward(guildId, joinId) {
        const join = await prisma_1.prisma.inviteJoin.findUnique({ where: { id: joinId } });
        if (!join || join.guildId !== guildId || !join.rewarded || !join.inviterUserId)
            return false;
        const amount = join.rewardAmount ?? 0;
        await prisma_1.prisma.$transaction(async (tx) => {
            if (amount > 0) {
                await (0, wallet_1.adjustBalance)(tx, join.inviterUserId, new decimal_js_1.default(-amount), 'invite_reward_revoked', `Revoked invite reward for ${join.invitedUserId}`);
            }
            await tx.inviteReward.deleteMany({ where: { joinId } });
            await tx.inviteJoin.update({
                where: { id: joinId },
                data: { status: client_1.InviteStatus.VERIFIED, rewarded: false, rewardAmount: null },
            });
        });
        await this.stats.recomputeUserStats(guildId, join.inviterUserId);
        await this.logging.log({ guildId, event: 'MANUAL_REMOVE_REWARD', joinId, actorId: join.inviterUserId, detail: `-${amount}` });
        return true;
    }
    /** Manually grant RouteCash to an inviter and record it as a MANUAL reward. */
    async giveManual(guildId, inviterUserId, amount, performedBy) {
        await (0, wallet_1.adjustBalanceTx)(inviterUserId, new decimal_js_1.default(amount), 'invite_manual', `Manual invite grant by ${performedBy}`);
        await prisma_1.prisma.inviteReward.create({
            data: {
                guildId,
                inviterUserId,
                amount: new client_1.Prisma.Decimal(amount),
                type: client_1.InviteRewardType.MANUAL,
                reason: `Manual grant by ${performedBy}`,
            },
        });
        await this.stats.recomputeUserStats(guildId, inviterUserId);
        await this.logging.log({ guildId, event: 'MANUAL_GRANT', actorId: inviterUserId, detail: `+${amount} by ${performedBy}` });
    }
    /** Recompute every inviter's aggregate from source rows. */
    async recalculateAll(guildId) {
        const inviters = await prisma_1.prisma.inviteJoin.findMany({
            where: { guildId, inviterUserId: { not: null } },
            distinct: ['inviterUserId'],
            select: { inviterUserId: true },
        });
        let count = 0;
        for (const row of inviters) {
            if (!row.inviterUserId)
                continue;
            await this.stats.recomputeUserStats(guildId, row.inviterUserId);
            count++;
        }
        await this.logging.log({ guildId, event: 'RECALCULATE', detail: `Recomputed ${count} inviters` });
        return count;
    }
    async recordReset(guildId, type, performedBy, detail) {
        await prisma_1.prisma.inviteResetHistory.create({ data: { guildId, type, performedBy, detail } });
        await this.logging.log({ guildId, event: `RESET_${type}`, actorId: performedBy, detail });
    }
}
exports.InviteAdminService = InviteAdminService;
