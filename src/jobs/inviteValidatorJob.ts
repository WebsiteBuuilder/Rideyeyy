import cron from 'node-cron';
import { Client } from 'discord.js';
import { config } from '../config';
import type { InviteService } from '../services/InviteService';
import type { LoggerService } from '../services/LoggerService';

export function startInviteValidatorJob(
  client: Client,
  invite: InviteService,
  logger: LoggerService
): cron.ScheduledTask {
  return cron.schedule(config.cron.inviteValidator, async () => {
    try {
      const guild = await client.guilds.fetch(config.discord.guildId);
      await invite.validatePendingInvites(guild);
      logger.debug('Invite validation job completed');
    } catch (err) {
      logger.error('Invite validation job failed', { commandName: 'inviteValidatorJob' });
    }
  });
}
