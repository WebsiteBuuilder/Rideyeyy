import { Guild, GuildMember } from 'discord.js';
import { config } from '../../config';

export async function isStaff(member: GuildMember | null, guild: Guild | null): Promise<boolean> {
  if (!member || !guild) return false;
  if (member.id === guild.ownerId) return true;
  if (config.roles.staff && member.roles.has(config.roles.staff)) return true;
  if (config.roles.admin && member.roles.has(config.roles.admin)) return true;
  return false;
}

export async function isAdmin(member: GuildMember | null, guild: Guild | null): Promise<boolean> {
  if (!member || !guild) return false;
  if (member.id === guild.ownerId) return true;
  if (config.roles.admin && member.roles.has(config.roles.admin)) return true;
  return false;
}
