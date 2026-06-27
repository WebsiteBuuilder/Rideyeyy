"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InviteService = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
const config_1 = require("../../config");
const InviteCacheService_1 = require("./InviteCacheService");
const InviteLoggingService_1 = require("./InviteLoggingService");
const InviteVerificationService_1 = require("./InviteVerificationService");
const InviteStatisticsService_1 = require("./InviteStatisticsService");
const InviteLeaderboardService_1 = require("./InviteLeaderboardService");
const InviteMilestoneService_1 = require("./InviteMilestoneService");
const InviteRewardService_1 = require("./InviteRewardService");
const InviteAdminService_1 = require("./InviteAdminService");
class InviteService {
    constructor(econ) {
        this.econ = econ;
        this.cache = new InviteCacheService_1.InviteCacheService();
        this.logging = new InviteLoggingService_1.InviteLoggingService();
        this.stats = new InviteStatisticsService_1.InviteStatisticsService();
        this.leaderboard = new InviteLeaderboardService_1.InviteLeaderboardService();
        this.admin = new InviteAdminService_1.InviteAdminService(this.stats, this.logging);
        this.sweepTimer = null;
        this.sweeping = false;
        this.guildLocks = new Map();
        this.verification = new InviteVerificationService_1.InviteVerificationService(econ.activity);
        this.milestones = new InviteMilestoneService_1.InviteMilestoneService(this.logging, this.stats, econ.redemption, econ.lottery);
        this.reward = new InviteRewardService_1.InviteRewardService(this.logging, this.stats, this.milestones, econ.lottery);
    }
    // ── Lifecycle ──────────────────────────────────────────────────────────---
    async init(client) {
        for (const guild of client.guilds.cache.values()) {
            await this.seedGuild(guild);
        }
        await this.cache.primeAll(client);
        this.sweepTimer = setInterval(() => {
            void this.runSweep(client);
        }, config_1.config.invite.sweepIntervalMs);
        // Kick off an immediate sweep so restarts catch up on overdue joins.
        void this.runSweep(client);
        console.log(`[Invite] System ready (sweep every ${Math.round(config_1.config.invite.sweepIntervalMs / 1000)}s).`);
    }
    async seedGuild(guild) {
        await this.admin.ensureConfig(guild.id);
        await this.admin.ensureMilestones(guild.id);
    }
    // ── Events ────────────────────────────────────────────────────────────────
    async handleMemberAdd(member) {
        const guild = member.guild;
        const guildId = guild.id;
        const cfg = await this.admin.ensureConfig(guildId);
        const sink = { client: guild.client, channelId: cfg.loggingChannelId };
        await this.withGuildLock(guildId, async () => {
            const resolved = await this.cache.resolveOnJoin(guild);
            const inviterId = resolved?.inviterId ?? null;
            const check = await this.verification.immediateCheck(member, inviterId, cfg);
            const verifyAt = new Date(Date.now() + cfg.verificationDelaySec * 1000);
            const join = await prisma_1.prisma.inviteJoin.create({
                data: {
                    guildId,
                    invitedUserId: member.id,
                    inviterUserId: inviterId,
                    inviteCode: resolved?.code ?? null,
                    accountCreatedAt: new Date(member.user.createdTimestamp),
                    verifyAt,
                    status: check.ok ? client_1.InviteStatus.PENDING : client_1.InviteStatus.FAKE,
                    fakeReason: check.ok ? null : check.reason,
                },
            });
            if (inviterId)
                await this.stats.recomputeUserStats(guildId, inviterId);
            await this.logging.log({
                guildId,
                event: check.ok ? 'JOIN_TRACKED' : 'JOIN_FAKE',
                actorId: inviterId,
                targetUserId: member.id,
                inviteCode: resolved?.code ?? null,
                joinId: join.id,
                detail: check.ok
                    ? `Pending verification (${cfg.verificationDelaySec}s)`
                    : `Flagged: ${check.reason}`,
            }, sink);
        });
    }
    async handleMemberRemove(member) {
        const guild = member.guild;
        if (!guild)
            return;
        const guildId = guild.id;
        const join = await prisma_1.prisma.inviteJoin.findFirst({
            where: { guildId, invitedUserId: member.id, status: client_1.InviteStatus.PENDING },
            orderBy: { createdAt: 'desc' },
        });
        if (!join)
            return;
        await prisma_1.prisma.inviteJoin.update({
            where: { id: join.id },
            data: { status: client_1.InviteStatus.FAKE, fakeReason: 'LEFT_EARLY', leftAt: new Date() },
        });
        if (join.inviterUserId)
            await this.stats.recomputeUserStats(guildId, join.inviterUserId);
        const cfg = await this.admin.ensureConfig(guildId);
        await this.logging.log({
            guildId,
            event: 'JOIN_FAKE',
            actorId: join.inviterUserId,
            targetUserId: member.id,
            joinId: join.id,
            detail: 'Left before verification (LEFT_EARLY)',
        }, { client: guild.client, channelId: cfg.loggingChannelId });
    }
    handleInviteCreate(invite) {
        this.cache.onCreate(invite);
    }
    handleInviteDelete(invite) {
        this.cache.onDelete(invite);
    }
    async handleGuildCreate(guild) {
        await this.seedGuild(guild);
        await this.cache.prime(guild);
    }
    handleGuildDelete(guild) {
        this.cache.clear(guild.id);
    }
    // ── Verification sweep ─────────────────────────────────────────────────---
    async runSweep(client) {
        if (this.sweeping)
            return;
        this.sweeping = true;
        try {
            const due = await prisma_1.prisma.inviteJoin.findMany({
                where: { status: client_1.InviteStatus.PENDING, verifyAt: { lte: new Date() } },
                orderBy: { verifyAt: 'asc' },
                take: 50,
            });
            for (const join of due) {
                const guild = client.guilds.cache.get(join.guildId) ??
                    (await client.guilds.fetch(join.guildId).catch(() => null));
                if (!guild)
                    continue;
                const cfg = await this.admin.ensureConfig(join.guildId);
                const check = await this.verification.finalCheck(guild, join.invitedUserId, join.accountCreatedAt, cfg);
                // Not yet eligible (e.g. under the minimum message count) but still a
                // valid member: defer re-verification until they engage, up to a cap.
                if (!check.ok && check.defer) {
                    const attempts = join.verifyAttempts + 1;
                    if (attempts >= cfg.maxVerifyAttempts) {
                        await prisma_1.prisma.inviteJoin.update({
                            where: { id: join.id },
                            data: { status: client_1.InviteStatus.FAKE, fakeReason: 'RATE_LIMIT', verifyAttempts: attempts },
                        });
                        if (join.inviterUserId)
                            await this.stats.recomputeUserStats(join.guildId, join.inviterUserId);
                        await this.logging.log({ guildId: join.guildId, event: 'JOIN_FAKE', actorId: join.inviterUserId, targetUserId: join.invitedUserId, joinId: join.id, detail: 'Never met minimum activity (RATE_LIMIT)' }, { client, channelId: cfg.loggingChannelId });
                    }
                    else {
                        await prisma_1.prisma.inviteJoin.update({
                            where: { id: join.id },
                            data: { verifyAttempts: attempts, verifyAt: new Date(Date.now() + cfg.verificationDelaySec * 1000) },
                        });
                    }
                    continue;
                }
                if (!check.ok) {
                    await prisma_1.prisma.inviteJoin.update({
                        where: { id: join.id },
                        data: {
                            status: client_1.InviteStatus.FAKE,
                            fakeReason: check.reason,
                            leftAt: check.reason === 'LEFT_EARLY' ? new Date() : join.leftAt,
                        },
                    });
                    if (join.inviterUserId)
                        await this.stats.recomputeUserStats(join.guildId, join.inviterUserId);
                    await this.logging.log({ guildId: join.guildId, event: 'JOIN_FAKE', actorId: join.inviterUserId, targetUserId: join.invitedUserId, joinId: join.id, detail: `Verification failed: ${check.reason}` }, { client, channelId: cfg.loggingChannelId });
                    continue;
                }
                await this.reward.rewardJoin(client, guild, join, cfg);
            }
        }
        catch (err) {
            console.error('[Invite] Sweep error:', err);
        }
        finally {
            this.sweeping = false;
        }
    }
    /** Re-prime the invite cache for a guild (used by the admin "reset cache"). */
    async resetCache(guild) {
        this.cache.clear(guild.id);
        await this.cache.prime(guild);
    }
    // ── Internal: per-guild serialization to avoid double attribution ─────────--
    async withGuildLock(guildId, fn) {
        const prev = this.guildLocks.get(guildId) ?? Promise.resolve();
        const run = prev.then(fn, fn);
        this.guildLocks.set(guildId, run.then(() => undefined, () => undefined));
        return run;
    }
}
exports.InviteService = InviteService;
