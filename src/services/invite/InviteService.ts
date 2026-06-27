import { Client, Guild, GuildMember, Invite, PartialGuildMember } from 'discord.js';
import { InviteStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { config as appConfig } from '../../config';
import { InviteCacheService } from './InviteCacheService';
import { InviteLoggingService } from './InviteLoggingService';
import { InviteVerificationService } from './InviteVerificationService';
import { InviteStatisticsService } from './InviteStatisticsService';
import { InviteLeaderboardService } from './InviteLeaderboardService';
import { InviteMilestoneService } from './InviteMilestoneService';
import { InviteRewardService } from './InviteRewardService';
import { InviteAdminService } from './InviteAdminService';
import type { RedemptionService } from '../economy/RedemptionService';
import type { LotteryService } from '../economy/LotteryService';
import type { ActivityService } from '../economy/ActivityService';

// ═══════════════════════════════════════════════════════════════════════════
//  InviteService — facade that owns the invite sub-services and is the single
//  entry point used by Discord events, the verification sweep, and commands.
// ═══════════════════════════════════════════════════════════════════════════

export interface InviteEconomyDeps {
  redemption: RedemptionService;
  lottery: LotteryService;
  activity: ActivityService;
}

export class InviteService {
  readonly cache = new InviteCacheService();
  readonly logging = new InviteLoggingService();
  readonly stats = new InviteStatisticsService();
  readonly leaderboard = new InviteLeaderboardService();
  readonly admin = new InviteAdminService(this.stats, this.logging);

  readonly verification: InviteVerificationService;
  readonly milestones: InviteMilestoneService;
  readonly reward: InviteRewardService;

  private sweepTimer: NodeJS.Timeout | null = null;
  private sweeping = false;
  private readonly guildLocks = new Map<string, Promise<void>>();

  constructor(private readonly econ: InviteEconomyDeps) {
    this.verification = new InviteVerificationService(econ.activity);
    this.milestones = new InviteMilestoneService(this.logging, this.stats, econ.redemption, econ.lottery);
    this.reward = new InviteRewardService(this.logging, this.stats, this.milestones, econ.lottery);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────---

  async init(client: Client): Promise<void> {
    for (const guild of client.guilds.cache.values()) {
      await this.seedGuild(guild);
    }
    await this.cache.primeAll(client);

    this.sweepTimer = setInterval(() => {
      void this.runSweep(client);
    }, appConfig.invite.sweepIntervalMs);
    // Kick off an immediate sweep so restarts catch up on overdue joins.
    void this.runSweep(client);

    console.log(`[Invite] System ready (sweep every ${Math.round(appConfig.invite.sweepIntervalMs / 1000)}s).`);
  }

  async seedGuild(guild: Guild): Promise<void> {
    await this.admin.ensureConfig(guild.id);
    await this.admin.ensureMilestones(guild.id);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  async handleMemberAdd(member: GuildMember): Promise<void> {
    const guild = member.guild;
    const guildId = guild.id;
    const cfg = await this.admin.ensureConfig(guildId);
    const sink = { client: guild.client, channelId: cfg.loggingChannelId };

    await this.withGuildLock(guildId, async () => {
      const resolved = await this.cache.resolveOnJoin(guild);
      const inviterId = resolved?.inviterId ?? null;
      const check = await this.verification.immediateCheck(member, inviterId, cfg);
      const verifyAt = new Date(Date.now() + cfg.verificationDelaySec * 1000);

      const join = await prisma.inviteJoin.create({
        data: {
          guildId,
          invitedUserId: member.id,
          inviterUserId: inviterId,
          inviteCode: resolved?.code ?? null,
          accountCreatedAt: new Date(member.user.createdTimestamp),
          verifyAt,
          status: check.ok ? InviteStatus.PENDING : InviteStatus.FAKE,
          fakeReason: check.ok ? null : check.reason,
        },
      });

      if (inviterId) await this.stats.recomputeUserStats(guildId, inviterId);

      await this.logging.log(
        {
          guildId,
          event: check.ok ? 'JOIN_TRACKED' : 'JOIN_FAKE',
          actorId: inviterId,
          targetUserId: member.id,
          inviteCode: resolved?.code ?? null,
          joinId: join.id,
          detail: check.ok
            ? `Pending verification (${cfg.verificationDelaySec}s)`
            : `Flagged: ${check.reason}`,
        },
        sink
      );
    });
  }

  async handleMemberRemove(member: GuildMember | PartialGuildMember): Promise<void> {
    const guild = member.guild;
    if (!guild) return;
    const guildId = guild.id;

    const join = await prisma.inviteJoin.findFirst({
      where: { guildId, invitedUserId: member.id, status: InviteStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });
    if (!join) return;

    await prisma.inviteJoin.update({
      where: { id: join.id },
      data: { status: InviteStatus.FAKE, fakeReason: 'LEFT_EARLY', leftAt: new Date() },
    });
    if (join.inviterUserId) await this.stats.recomputeUserStats(guildId, join.inviterUserId);

    const cfg = await this.admin.ensureConfig(guildId);
    await this.logging.log(
      {
        guildId,
        event: 'JOIN_FAKE',
        actorId: join.inviterUserId,
        targetUserId: member.id,
        joinId: join.id,
        detail: 'Left before verification (LEFT_EARLY)',
      },
      { client: guild.client, channelId: cfg.loggingChannelId }
    );
  }

  handleInviteCreate(invite: Invite): void {
    this.cache.onCreate(invite);
  }

  handleInviteDelete(invite: Invite): void {
    this.cache.onDelete(invite);
  }

  async handleGuildCreate(guild: Guild): Promise<void> {
    await this.seedGuild(guild);
    await this.cache.prime(guild);
  }

  handleGuildDelete(guild: Guild): void {
    this.cache.clear(guild.id);
  }

  // ── Verification sweep ─────────────────────────────────────────────────---

  async runSweep(client: Client): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const due = await prisma.inviteJoin.findMany({
        where: { status: InviteStatus.PENDING, verifyAt: { lte: new Date() } },
        orderBy: { verifyAt: 'asc' },
        take: 50,
      });

      for (const join of due) {
        const guild =
          client.guilds.cache.get(join.guildId) ??
          (await client.guilds.fetch(join.guildId).catch(() => null));
        if (!guild) continue;

        const cfg = await this.admin.ensureConfig(join.guildId);
        const check = await this.verification.finalCheck(guild, join.invitedUserId, join.accountCreatedAt, cfg);

        // Not yet eligible (e.g. under the minimum message count) but still a
        // valid member: defer re-verification until they engage, up to a cap.
        if (!check.ok && check.defer) {
          const attempts = join.verifyAttempts + 1;
          if (attempts >= cfg.maxVerifyAttempts) {
            await prisma.inviteJoin.update({
              where: { id: join.id },
              data: { status: InviteStatus.FAKE, fakeReason: 'RATE_LIMIT', verifyAttempts: attempts },
            });
            if (join.inviterUserId) await this.stats.recomputeUserStats(join.guildId, join.inviterUserId);
            await this.logging.log(
              { guildId: join.guildId, event: 'JOIN_FAKE', actorId: join.inviterUserId, targetUserId: join.invitedUserId, joinId: join.id, detail: 'Never met minimum activity (RATE_LIMIT)' },
              { client, channelId: cfg.loggingChannelId }
            );
          } else {
            await prisma.inviteJoin.update({
              where: { id: join.id },
              data: { verifyAttempts: attempts, verifyAt: new Date(Date.now() + cfg.verificationDelaySec * 1000) },
            });
          }
          continue;
        }

        if (!check.ok) {
          await prisma.inviteJoin.update({
            where: { id: join.id },
            data: {
              status: InviteStatus.FAKE,
              fakeReason: check.reason,
              leftAt: check.reason === 'LEFT_EARLY' ? new Date() : join.leftAt,
            },
          });
          if (join.inviterUserId) await this.stats.recomputeUserStats(join.guildId, join.inviterUserId);
          await this.logging.log(
            { guildId: join.guildId, event: 'JOIN_FAKE', actorId: join.inviterUserId, targetUserId: join.invitedUserId, joinId: join.id, detail: `Verification failed: ${check.reason}` },
            { client, channelId: cfg.loggingChannelId }
          );
          continue;
        }

        await this.reward.rewardJoin(client, guild, join, cfg);
      }
    } catch (err) {
      console.error('[Invite] Sweep error:', err);
    } finally {
      this.sweeping = false;
    }
  }

  /** Re-prime the invite cache for a guild (used by the admin "reset cache"). */
  async resetCache(guild: Guild): Promise<void> {
    this.cache.clear(guild.id);
    await this.cache.prime(guild);
  }

  // ── Internal: per-guild serialization to avoid double attribution ─────────--

  private async withGuildLock(guildId: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.guildLocks.get(guildId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.guildLocks.set(
      guildId,
      run.then(
        () => undefined,
        () => undefined
      )
    );
    return run;
  }
}
