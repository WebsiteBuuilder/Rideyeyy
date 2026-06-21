import { prisma } from '../../lib/prisma';

export class BlacklistService {
  async isBlacklisted(userId: string): Promise<boolean> {
    const entry = await prisma.blacklistedUser.findUnique({ where: { userId } });
    return entry !== null;
  }

  async blacklist(userId: string, reason: string): Promise<void> {
    await prisma.blacklistedUser.upsert({
      where:  { userId },
      update: { reason },
      create: { userId, reason },
    });
  }

  async unblacklist(userId: string): Promise<void> {
    await prisma.blacklistedUser.delete({ where: { userId } }).catch(() => undefined);
  }
}

export const blacklistService = new BlacklistService();
