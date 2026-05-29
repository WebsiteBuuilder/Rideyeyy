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

export const REDEEM_OPTIONS = {
  one_dollar_credit: { rcCost: 1500, usdValue: 1, tag: '| -$1 CREDIT' },
  two_dollar_credit: { rcCost: 3000, usdValue: 2, tag: '| -$2 CREDIT' },
  five_dollar_credit: { rcCost: 7000, usdValue: 5, tag: '| -$5 CREDIT' },
  ten_dollar_credit: { rcCost: 12000, usdValue: 10, tag: '| -$10 CREDIT' },
  free_ride: { rcCost: 20000, usdValue: 20, tag: '| -FREE RIDE' },
} as const;
