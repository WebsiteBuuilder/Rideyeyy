"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EconomyServices = void 0;
const InviteLoggingService_1 = require("../invite/InviteLoggingService");
const repositories_1 = require("./repositories");
const RedemptionService_1 = require("./RedemptionService");
const ShopService_1 = require("./ShopService");
const LotteryService_1 = require("./LotteryService");
const ActivityService_1 = require("./ActivityService");
// ═══════════════════════════════════════════════════════════════════════════
//  EconomyServices — composition root for the referral economy expansion
//  (redemptions, shop, lottery, activity). Constructed once and shared.
// ═══════════════════════════════════════════════════════════════════════════
class EconomyServices {
    constructor(logging = new InviteLoggingService_1.InviteLoggingService()) {
        const redemptionRepo = new repositories_1.RedemptionRepository();
        const shopRepo = new repositories_1.ShopRepository();
        const lotteryRepo = new repositories_1.LotteryRepository();
        const activityRepo = new repositories_1.ActivityRepository();
        this.redemption = new RedemptionService_1.RedemptionService(redemptionRepo, logging);
        this.shop = new ShopService_1.ShopService(shopRepo, this.redemption, logging);
        this.lottery = new LotteryService_1.LotteryService(lotteryRepo, this.redemption, logging);
        this.activity = new ActivityService_1.ActivityService(activityRepo);
    }
    /** Seed per-guild defaults (shop catalogue) idempotently. */
    async ensureGuild(guildId) {
        await this.shop.ensureDefaults(guildId);
    }
}
exports.EconomyServices = EconomyServices;
