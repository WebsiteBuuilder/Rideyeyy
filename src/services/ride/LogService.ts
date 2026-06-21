import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { rideConfig } from '../../config';

type LogEvent =
  | 'CREATED'
  | 'CLAIMED'
  | 'EN_ROUTE'
  | 'PICKED_UP'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RATED'
  | 'BLACKLISTED'
  | 'UNBLACKLISTED';

const LOG_COLORS: Record<LogEvent, number> = {
  CREATED:       0x5865f2,
  CLAIMED:       0xfee75c,
  EN_ROUTE:      0xf79454,
  PICKED_UP:     0x57f287,
  COMPLETED:     0x2ecc71,
  CANCELLED:     0xed4245,
  RATED:         0xffd700,
  BLACKLISTED:   0xff0000,
  UNBLACKLISTED: 0x00ff00,
};

export class LogService {
  async log(
    client: Client,
    event: LogEvent,
    fields: { name: string; value: string; inline?: boolean }[],
  ): Promise<void> {
    try {
      const channelId = rideConfig.channels.logs;
      if (!channelId) return;
      const channel = await client.channels.fetch(channelId);
      if (!channel || !(channel instanceof TextChannel)) return;
      const embed = new EmbedBuilder()
        .setTitle(`LOG — ${event.replace(/_/g, ' ')}`)
        .setColor(LOG_COLORS[event])
        .addFields(fields)
        .setFooter({ text: 'GUHDRIDES DISPATCH SYSTEM' })
        .setTimestamp();
      await channel.send({ embeds: [embed] });
    } catch {
      // Logging should never crash the bot
    }
  }
}

export const logService = new LogService();
