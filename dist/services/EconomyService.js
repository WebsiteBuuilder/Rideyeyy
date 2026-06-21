"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EconomyService = exports.DailyCooldownError = exports.InsufficientFundsError = void 0;
const decimal_js_1 = __importDefault(require("decimal.js"));
// ═══════════════════════════════════════════════════════════════════════════
//  ECONOMY SERVICE
// ═══════════════════════════════════════════════════════════════════════════
/** Thrown when a user does not have enough Route Cash */
class InsufficientFundsError extends Error {
    constructor(message = 'Insufficient Route Cash') {
        super(message);
        this.name = 'InsufficientFundsError';
    }
}
exports.InsufficientFundsError = InsufficientFundsError;
/** Thrown when a daily reward is on cooldown */
class DailyCooldownError extends Error {
    constructor(nextClaimAt) {
        super('Daily reward already claimed');
        this.name = 'DailyCooldownError';
        this.nextClaimAt = nextClaimAt;
    }
}
exports.DailyCooldownError = DailyCooldownError;
// ---------------------------------------------------------------------------
// Stub implementation — replace db calls with your actual DB client
// ---------------------------------------------------------------------------
class EconomyService {
    async getBalance(userId) {
        void userId;
        return new decimal_js_1.default(0);
    }
    async transferBalance(fromId, toId, amount, reason) {
        void fromId;
        void toId;
        void amount;
        void reason;
    }
    async claimDaily(userId, reward, cooldownHours, streakBonus, maxStreak) {
        void userId;
        void cooldownHours;
        void streakBonus;
        void maxStreak;
        const nextClaimAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        return { amount: new decimal_js_1.default(reward), streak: 1, nextClaimAt };
    }
    async getUserRank(userId) {
        void userId;
        return { rank: 1, total: 1 };
    }
    async getTransactions(userId, limit) {
        void userId;
        void limit;
        return [];
    }
    async getLeaderboard(limit) {
        void limit;
        return [];
    }
    async getValidInviteCount(userId) {
        void userId;
        return 0;
    }
}
exports.EconomyService = EconomyService;
