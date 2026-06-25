import { prisma } from '../lib/prisma';
import type { IBlacklistService } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
//  BLACKLIST SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class BlacklistService implements IBlacklistService {
  async isBlacklisted(discordId: string): Promise<boolean> {
    const entry = await prisma.blacklist.findUnique({ where: { discordId } });
    return entry !== null;
  }

  async add(discordId: string, createdBy: string, reason?: string): Promise<void> {
    await prisma.blacklist.upsert({
      where: { discordId },
      create: { discordId, createdBy, reason: reason ?? null },
      update: { reason: reason ?? null, createdBy },
    });
    console.log(`[Bot] Blacklist Added: ${discordId} by ${createdBy}`);
  }

  async remove(discordId: string): Promise<boolean> {
    try {
      await prisma.blacklist.delete({ where: { discordId } });
      console.log(`[Bot] Blacklist Removed: ${discordId}`);
      return true;
    } catch {
      return false;
    }
  }
}
