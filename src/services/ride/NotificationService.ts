import { Client, EmbedBuilder } from 'discord.js';

type NotifyEvent =
  | 'CREATED'
  | 'CLAIMED'
  | 'EN_ROUTE'
  | 'PICKED_UP'
  | 'COMPLETED'
  | 'CANCELLED';

const MESSAGES: Record<NotifyEvent, (rideId: string) => string> = {
  CREATED:   (id) => `Your ride **${id}** has been created and is awaiting a driver.`,
  CLAIMED:   (id) => `A driver has been assigned to your ride **${id}**. They will be with you soon.`,
  EN_ROUTE:  (id) => `Your driver is now **en route** for ride **${id}**.`,
  PICKED_UP: (id) => `You have been **picked up** for ride **${id}**. Enjoy your ride!`,
  COMPLETED: (id) => `Your ride **${id}** has been **completed**. Please rate your experience below.`,
  CANCELLED: (id) => `Your ride **${id}** has been **cancelled**. Contact staff if you have questions.`,
};

const COLORS: Record<NotifyEvent, number> = {
  CREATED:   0x5865f2,
  CLAIMED:   0xfee75c,
  EN_ROUTE:  0xf79454,
  PICKED_UP: 0x57f287,
  COMPLETED: 0x2ecc71,
  CANCELLED: 0xed4245,
};

export class NotificationService {
  async notify(client: Client, userId: string, event: NotifyEvent, rideId: string): Promise<void> {
    try {
      const user = await client.users.fetch(userId);
      const embed = new EmbedBuilder()
        .setTitle(`GUHDRIDES — ${event.replace('_', ' ')}`)
        .setDescription(MESSAGES[event](rideId))
        .setColor(COLORS[event])
        .setFooter({ text: 'GUHDRIDES DISPATCH SYSTEM' })
        .setTimestamp();
      await user.send({ embeds: [embed] });
    } catch {
      // DMs disabled — silently ignore
    }
  }
}

export const notificationService = new NotificationService();
