import { Client, Events, GuildMember } from 'discord.js';
import type { AppServices } from '../types';
import { config } from '../config';

export function registerGuildMemberAdd(client: Client, services: AppServices): void {
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    if (member.guild.id !== config.discord.guildId) return;

    try {
      // Detect which invite was used *before* syncing — detectInviteUsed compares
      // against the stale in-memory cache, so syncing first would wipe that snapshot.
      const detected = await services.invite.detectInviteUsed(member.guild);
      await services.invite.syncGuildInvites(member.guild);

      if (detected) {
        await services.invite.trackPendingInvite(member.id, detected.inviterId, detected.code);
        services.logger.info('Invite tracked', {
          userId: member.id,
          commandName: 'guildMemberAdd',
        });
      } else {
        services.logger.warn('Could not detect invite for new member', { userId: member.id });
      }
    } catch (err) {
      services.logger.error('guildMemberAdd handler failed', {
        userId: member.id,
        commandName: 'guildMemberAdd',
      });
    }
  });
}
