"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityService = void 0;
// ═══════════════════════════════════════════════════════════════════════════
//  ActivityService — tracks per-member message counts for the minimum-message
//  anti-abuse gate. Counting only needs the GuildMessages intent (no content).
// ═══════════════════════════════════════════════════════════════════════════
class ActivityService {
    constructor(repo) {
        this.repo = repo;
    }
    async increment(guildId, userId) {
        await this.repo.increment(guildId, userId);
    }
    getMessageCount(guildId, userId) {
        return this.repo.getMessageCount(guildId, userId);
    }
}
exports.ActivityService = ActivityService;
