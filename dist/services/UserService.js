"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const prisma_1 = require("../lib/prisma");
const wallet_1 = require("../lib/wallet");
// ═══════════════════════════════════════════════════════════════════════════
//  USER SERVICE — backed by user_balances / user_activity / user_inventory
// ═══════════════════════════════════════════════════════════════════════════
class UserService {
    async ensureUser(userId) {
        await (0, wallet_1.ensureWallet)(userId);
    }
    async getActivity(userId) {
        const rows = await prisma_1.prisma.$queryRaw `
      SELECT message_count, vc_minutes FROM user_activity WHERE user_id = ${userId}::bigint
    `;
        return {
            messageCount: rows[0]?.message_count ?? 0,
            vcMinutes: rows[0]?.vc_minutes ?? 0,
        };
    }
    async getInventory(userId) {
        const rows = await prisma_1.prisma.$queryRaw `
      SELECT item_type, quantity, item_metadata
      FROM user_inventory
      WHERE user_id = ${userId}::bigint
      ORDER BY created_at DESC
    `;
        return rows;
    }
}
exports.UserService = UserService;
