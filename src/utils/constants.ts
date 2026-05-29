export const NICKNAME_MAX_LENGTH = 32;
export const CONFIRM_TIMEOUT_MS = 60_000;
export const LEADERBOARD_DEFAULT_LIMIT = 10;
export const TRANSACTIONS_DEFAULT_LIMIT = 10;
export const TRANSACTIONS_MAX_LIMIT = 25;

export const TRANSACTION_TYPES_CREDIT = new Set([
  'earn',
  'gamble_win',
  'admin_add',
  'transfer_in',
  'rollback',
]);

export const TRANSACTION_TYPES_DEBIT = new Set([
  'spend',
  'gamble_loss',
  'admin_remove',
  'transfer_out',
  'crate_open',
  'redeem',
]);

// REDEEM_OPTIONS removed — canonical source of truth is REDEEM_MAP in RedeemService.ts
