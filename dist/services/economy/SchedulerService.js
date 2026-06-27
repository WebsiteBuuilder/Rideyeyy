"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerService = void 0;
const prisma_1 = require("../../lib/prisma");
const config_1 = require("../../config");
// ═══════════════════════════════════════════════════════════════════════════
//  SchedulerService — restart-safe in-process cron. A single interval checks,
//  per guild, whether the weekly lottery draw / weekly + monthly resets are due,
//  using ScheduleState rows so a Railway restart never double-runs a period.
// ═══════════════════════════════════════════════════════════════════════════
const DRAW_KEY = 'lottery_draw';
const MONTHLY_KEY = 'monthly_reset';
class SchedulerService {
    constructor(lottery, invite) {
        this.lottery = lottery;
        this.invite = invite;
        this.timer = null;
        this.ticking = false;
    }
    start(client) {
        const interval = config_1.config.economy.lottery.schedulerIntervalMs;
        this.timer = setInterval(() => void this.tick(client), interval);
        void this.tick(client);
        console.log(`[Scheduler] Started (every ${Math.round(interval / 1000)}s).`);
    }
    stop() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = null;
    }
    async tick(client) {
        if (this.ticking)
            return;
        this.ticking = true;
        try {
            const now = new Date();
            for (const guild of client.guilds.cache.values()) {
                await this.maybeWeeklyDraw(client, guild.id, now).catch((e) => console.error('[Scheduler] weekly draw error:', e));
                await this.maybeMonthlyReset(guild.id, now).catch((e) => console.error('[Scheduler] monthly reset error:', e));
            }
        }
        finally {
            this.ticking = false;
        }
    }
    async maybeWeeklyDraw(client, guildId, now) {
        const cfg = await this.invite.admin.getConfig(guildId);
        if (!cfg.lotteryEnabled)
            return;
        const occurrence = lastOccurrence(config_1.config.economy.lottery.drawDayOfWeek, config_1.config.economy.lottery.drawHourUtc, now);
        const state = await this.getState(guildId, DRAW_KEY);
        if (state.lastRunAt && state.lastRunAt >= occurrence)
            return; // already drawn this period
        const guild = client.guilds.cache.get(guildId);
        if (!guild)
            return;
        await this.lottery.drawWeekly(client, guild, cfg);
        if (cfg.weeklyResetEnabled) {
            await this.invite.admin.resetWeekly(guildId, 'scheduler');
        }
        await this.setState(guildId, DRAW_KEY, now);
    }
    async maybeMonthlyReset(guildId, now) {
        const cfg = await this.invite.admin.getConfig(guildId);
        if (!cfg.monthlyResetEnabled)
            return;
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
        const state = await this.getState(guildId, MONTHLY_KEY);
        if (state.lastRunAt && state.lastRunAt >= monthStart)
            return;
        await this.invite.admin.resetMonthly(guildId, 'scheduler');
        await this.setState(guildId, MONTHLY_KEY, now);
    }
    async getState(guildId, key) {
        const row = await prisma_1.prisma.scheduleState.findUnique({ where: { guildId_key: { guildId, key } } });
        return { lastRunAt: row?.lastRunAt ?? null };
    }
    async setState(guildId, key, when) {
        await prisma_1.prisma.scheduleState.upsert({
            where: { guildId_key: { guildId, key } },
            create: { guildId, key, lastRunAt: when },
            update: { lastRunAt: when },
        });
    }
}
exports.SchedulerService = SchedulerService;
/** Most recent occurrence of (dayOfWeek, hourUtc) at or before `now` (UTC). */
function lastOccurrence(dayOfWeek, hourUtc, now) {
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0));
    // Walk back day by day until we hit the target weekday at/before now.
    for (let i = 0; i < 8; i++) {
        const d = new Date(candidate.getTime() - i * 24 * 60 * 60 * 1000);
        if (d.getUTCDay() === dayOfWeek && d.getTime() <= now.getTime()) {
            return d;
        }
    }
    // Fallback: a week ago (should not happen).
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}
