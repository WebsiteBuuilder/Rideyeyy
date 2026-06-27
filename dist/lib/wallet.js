"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsufficientFundsError = void 0;
exports.ensureWallet = ensureWallet;
exports.getBalance = getBalance;
exports.adjustBalance = adjustBalance;
exports.adjustBalanceTx = adjustBalanceTx;
const decimal_js_1 = __importDefault(require("decimal.js"));
const prisma_1 = require("./prisma");
// ═══════════════════════════════════════════════════════════════════════════
//  WALLET — shared Route Cash balance + transaction ledger helpers
//
//  Works against the existing production tables:
//    user_balances (user_id BIGINT PK, balance NUMERIC, last_updated)
//    transactions  (id UUID PK, user_id BIGINT, amount NUMERIC,
//                   balance_before NUMERIC, balance_after NUMERIC,
//                   type VARCHAR, reason VARCHAR, created_at)
//
//  Discord IDs are passed as strings and cast to ::bigint in SQL.
// ═══════════════════════════════════════════════════════════════════════════
/** Thrown when a user does not have enough Route Cash. */
class InsufficientFundsError extends Error {
    constructor(message = 'Insufficient Route Cash') {
        super(message);
        this.name = 'InsufficientFundsError';
    }
}
exports.InsufficientFundsError = InsufficientFundsError;
/** Ensure a balance row exists for the user (no-op if already present). */
async function ensureWallet(userId, db = prisma_1.prisma) {
    await db.$executeRaw `
    INSERT INTO user_balances (user_id, balance)
    VALUES (${userId}::bigint, 0)
    ON CONFLICT (user_id) DO NOTHING
  `;
}
/** Read a user's current balance (0 if they have no row yet). */
async function getBalance(userId, db = prisma_1.prisma) {
    const rows = await db.$queryRaw `
    SELECT balance::text AS balance FROM user_balances WHERE user_id = ${userId}::bigint
  `;
    return new decimal_js_1.default(rows[0]?.balance ?? 0);
}
/**
 * Atomically adjust a balance and write a ledger row. `delta` is positive for
 * a credit, negative for a debit. Must be called inside a transaction (`db` =
 * the tx client) when several adjustments need to be atomic together.
 * Throws InsufficientFundsError if the result would be negative.
 */
async function adjustBalance(db, userId, delta, type, reason) {
    await ensureWallet(userId, db);
    const rows = await db.$queryRaw `
    SELECT balance::text AS balance FROM user_balances WHERE user_id = ${userId}::bigint FOR UPDATE
  `;
    const before = new decimal_js_1.default(rows[0]?.balance ?? 0);
    const after = before.add(delta);
    if (after.lt(0))
        throw new InsufficientFundsError();
    await db.$executeRaw `
    UPDATE user_balances SET balance = ${after.toFixed()}::numeric, last_updated = now()
    WHERE user_id = ${userId}::bigint
  `;
    await db.$executeRaw `
    INSERT INTO transactions (user_id, amount, balance_before, balance_after, type, reason)
    VALUES (${userId}::bigint, ${delta.toFixed()}::numeric, ${before.toFixed()}::numeric, ${after.toFixed()}::numeric, ${type}, ${reason})
  `;
    return after;
}
/** Convenience wrapper that runs a single balance adjustment in its own tx. */
async function adjustBalanceTx(userId, delta, type, reason) {
    return prisma_1.prisma.$transaction((tx) => adjustBalance(tx, userId, delta, type, reason));
}
