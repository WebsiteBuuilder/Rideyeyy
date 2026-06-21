import {
  ChannelType,
  Client,
  OverwriteResolvable,
  PermissionFlagsBits,
  TextChannel,
} from 'discord.js';
import type { RideRequest } from '../../types/ride';
import { rideConfig } from '../../config';

export class ChannelService {
  async createRideChannel(
    client: Client,
    guildId: string,
    ride: RideRequest,
    username: string,
  ): Promise<TextChannel | null> {
    try {
      const guild = await client.guilds.fetch(guildId);
      const channelName = `ride-${username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${ride.rideId.toLowerCase().replace('-', '')}`;

      // Find or create RIDES category
      let category = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && c.name.toUpperCase() === 'RIDES',
      );
      if (!category) {
        category = await guild.channels.create({
          name: 'RIDES',
          type: ChannelType.GuildCategory,
        });
      }

      const overwrites: OverwriteResolvable[] = [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: ride.customerId,      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ];

      if (rideConfig.roles.provider !== '0') {
        overwrites.push({ id: rideConfig.roles.provider, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
      }
      if (rideConfig.roles.management !== '0') {
        overwrites.push({ id: rideConfig.roles.management, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
      }
      if (rideConfig.roles.admin !== '0') {
        overwrites.push({ id: rideConfig.roles.admin, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
      }

      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: overwrites,
      });

      return channel;
    } catch (err) {
      console.error('[ChannelService] Failed to create ride channel:', err);
      return null;
    }
  }

  async archiveChannel(client: Client, channelId: string, delayMs: number): Promise<void> {
    setTimeout(async () => {
      try {
        const channel = await client.channels.fetch(channelId);
        if (channel instanceof TextChannel) {
          await channel.send('```This ride channel has been archived.```');
          await channel.permissionOverwrites.set([
            { id: channel.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
          ]);
        }
      } catch {
        // ignore
      }
    }, delayMs);
  }
}

export const channelService = new ChannelService();
