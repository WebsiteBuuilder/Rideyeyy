import Decimal from 'decimal.js';
import type { Booking, ServiceType, VehicleType } from '@prisma/client';

// ═══════════════════════════════════════════════════════════════════════════
//  SHARED TYPES
// ═══════════════════════════════════════════════════════════════════════════

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
  id:         string;
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

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export interface BookingDraft {
  serviceType: ServiceType;
  vehicleType?: VehicleType;
  pickup?: string;
  destination?: string;
  price?: Decimal;
  redemptionId?: string;
}

export interface CreateBookingInput {
  customerId: string;
  guildId: string;
  preferredName: string;
  serviceType: ServiceType;
  vehicleType?: VehicleType;
  pickup: string;
  destination: string;
  notes?: string;
  redemptionId?: string;
}

export interface ProviderStatsRow {
  discordId: string;
  claims: number;
  completed: number;
  cancelled: number;
  avgRating: Decimal;
  revenue: Decimal;
}

export interface IBookingService {
  setDraft(userId: string, draft: BookingDraft): void;
  getDraft(userId: string): BookingDraft | undefined;
  clearDraft(userId: string): void;
  countActiveBookings(customerId: string): Promise<number>;
  hasDuplicateActiveRoute(customerId: string, pickup: string, destination: string): Promise<boolean>;
  createBooking(input: CreateBookingInput): Promise<Booking>;
  getByBookingNumber(bookingNumber: string): Promise<Booking | null>;
  claimBooking(bookingNumber: string, providerId: string): Promise<Booking | null>;
  completeBooking(bookingNumber: string, providerId: string): Promise<Booking | null>;
  cancelBooking(bookingNumber: string): Promise<Booking | null>;
  setRating(bookingNumber: string, rating: number): Promise<Booking | null>;
  updateTicketRefs(bookingNumber: string, channelId: string, messageId: string): Promise<void>;
}

export interface IProviderStatsService {
  ensureStats(discordId: string): Promise<void>;
  incrementClaims(discordId: string): Promise<void>;
  incrementCompleted(discordId: string, revenue: Decimal): Promise<void>;
  incrementCancelled(discordId: string): Promise<void>;
  recalculateAvgRating(providerId: string): Promise<void>;
  getProviderStats(discordId: string): Promise<ProviderStatsRow>;
  getTopProvidersByCompletedJobs(limit: number): Promise<ProviderStatsRow[]>;
  getTopProvidersByRevenue(limit: number): Promise<ProviderStatsRow[]>;
  getTopProvidersByAverageRating(limit: number, minCompleted?: number): Promise<ProviderStatsRow[]>;
}

export interface IBlacklistService {
  isBlacklisted(discordId: string): Promise<boolean>;
  add(discordId: string, createdBy: string, reason?: string): Promise<void>;
  remove(discordId: string): Promise<boolean>;
}

export interface AppServices {
  economy:  IEconomyService;
  user:     IUserService;
  gambling: IGamblingService;
  booking:  IBookingService;
  providerStats: IProviderStatsService;
  blacklist: IBlacklistService;
  invite:   import('./services/invite/InviteService').InviteService;
  redemption: import('./services/economy/RedemptionService').RedemptionService;
  shop:       import('./services/economy/ShopService').ShopService;
  lottery:    import('./services/economy/LotteryService').LotteryService;
  activity:   import('./services/economy/ActivityService').ActivityService;
  memberVerify: import('./services/verify/MemberVerifyService').MemberVerifyService;
  operations: import('./services/OperationsService').OperationsService;
}
