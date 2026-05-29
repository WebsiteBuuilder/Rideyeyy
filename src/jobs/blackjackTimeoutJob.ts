import cron from 'node-cron';
import type { GamblingService } from '../services/GamblingService';
import type { LoggerService } from '../services/LoggerService';

export function startBlackjackTimeoutJob(
  gambling: GamblingService,
  logger: LoggerService
): cron.ScheduledTask {
  return cron.schedule('* * * * *', async () => {
    try {
      const count = await gambling.timeoutStaleGames();
      if (count > 0) {
        logger.info(`Blackjack timeout: auto-stood ${count} game(s)`);
      }
    } catch {
      logger.error('Blackjack timeout job failed', { commandName: 'blackjackTimeoutJob' });
    }
  });
}
