import Decimal from 'decimal.js';
import type { IEconomyService, TransactionRow, LeaderboardRow } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
//  ECONOMY SERVICE
// ═══════════════════════════════════════════════════════════════════════════

/** Thrown when a user does not have enough Route Cash */
export class InsufficientFundsError extends Error {
  constructor(message = 'Insufficient Route Cash') {
    super(message);
    this.name = 'InsufficientFundsError';
  }
}

/** Thrown when a daily reward is on cooldown */
export class DailyCooldownError extends Error {
  nextClaimAt: Date;
  constructor(nextClaimAt: Date) {
    super('Daily reward already claimed');
    this.name  = 'DailyCooldownError';
    this.nextClaimAt = nextClaimAt;
  }
}

// ---------------------------------------------------------------------------
// Stub implementation — replace db calls with your actual DB client
// ---------------------------------------------------------------------------

export class EconomyService implements IEconomyService {
  async getBalance(userId: string): Promise<Decimal> {
    void userId;
    return new Decimal(0);
  }

  async transferBalance(
    fromId: string,
    toId: string,
    amount: Decimal,
    reason: string
  ): Promise<void> {
    void fromId; void toId; void amount; void reason;
  }

  async claimDaily(
    userId: string,
    reward: number,
    cooldownHours: number,
    streakBonus: number,
    maxStreak: number
  ): Promise<{ amount: Decimal; streak: number; nextClaimAt: Date }> {
    void userId; void cooldownHours; void streakBonus; void maxStreak;
    const nextClaimAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return { amount: new Decimal(reward), streak: 1, nextClaimAt };
  }

  async getUserRank(userId: string): Promise<{ rank: number; total: number }> {
    void userId;
    return { rank: 1, total: 1 };
  }

  async getTransactions(userId: string, limit: number): Promise<TransactionRow[]> {
    void userId; void limit;
    return [];
  }

  async getLeaderboard(limit: number): Promise<LeaderboardRow[]> {
    void limit;
    return [];
  }

  async getValidInviteCount(userId: string): Promise<number> {
    void userId;
    return 0;
  }
}
