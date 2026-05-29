import cron from 'node-cron';
import type { Client } from 'discord.js';
import { config } from '../config';
import type { Pool } from 'pg';
import type { LoggerService } from '../services/LoggerService';
import type { UserService } from '../services/UserService';

export function startCosmeticRoleExpiryJob(
  client: Client,
  pool: Pool,
  user: UserService,
  logger: LoggerService
): cron.ScheduledTask {
  return cron.schedule(config.cosmeticRoles.cronSchedule, async () => {
    try {
      const expired = await pool.query<{
        id: string;
        user_id: string;
        role_id: string;
      }>(
        `SELECT id, user_id, role_id FROM role_grants
         WHERE consumed_at IS NULL AND expires_at <= NOW()
         LIMIT 100`
      );

      for (const row of expired.rows) {
        try {
          await user.removeRole(client, config.discord.guildId, row.user_id, row.role_id);
          await pool.query(
            'UPDATE role_grants SET consumed_at = NOW() WHERE id = $1',
            [row.id]
          );
        } catch (err) {
          logger.warn('Cosmetic role expiry failed for grant', {
            userId: row.user_id,
            commandName: 'cosmeticRoleExpiry',
          });
        }
      }

      if (expired.rowCount && expired.rowCount > 0) {
        logger.info('Cosmetic role expiry processed', {
          commandName: 'cosmeticRoleExpiry',
        });
      }
    } catch (err) {
      logger.error('Cosmetic role expiry job failed', { commandName: 'cosmeticRoleExpiry' });
    }
  });
}
