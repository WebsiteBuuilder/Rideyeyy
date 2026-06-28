import { InviteConfig, InviteMilestone, InviteStatus, InviteFakeReason, InviteRewardType, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../../lib/prisma';
import { adjustBalance, adjustBalanceTx } from '../../lib/wallet';
import { config as appConfig } from '../../config';
import { InviteStatisticsService } from './InviteStatisticsService';
import { InviteLoggingService } from './InviteLoggingService';

// ═══════════════════════════════════════════════════════════════════════════
//  InviteAdminService — configuration CRUD, milestones, resets, and manual
//  overrides used by the /admin economy panel.
// ═══════════════════════════════════════════════════════════════════════════

export class InviteAdminService {
  constructor(
    private readonly stats: InviteStatisticsService,
    private readonly logging: InviteLoggingService
  ) {}

  // ── Config ────────────────────────────────────────────────────────────────

  async ensureConfig(guildId: string): Promise<InviteConfig> {
    return prisma.inviteConfig.upsert({
      where: { guildId },
      create: {
        guildId,
        rewardAmount: appConfig.invite.defaultReward,
        verificationDelaySec: appConfig.invite.defaultVerifyDelaySec,
        minAccountAgeDays: appConfig.invite.defaultMinAccountAgeDays,
      },
      update: {
        rewardAmount: appConfig.invite.defaultReward,
      },
    });
  }

  async ensureMilestones(guildId: string): Promise<void> {
    // Upsert the default ladder by threshold so the configured reward set (RC,
    // role, ride code, tickets) is present. Admins can edit via /admin economy.
    for (const m of appConfig.invite.defaultMilestones) {
      await prisma.inviteMilestone.upsert({
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

  async getConfig(guildId: string): Promise<InviteConfig> {
    return this.ensureConfig(guildId);
  }

  async updateConfig(
    guildId: string,
    data: Prisma.InviteConfigUncheckedUpdateInput
  ): Promise<InviteConfig> {
    await this.ensureConfig(guildId);
    return prisma.inviteConfig.update({ where: { guildId }, data });
  }

  // ── Milestones ──────────────────────────────────────────────────────────--

  async listMilestones(guildId: string): Promise<InviteMilestone[]> {
    return prisma.inviteMilestone.findMany({ where: { guildId }, orderBy: { threshold: 'asc' } });
  }

  async addMilestone(
    guildId: string,
    threshold: number,
    rewardAmount: number,
    rewardRoleId: string | null,
    label: string | null,
    rewardRideKey: string | null = null,
    rewardTickets = 0
  ): Promise<InviteMilestone> {
    return prisma.inviteMilestone.upsert({
      where: { guildId_threshold: { guildId, threshold } },
      create: { guildId, threshold, rewardAmount, rewardRoleId, rewardRideKey, rewardTickets, label },
      update: { rewardAmount, rewardRoleId, rewardRideKey, rewardTickets, label, enabled: true },
    });
  }

  async removeMilestone(guildId: string, threshold: number): Promise<boolean> {
    const res = await prisma.inviteMilestone.deleteMany({ where: { guildId, threshold } });
    return res.count > 0;
  }

  // ── Resets ────────────────────────────────────────────────────────────────

  async resetUser(guildId: string, userId: string, performedBy: string): Promise<void> {
    await prisma.$transaction([
      prisma.inviteJoin.deleteMany({ where: { guildId, inviterUserId: userId } }),
      prisma.inviteReward.deleteMany({ where: { guildId, inviterUserId: userId } }),
      prisma.inviteMilestoneAward.deleteMany({ where: { guildId, userId } }),
      prisma.inviteUserStats.deleteMany({ where: { guildId, userId } }),
    ]);
    await this.recordReset(guildId, 'USER', performedBy, `Reset all invite data for ${userId}`);
  }

  async resetGuild(guildId: string, performedBy: string): Promise<void> {
    await prisma.$transaction([
      prisma.inviteJoin.deleteMany({ where: { guildId } }),
      prisma.inviteReward.deleteMany({ where: { guildId } }),
      prisma.inviteMilestoneAward.deleteMany({ where: { guildId } }),
      prisma.inviteUserStats.deleteMany({ where: { guildId } }),
    ]);
    await this.recordReset(guildId, 'GUILD', performedBy, 'Reset all invite tracking data');
  }

  async resetWeekly(guildId: string, performedBy: string): Promise<void> {
    await prisma.inviteUserStats.updateMany({ where: { guildId }, data: { weeklyCount: 0 } });
    await this.recordReset(guildId, 'WEEKLY', performedBy, 'Reset weekly counters');
  }

  async resetMonthly(guildId: string, performedBy: string): Promise<void> {
    await prisma.inviteUserStats.updateMany({ where: { guildId }, data: { monthlyCount: 0 } });
    await this.recordReset(guildId, 'MONTHLY', performedBy, 'Reset monthly counters');
  }

  async resetLeaderboard(guildId: string, performedBy: string): Promise<void> {
    await prisma.inviteUserStats.deleteMany({ where: { guildId } });
    await this.recordReset(guildId, 'LEADERBOARD', performedBy, 'Cleared aggregate leaderboard (recomputes lazily)');
  }

  async resetRewards(guildId: string, performedBy: string): Promise<void> {
    await prisma.inviteReward.deleteMany({ where: { guildId } });
    await this.recordReset(guildId, 'REWARDS', performedBy, 'Cleared reward audit history');
  }

  // ── Manual overrides ───────────────────────────────────────────────────---

  async markFake(guildId: string, joinId: string, reason: InviteFakeReason): Promise<boolean> {
    const join = await prisma.inviteJoin.findUnique({ where: { id: joinId } });
    if (!join || join.guildId !== guildId) return false;
    await prisma.inviteJoin.update({
      where: { id: joinId },
      data: { status: InviteStatus.FAKE, fakeReason: reason },
    });
    if (join.inviterUserId) await this.stats.recomputeUserStats(guildId, join.inviterUserId);
    await this.logging.log({ guildId, event: 'MANUAL_MARK_FAKE', joinId, targetUserId: join.invitedUserId, detail: reason });
    return true;
  }

  /** Set a join back to PENDING so the next sweep re-verifies it. */
  async reverify(guildId: string, joinId: string): Promise<boolean> {
    const join = await prisma.inviteJoin.findUnique({ where: { id: joinId } });
    if (!join || join.guildId !== guildId) return false;
    await prisma.inviteJoin.update({
      where: { id: joinId },
      data: { status: InviteStatus.PENDING, verifyAt: new Date(), verifiedAt: null, rewarded: false, fakeReason: null },
    });
    if (join.inviterUserId) await this.stats.recomputeUserStats(guildId, join.inviterUserId);
    await this.logging.log({ guildId, event: 'MANUAL_REVERIFY', joinId, targetUserId: join.invitedUserId });
    return true;
  }

  /** Remove a paid reward for a join and claw back the RouteCash atomically. */
  async removeReward(guildId: string, joinId: string): Promise<boolean> {
    const join = await prisma.inviteJoin.findUnique({ where: { id: joinId } });
    if (!join || join.guildId !== guildId || !join.rewarded || !join.inviterUserId) return false;
    const amount = join.rewardAmount ?? 0;

    await prisma.$transaction(async (tx) => {
      if (amount > 0) {
        await adjustBalance(
          tx,
          join.inviterUserId as string,
          new Decimal(-amount),
          'invite_reward_revoked',
          `Revoked invite reward for ${join.invitedUserId}`
        );
      }
      await tx.inviteReward.deleteMany({ where: { joinId } });
      await tx.inviteJoin.update({
        where: { id: joinId },
        data: { status: InviteStatus.VERIFIED, rewarded: false, rewardAmount: null },
      });
    });

    await this.stats.recomputeUserStats(guildId, join.inviterUserId);
    await this.logging.log({ guildId, event: 'MANUAL_REMOVE_REWARD', joinId, actorId: join.inviterUserId, detail: `-${amount}` });
    return true;
  }

  /** Manually grant RouteCash to an inviter and record it as a MANUAL reward. */
  async giveManual(guildId: string, inviterUserId: string, amount: number, performedBy: string): Promise<void> {
    await adjustBalanceTx(inviterUserId, new Decimal(amount), 'invite_manual', `Manual invite grant by ${performedBy}`);
    await prisma.inviteReward.create({
      data: {
        guildId,
        inviterUserId,
        amount: new Prisma.Decimal(amount),
        type: InviteRewardType.MANUAL,
        reason: `Manual grant by ${performedBy}`,
      },
    });
    await this.stats.recomputeUserStats(guildId, inviterUserId);
    await this.logging.log({ guildId, event: 'MANUAL_GRANT', actorId: inviterUserId, detail: `+${amount} by ${performedBy}` });
  }

  /** Recompute every inviter's aggregate from source rows. */
  async recalculateAll(guildId: string): Promise<number> {
    const inviters = await prisma.inviteJoin.findMany({
      where: { guildId, inviterUserId: { not: null } },
      distinct: ['inviterUserId'],
      select: { inviterUserId: true },
    });
    let count = 0;
    for (const row of inviters) {
      if (!row.inviterUserId) continue;
      await this.stats.recomputeUserStats(guildId, row.inviterUserId);
      count++;
    }
    await this.logging.log({ guildId, event: 'RECALCULATE', detail: `Recomputed ${count} inviters` });
    return count;
  }

  private async recordReset(guildId: string, type: string, performedBy: string, detail: string): Promise<void> {
    await prisma.inviteResetHistory.create({ data: { guildId, type, performedBy, detail } });
    await this.logging.log({ guildId, event: `RESET_${type}`, actorId: performedBy, detail });
  }
}
