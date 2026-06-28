import { Client } from 'discord.js';
import { prisma } from '../../lib/prisma';
import { config } from '../../config';
import { lastLotteryDrawUtc } from '../../utils/lotterySchedule';
import { LotteryService } from './LotteryService';
import type { InviteService } from '../invite/InviteService';

// ═══════════════════════════════════════════════════════════════════════════
//  SchedulerService — restart-safe in-process cron. A single interval checks,
//  per guild, whether the weekly lottery draw / weekly + monthly resets are due,
//  using ScheduleState rows so a Railway restart never double-runs a period.
// ═══════════════════════════════════════════════════════════════════════════

const DRAW_KEY = 'lottery_draw';
const MONTHLY_KEY = 'monthly_reset';

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly lottery: LotteryService,
    private readonly invite: InviteService,
    private readonly onAfterDraw?: (client: Client, guildId: string) => Promise<void>
  ) {}

  start(client: Client): void {
    const interval = config.economy.lottery.schedulerIntervalMs;
    this.timer = setInterval(() => void this.tick(client), interval);
    void this.tick(client);
    console.log(`[Scheduler] Started (every ${Math.round(interval / 1000)}s).`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(client: Client): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = new Date();
      for (const guild of client.guilds.cache.values()) {
        await this.maybeWeeklyDraw(client, guild.id, now).catch((e) => console.error('[Scheduler] weekly draw error:', e));
        await this.maybeMonthlyReset(guild.id, now).catch((e) => console.error('[Scheduler] monthly reset error:', e));
      }
    } finally {
      this.ticking = false;
    }
  }

  private async maybeWeeklyDraw(client: Client, guildId: string, now: Date): Promise<void> {
    const cfg = await this.invite.admin.getConfig(guildId);
    if (!cfg.lotteryEnabled) return;

    const occurrence = lastLotteryDrawUtc(config.economy.lottery.drawDayOfWeek, config.economy.lottery.drawHourUtc, now);
    const state = await this.getState(guildId, DRAW_KEY);
    if (state.lastRunAt && state.lastRunAt >= occurrence) return; // already drawn this period

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    await this.lottery.drawWeekly(client, guild, cfg);
    if (this.onAfterDraw) {
      await this.onAfterDraw(client, guildId).catch((e) => console.error('[Scheduler] lottery panel refresh error:', e));
    }
    if (cfg.weeklyResetEnabled) {
      await this.invite.admin.resetWeekly(guildId, 'scheduler');
    }
    await this.setState(guildId, DRAW_KEY, now);
  }

  private async maybeMonthlyReset(guildId: string, now: Date): Promise<void> {
    const cfg = await this.invite.admin.getConfig(guildId);
    if (!cfg.monthlyResetEnabled) return;

    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    const state = await this.getState(guildId, MONTHLY_KEY);
    if (state.lastRunAt && state.lastRunAt >= monthStart) return;

    await this.invite.admin.resetMonthly(guildId, 'scheduler');
    await this.setState(guildId, MONTHLY_KEY, now);
  }

  private async getState(guildId: string, key: string): Promise<{ lastRunAt: Date | null }> {
    const row = await prisma.scheduleState.findUnique({ where: { guildId_key: { guildId, key } } });
    return { lastRunAt: row?.lastRunAt ?? null };
  }

  private async setState(guildId: string, key: string, when: Date): Promise<void> {
    await prisma.scheduleState.upsert({
      where: { guildId_key: { guildId, key } },
      create: { guildId, key, lastRunAt: when },
      update: { lastRunAt: when },
    });
  }
}
