"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrateService = void 0;
// ═══════════════════════════════════════════════════════════════════════════
//  CRATE SERVICE
// ═══════════════════════════════════════════════════════════════════════════
class CrateService {
    async openCrate(userId, type, client, guildId) {
        void userId;
        void type;
        void client;
        void guildId;
        return [{ description: '100 Route Cash', rarity: 'common' }];
    }
    async getAllRewardsSummary() {
        return 'Bronze: Route Cash\nSilver: Route Cash + Roles\nGold: Route Cash + Rare Roles';
    }
}
exports.CrateService = CrateService;
