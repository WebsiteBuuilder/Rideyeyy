"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatRC = formatRC;
exports.parseAmount = parseAmount;
const decimal_js_1 = __importDefault(require("decimal.js"));
// ═══════════════════════════════════════════════════════════════════════════
//  MATH UTILITIES — Currency & Amount Helpers
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Format a Decimal or plain number as a Route Cash string.
 * Accepts both Decimal (returned by getBalance/economy service) and
 * number (used in config constants like CRATE_META.cost).
 */
function formatRC(amount) {
    const d = amount instanceof decimal_js_1.default ? amount : new decimal_js_1.default(amount);
    return `${d.toFixed(2)} RC`;
}
/**
 * Parse a user-supplied amount string into a Decimal.
 * Throws if the value is not a valid positive number.
 */
function parseAmount(input) {
    const trimmed = input.trim();
    const value = new decimal_js_1.default(trimmed);
    if (value.isNaN() || !value.isFinite() || value.lte(0)) {
        throw new Error(`Invalid amount: "${input}". Must be a positive number.`);
    }
    return value;
}
//# sourceMappingURL=math.js.map