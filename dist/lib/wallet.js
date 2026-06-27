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
//                   type VARCHAR, reason VARCHAR, created_at, + extra columns)
//
//  Discord IDs are passed as strings and cast to ::bigint in SQL. The
//  transactions insert is built dynamically so any extra NOT NULL columns the
//  production table carries are auto-filled with safe values.
// ═══════════════════════════════════════════════════════════════════════════
/** Thrown when a user does not have enough Route Cash. */
class InsufficientFundsError extends Error {
    constructor(message = 'Insufficient Route Cash') {
        super(message);
        this.name = 'InsufficientFundsError';
    }
}
exports.InsufficientFundsError = InsufficientFundsError;
// Identifies rows written by this bot in the shared transactions ledger.
const SOURCE_SYSTEM = 'guhdrides_bot';
// The columns we always provide values for. Anything else on the table that is
// NOT NULL without a default gets a safe auto-filled value.
const KNOWN_TX_COLUMNS = new Set(['user_id', 'amount', 'balance_before', 'balance_after', 'type', 'reason', 'source_system']);
let txColumnsCache = null;
async function getTxAutoColumns(db) {
    if (txColumnsCache)
        return txColumnsCache;
    const rows = await db.$queryRaw `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions'
  `;
    const auto = rows
        .map((r) => ({
        name: r.column_name,
        dataType: r.data_type,
        isNullable: r.is_nullable === 'YES',
        hasDefault: r.column_default != null,
    }))
        .filter((c) => !KNOWN_TX_COLUMNS.has(c.name) && !c.isNullable && !c.hasDefault);
    txColumnsCache = auto;
    if (auto.length > 0) {
        console.log('[wallet] transactions auto-filled NOT NULL columns:', auto.map((c) => `${c.name}(${c.dataType})`).join(', '));
    }
    return auto;
}
/** A safe SQL literal expression for an unrecognised NOT NULL column. */
function defaultSqlForType(dataType) {
    const t = dataType.toLowerCase();
    if (t.includes('uuid'))
        return 'gen_random_uuid()';
    if (t.includes('json'))
        return `'{}'::jsonb`;
    if (t.includes('bool'))
        return 'false';
    if (t.includes('int') || t.includes('numeric') || t.includes('double') || t.includes('real') || t.includes('decimal'))
        return '0';
    if (t.includes('timestamp') || t.includes('date') || t.includes('time'))
        return 'now()';
    // varchar/text/char and anything else → random text avoids UNIQUE collisions.
    return 'gen_random_uuid()::text';
}
async function insertTransaction(db, userId, amount, before, after, type, reason) {
    const auto = await getTxAutoColumns(db);
    const columns = ['user_id', 'amount', 'balance_before', 'balance_after', 'type', 'reason', 'source_system', ...auto.map((c) => `"${c.name}"`)];
    const values = [
        '$1::bigint',
        '$2::numeric',
        '$3::numeric',
        '$4::numeric',
        '$5',
        '$6',
        '$7',
        ...auto.map((c) => defaultSqlForType(c.dataType)),
    ];
    const sql = `INSERT INTO transactions (${columns.join(', ')}) VALUES (${values.join(', ')})`;
    await db.$executeRawUnsafe(sql, userId, amount.toFixed(), before.toFixed(), after.toFixed(), type, reason, SOURCE_SYSTEM);
}
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
    await insertTransaction(db, userId, delta, before, after, type, reason);
    return after;
}
/** Convenience wrapper that runs a single balance adjustment in its own tx. */
async function adjustBalanceTx(userId, delta, type, reason) {
    return prisma_1.prisma.$transaction((tx) => adjustBalance(tx, userId, delta, type, reason));
}
