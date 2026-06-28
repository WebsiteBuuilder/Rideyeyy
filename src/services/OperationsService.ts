import { ChannelType, Guild } from 'discord.js';
import { prisma } from '../lib/prisma';
import { config } from '../config';

// ═══════════════════════════════════════════════════════════════════════════
//  OperationsService — open/close bookings and rename the ticket category.
// ═══════════════════════════════════════════════════════════════════════════

export class OperationsService {
  async isBookingsOpen(guildId: string): Promise<boolean> {
    const cfg = await prisma.inviteConfig.findUnique({ where: { guildId } });
    return cfg?.bookingsOpen ?? true;
  }

  async setBookingsOpen(guild: Guild, open: boolean): Promise<void> {
    const guildId = guild.id;
    await prisma.inviteConfig.upsert({
      where: { guildId },
      create: { guildId, bookingsOpen: open },
      update: { bookingsOpen: open },
    });

    const categoryId = config.channels.bookingCategory;
    if (categoryId === '0') return;

    const name = open ? config.operations.categoryOpenName : config.operations.categoryClosedName;
    try {
      const category = await guild.channels.fetch(categoryId);
      if (category?.type === ChannelType.GuildCategory) {
        await category.setName(name);
      }
    } catch (err) {
      console.warn('[Operations] Could not rename booking category:', (err as Error).message);
    }
  }
}
