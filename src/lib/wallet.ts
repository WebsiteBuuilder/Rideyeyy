import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

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
export class InsufficientFundsError extends Error {
  constructor(message = 'Insufficient Route Cash') {
    super(message);
    this.name = 'InsufficientFundsError';
  }
}

// Both PrismaClient and the interactive-transaction client satisfy this.
export type RawDb = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>;

/** Ensure a balance row exists for the user (no-op if already present). */
export async function ensureWallet(userId: string, db: RawDb = prisma): Promise<void> {
  await db.$executeRaw`
    INSERT INTO user_balances (user_id, balance)
    VALUES (${userId}::bigint, 0)
    ON CONFLICT (user_id) DO NOTHING
  `;
}

/** Read a user's current balance (0 if they have no row yet). */
export async function getBalance(userId: string, db: RawDb = prisma): Promise<Decimal> {
  const rows = await db.$queryRaw<{ balance: string }[]>`
    SELECT balance::text AS balance FROM user_balances WHERE user_id = ${userId}::bigint
  `;
  return new Decimal(rows[0]?.balance ?? 0);
}

/**
 * Atomically adjust a balance and write a ledger row. `delta` is positive for
 * a credit, negative for a debit. Must be called inside a transaction (`db` =
 * the tx client) when several adjustments need to be atomic together.
 * Throws InsufficientFundsError if the result would be negative.
 */
export async function adjustBalance(
  db: RawDb,
  userId: string,
  delta: Decimal,
  type: string,
  reason: string
): Promise<Decimal> {
  await ensureWallet(userId, db);
  const rows = await db.$queryRaw<{ balance: string }[]>`
    SELECT balance::text AS balance FROM user_balances WHERE user_id = ${userId}::bigint FOR UPDATE
  `;
  const before = new Decimal(rows[0]?.balance ?? 0);
  const after = before.add(delta);
  if (after.lt(0)) throw new InsufficientFundsError();

  await db.$executeRaw`
    UPDATE user_balances SET balance = ${after.toFixed()}::numeric, last_updated = now()
    WHERE user_id = ${userId}::bigint
  `;
  await db.$executeRaw`
    INSERT INTO transactions (user_id, amount, balance_before, balance_after, type, reason)
    VALUES (${userId}::bigint, ${delta.toFixed()}::numeric, ${before.toFixed()}::numeric, ${after.toFixed()}::numeric, ${type}, ${reason})
  `;
  return after;
}

/** Convenience wrapper that runs a single balance adjustment in its own tx. */
export async function adjustBalanceTx(
  userId: string,
  delta: Decimal,
  type: string,
  reason: string
): Promise<Decimal> {
  return prisma.$transaction((tx) => adjustBalance(tx, userId, delta, type, reason));
}
