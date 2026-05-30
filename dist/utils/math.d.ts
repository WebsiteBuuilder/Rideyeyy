import Decimal from 'decimal.js';
/**
 * Format a Decimal or plain number as a Route Cash string.
 * Accepts both Decimal (returned by getBalance/economy service) and
 * number (used in config constants like CRATE_META.cost).
 */
export declare function formatRC(amount: Decimal | number): string;
/**
 * Parse a user-supplied amount string into a Decimal.
 * Throws if the value is not a valid positive number.
 */
export declare function parseAmount(input: string): Decimal;
//# sourceMappingURL=math.d.ts.map