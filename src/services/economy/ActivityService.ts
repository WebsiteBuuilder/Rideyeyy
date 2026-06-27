import { ActivityRepository } from './repositories';

// ═══════════════════════════════════════════════════════════════════════════
//  ActivityService — tracks per-member message counts for the minimum-message
//  anti-abuse gate. Counting only needs the GuildMessages intent (no content).
// ═══════════════════════════════════════════════════════════════════════════

export class ActivityService {
  constructor(private readonly repo: ActivityRepository) {}

  async increment(guildId: string, userId: string): Promise<void> {
    await this.repo.increment(guildId, userId);
  }

  getMessageCount(guildId: string, userId: string): Promise<number> {
    return this.repo.getMessageCount(guildId, userId);
  }
}
