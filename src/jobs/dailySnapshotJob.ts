import cron from 'node-cron';
import { config } from '../config';
import type { BackupService } from '../services/BackupService';
import type { LoggerService } from '../services/LoggerService';

export function startDailySnapshotJob(
  backup: BackupService,
  logger: LoggerService
): cron.ScheduledTask {
  return cron.schedule(config.cron.snapshot, async () => {
    try {
      const id = await backup.takeEconomySnapshot({ triggeredBy: 'scheduled_job' });
      logger.info('Daily snapshot completed', { transactionId: id });
    } catch (err) {
      logger.error('Daily snapshot failed', { commandName: 'dailySnapshotJob' });
    }
  });
}
