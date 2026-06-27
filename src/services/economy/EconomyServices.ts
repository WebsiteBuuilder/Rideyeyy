import { InviteLoggingService } from '../invite/InviteLoggingService';
import { RedemptionRepository, ShopRepository, LotteryRepository, ActivityRepository } from './repositories';
import { RedemptionService } from './RedemptionService';
import { ShopService } from './ShopService';
import { LotteryService } from './LotteryService';
import { ActivityService } from './ActivityService';

// ═══════════════════════════════════════════════════════════════════════════
//  EconomyServices — composition root for the referral economy expansion
//  (redemptions, shop, lottery, activity). Constructed once and shared.
// ═══════════════════════════════════════════════════════════════════════════

export class EconomyServices {
  readonly redemption: RedemptionService;
  readonly shop: ShopService;
  readonly lottery: LotteryService;
  readonly activity: ActivityService;

  constructor(logging: InviteLoggingService = new InviteLoggingService()) {
    const redemptionRepo = new RedemptionRepository();
    const shopRepo = new ShopRepository();
    const lotteryRepo = new LotteryRepository();
    const activityRepo = new ActivityRepository();

    this.redemption = new RedemptionService(redemptionRepo, logging);
    this.shop = new ShopService(shopRepo, this.redemption, logging);
    this.lottery = new LotteryService(lotteryRepo, this.redemption, logging);
    this.activity = new ActivityService(activityRepo);
  }

  /** Seed per-guild defaults (shop catalogue) idempotently. */
  async ensureGuild(guildId: string): Promise<void> {
    await this.shop.ensureDefaults(guildId);
  }
}
