import type { Client } from 'discord.js';
import type { ICrateService, CrateType, CrateReward } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
//  CRATE SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class CrateService implements ICrateService {
  async openCrate(
    userId: string,
    type: CrateType,
    client: Client,
    guildId: string
  ): Promise<CrateReward[]> {
    void userId; void type; void client; void guildId;
    return [{ description: '100 Route Cash', rarity: 'common' }];
  }

  async getAllRewardsSummary(): Promise<string> {
    return 'Bronze: Route Cash\nSilver: Route Cash + Roles\nGold: Route Cash + Rare Roles';
  }
}
