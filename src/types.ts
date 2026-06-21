import Decimal from 'decimal.js';

// ═══════════════════════════════════════════════════════════════════════════
//  SHARED TYPES
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// Crate
// ---------------------------------------------------------------------------

export type CrateType = 'bronze' | 'silver' | 'gold';

export interface CrateReward {
  description: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}

// ---------------------------------------------------------------------------
// Cards (Blackjack)
// ---------------------------------------------------------------------------

export interface Card {
  rank: string;
  suit: string;
}

// ---------------------------------------------------------------------------
// Database row shapes
// ---------------------------------------------------------------------------

export interface BlackjackGameRow {
  game_id:          string;
  user_id:          string;
  status:           'player_turn' | 'completed';
  player_hand_json: Card[];
  dealer_hand_json: Card[];
  bet_amount:       string | number;
  doubled:          boolean;
}

export interface TransactionRow {
  id:         number;
  user_id:    string;
  amount:     string;
  type:       string;
  reason:     string;
  created_at: Date;
}

export interface LeaderboardRow {
  user_id: string;
  balance: string;
}

export interface InventoryRow {
  item_type:     string;
  quantity:      number;
  item_metadata: Record<string, unknown> | null;
}

export interface ActivityRow {
  messageCount: number;
  vcMinutes:    number;
}

// ---------------------------------------------------------------------------
// Service interfaces — implemented in services/
// ---------------------------------------------------------------------------

export interface IEconomyService {
  getBalance(userId: string): Promise<Decimal>;
  transferBalance(fromId: string, toId: string, amount: Decimal, reason: string): Promise<void>;
  claimDaily(
    userId: string,
    reward: number,
    cooldownHours: number,
    streakBonus: number,
    maxStreak: number
  ): Promise<{ amount: Decimal; streak: number; nextClaimAt: Date }>;
  getUserRank(userId: string): Promise<{ rank: number; total: number }>;
  getTransactions(userId: string, limit: number): Promise<TransactionRow[]>;
  getLeaderboard(limit: number): Promise<LeaderboardRow[]>;
  getValidInviteCount(userId: string): Promise<number>;
}

export interface IUserService {
  ensureUser(userId: string): Promise<void>;
  getActivity(userId: string): Promise<ActivityRow>;
  getInventory(userId: string): Promise<InventoryRow[]>;
}

export interface ICrateService {
  openCrate(userId: string, type: CrateType, client: import('discord.js').Client, guildId: string): Promise<CrateReward[]>;
  getAllRewardsSummary(): Promise<string>;
}

export interface IGamblingService {
  handValue(hand: Card[]): number;
  coinflip(
    userId: string,
    amount: Decimal,
    choice: 'heads' | 'tails'
  ): Promise<{ won: boolean; outcome: string; payout: Decimal; net: Decimal }>;
  dice(
    userId: string,
    amount: Decimal,
    target: number
  ): Promise<{ roll: number; payout: Decimal; net: Decimal }>;
  startBlackjack(
    userId: string,
    bet: Decimal
  ): Promise<{
    gameId: string;
    status: 'player_turn' | 'completed';
    playerHand: Card[];
    dealerHand: Card[];
    canDouble: boolean;
  }>;
  hit(gameId: string, userId: string): Promise<{ playerHand: Card[]; busted: boolean }>;
  stand(gameId: string, userId: string): Promise<{
    playerHand: Card[];
    dealerHand: Card[];
    result: string;
    payout: Decimal;
  }>;
  doubleDown(gameId: string, userId: string): Promise<{
    playerHand: Card[];
    dealerHand?: Card[];
    busted: boolean;
    result: string;
    payout?: Decimal;
  }>;
  surrender(gameId: string, userId: string): Promise<void>;
  getBlackjackGame(gameId: string, userId: string): Promise<BlackjackGameRow | null>;
}

export interface AppServices {
  economy:  IEconomyService;
  user:     IUserService;
  crate:    ICrateService;
  gambling: IGamblingService;
}
