"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
// ═══════════════════════════════════════════════════════════════════════════
//  USER SERVICE
// ═══════════════════════════════════════════════════════════════════════════
class UserService {
    async ensureUser(userId) {
        void userId;
    }
    async getActivity(userId) {
        void userId;
        return { messageCount: 0, vcMinutes: 0 };
    }
    async getInventory(userId) {
        void userId;
        return [];
    }
}
exports.UserService = UserService;
