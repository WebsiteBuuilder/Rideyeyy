import type Decimal from 'decimal.js';
import type { Pool, PoolClient } from 'pg';
import type { Client, Guild, GuildMember } from 'discord.js';
import type { BackupService } from './services/BackupService';
import type { CrateService } from './services/CrateService';
import type { EconomyService } from './services/EconomyService';
import type { GamblingService } from './services/GamblingService';
import type { InviteService } from './services/InviteService';
import type { LoggerService } from './services/LoggerService';
import type { RedeemService } from './services/RedeemService';
import type { TicketService } from './services/TicketService';
import type { UserService } from './services/UserService';

export type Snowflake = string;

export type Suit = 'H' | 'D' | 'C' | 'S';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type TransactionType =
  | 'earn'
  | 'spend'
  | 'gamble_win'
  | 'gamble_loss'
  | 'admin_add'
  | 'admin_remove'
  | 'admin'
  | 'transfer_in'
  | 'transfer_out'
  | 'rollback'
  | 'crate_open'
  | 'redeem'
  | 'system';

export type SourceSystem =
  | 'invite'
  | 'daily'
  | 'gamble'
  | 'crate'
  | 'redeem'
  | 'admin'
  | 'rollback'
  | 'economy'
  | 'ticket'
  | 'system';

export interface TransactionRecord {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: string;
  balance_before: string;
  balance_after: string;
  reason: string;
  timestamp: Date;
  metadata: Record<string, unknown> | null;
  source_system: SourceSystem;
  transaction_batch_id: string | null;
}

export type BlackjackStatus = 'player_turn' | 'dealer_turn' | 'completed' | 'timed_out';
export type BlackjackResult = 'win' | 'loss' | 'push' | 'blackjack' | 'surrender' | 'busted' | null;

export interface BlackjackGameRow {
  game_id: string;
  user_id: string;
  bet_amount: string;
  player_hand_json: Card[];
  dealer_hand_json: Card[];
  status: BlackjackStatus;
  result: BlackjackResult;
  player_payout: string | null;
  created_at: Date;
  completed_at: Date | null;
  bet_transaction_id: string | null;
  payout_transaction_id: string | null;
}

export type CrateType = 'bronze' | 'silver' | 'gold';

export interface CrateReward {
  id: string;
  crate_type: CrateType;
  reward_type: string;
  reward_value: string | null;
  reward_metadata: Record<string, unknown> | null;
  weight: number;
  is_jackpot: boolean;
}

export type RedeemOption =
  | 'one_dollar_credit'
  | 'two_dollar_credit'
  | 'five_dollar_credit'
  | 'ten_dollar_credit'
  | 'free_ride';

export interface RedeemOptionConfig {
  rcCost: number;
  usdValue: number;
  tag: string;
}

export interface AppServices {
  pool: Pool;
  logger: LoggerService;
  economy: EconomyService;
  user: UserService;
  backup: BackupService;
  invite: InviteService;
  gambling: GamblingService;
  crate: CrateService;
  redeem: RedeemService;
  ticket: TicketService;
}

export interface CommandContext {
  client: Client;
  services: AppServices;
  guild: Guild;
}

export interface DbClient extends PoolClient {}

export { Decimal };
