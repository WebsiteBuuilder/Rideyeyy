import { GuildMember } from 'discord.js';
import { rideConfig } from '../../config';

export function isProvider(member: GuildMember): boolean {
  return (
    member.roles.cache.has(rideConfig.roles.provider) ||
    member.roles.cache.has(rideConfig.roles.management) ||
    member.roles.cache.has(rideConfig.roles.admin)
  );
}

export function isManagement(member: GuildMember): boolean {
  return (
    member.roles.cache.has(rideConfig.roles.management) ||
    member.roles.cache.has(rideConfig.roles.admin)
  );
}

export function isAdmin(member: GuildMember): boolean {
  return member.roles.cache.has(rideConfig.roles.admin);
}

export function isStaff(member: GuildMember): boolean {
  return isManagement(member);
}
