import Decimal from 'decimal.js';

// ═══════════════════════════════════════════════════════════════════════════
//  MATH UTILITIES — Currency & Amount Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format a Decimal or plain number as a Route Cash string.
 * Accepts both Decimal (returned by getBalance/economy service) and
 * number (used in config constants like CRATE_META.cost).
 */
export function formatRC(amount: Decimal | number): string {
  const d = amount instanceof Decimal ? amount : new Decimal(amount);
  return `${d.toFixed(2)} RC`;
}

/**
 * Parse a user-supplied amount string into a Decimal.
 * Throws if the value is not a valid positive number.
 */
export function parseAmount(input: string): Decimal {
  const trimmed = input.trim();
  const value = new Decimal(trimmed);
  if (value.isNaN() || !value.isFinite() || value.lte(0)) {
    throw new Error(`Invalid amount: "${input}". Must be a positive number.`);
  }
  return value;
}
