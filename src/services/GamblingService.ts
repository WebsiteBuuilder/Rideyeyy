import { randomInt, randomUUID } from 'crypto';
import { Pool } from 'pg';
import Decimal from 'decimal.js';
import { config } from '../config';
import { EconomyService, InsufficientFundsError } from './EconomyService';
import { LoggerService } from './LoggerService';
import type { Card, Rank, Suit, Snowflake, BlackjackStatus } from '../types';
import { parseAmount, assertPositive } from '../utils/math';

const SUITS: Suit[] = ['H', 'D', 'C', 'S'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export interface CoinflipResult {
  won: boolean;
  choice: string;
  outcome: string;
  payout: Decimal;
  net: Decimal;
}

export interface DiceResult {
  roll: number;
  target: number;
  payout: Decimal;
  net: Decimal;
  description: string;
}

export class GamblingService {
  constructor(
    private readonly pool: Pool,
    private readonly economy: EconomyService,
    private readonly logger: LoggerService
  ) {}

  validateBet(amount: Decimal): void {
    assertPositive(amount);
    const min = new Decimal(config.gambling.minBet);
    const max = new Decimal(config.gambling.maxBet);
    if (amount.lt(min) || amount.gt(max)) {
      throw new Error(`Bet must be between ${min} and ${max} RC`);
    }
  }

  async coinflip(
    userId: Snowflake,
    amount: Decimal,
    choice: 'heads' | 'tails'
  ): Promise<CoinflipResult> {
    this.validateBet(amount);
    const batchId = randomUUID();

    const winRoll = randomInt(0, 100);
    const won = winRoll < config.gambling.coinflipWinChance;
    const outcome = won ? choice : choice === 'heads' ? 'tails' : 'heads';

    await this.economy.removeBalance(userId, amount, 'Coinflip Bet', 'gamble', batchId, { game: 'coinflip' }, 'gamble_loss');

    let payout = new Decimal(0);
    if (won) {
      payout = amount.mul(2);
      await this.economy.addBalance(userId, payout, 'Coinflip Win', 'gamble', batchId, { game: 'coinflip' }, 'gamble_win');
    }

    return {
      won,
      choice,
      outcome,
      payout,
      net: payout.minus(amount),
    };
  }

  async dice(
    userId: Snowflake,
    amount: Decimal,
    target: number
  ): Promise<DiceResult> {
    this.validateBet(amount);
    if (target < 1 || target > 6) {
      throw new Error('Target must be between 1 and 6');
    }

    const batchId = randomUUID();
    const roll = randomInt(1, 7);

    await this.economy.removeBalance(userId, amount, 'Dice Bet', 'gamble', batchId, { game: 'dice', target, roll }, 'gamble_loss');

    let payout = new Decimal(0);
    let description = 'Miss! You lose.';

    if (roll === target) {
      payout = amount.mul(config.gambling.diceTargetMultiplier);
      description = `Exact hit! ${config.gambling.diceTargetMultiplier}x payout.`;
    } else if (roll === target - 1 || roll === target + 1 || (target === 1 && roll === 6) || (target === 6 && roll === 1)) {
      payout = amount.mul(config.gambling.diceAdjacentMultiplier);
      description = `Close! ${config.gambling.diceAdjacentMultiplier}x payout.`;
    }

    if (payout.gt(0)) {
      await this.economy.addBalance(userId, payout, 'Dice Win', 'gamble', batchId, { game: 'dice', roll }, 'gamble_win');
    }

    return { roll, target, payout, net: payout.minus(amount), description };
  }

  private createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank });
      }
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  handValue(hand: Card[]): number {
    let total = 0;
    let aces = 0;
    for (const card of hand) {
      if (card.rank === 'A') {
        aces++;
        total += 11;
      } else if (['K', 'Q', 'J'].includes(card.rank)) {
        total += 10;
      } else {
        total += parseInt(card.rank, 10);
      }
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return total;
  }

  isBlackjack(hand: Card[]): boolean {
    return hand.length === 2 && this.handValue(hand) === 21;
  }

  async startBlackjack(userId: Snowflake, betAmount: Decimal): Promise<{
    gameId: string;
    playerHand: Card[];
    dealerHand: Card[];
    status: BlackjackStatus;
  }> {
    this.validateBet(betAmount);

    const active = await this.pool.query(
      `SELECT game_id FROM blackjack_games WHERE user_id = $1 AND status NOT IN ('completed', 'timed_out')`,
      [userId]
    );
    if ((active.rowCount ?? 0) > 0) {
      throw new Error('You already have an active blackjack game');
    }

    const deck = this.createDeck();
    const playerHand = [deck.pop()!, deck.pop()!];
    const dealerHand = [deck.pop()!, deck.pop()!];

    const batchId = randomUUID();
    const betTx = await this.economy.removeBalance(userId, betAmount, 'Blackjack Bet', 'gamble', batchId, undefined, 'gamble_loss');

    let status: BlackjackStatus = 'player_turn';
    let result: string | null = null;

    if (this.isBlackjack(playerHand)) {
      status = 'completed';
      result = 'blackjack';
      const payout = betAmount.mul(2.5);
      await this.economy.addBalance(userId, payout, 'Blackjack Natural', 'gamble', batchId, undefined, 'gamble_win');
      const insert = await this.pool.query<{ game_id: string }>(
        `INSERT INTO blackjack_games
          (user_id, bet_amount, player_hand_json, dealer_hand_json, status, result, player_payout, completed_at, bet_transaction_id, payout_transaction_id)
         VALUES ($1, $2, $3, $4, 'completed', 'blackjack', $5, NOW(), $6, NULL)
         RETURNING game_id`,
        [userId, betAmount.toFixed(2), JSON.stringify(playerHand), JSON.stringify(dealerHand), payout.toFixed(2), betTx]
      );
      return { gameId: insert.rows[0].game_id, playerHand, dealerHand, status: 'completed' };
    }

    const insert = await this.pool.query<{ game_id: string }>(
      `INSERT INTO blackjack_games
        (user_id, bet_amount, player_hand_json, dealer_hand_json, status, bet_transaction_id)
       VALUES ($1, $2, $3, $4, 'player_turn', $5)
       RETURNING game_id`,
      [userId, betAmount.toFixed(2), JSON.stringify(playerHand), JSON.stringify(dealerHand), betTx]
    );

    return {
      gameId: insert.rows[0].game_id,
      playerHand,
      dealerHand,
      status,
    };
  }

  async getBlackjackGame(gameId: string, userId: Snowflake) {
    const result = await this.pool.query(
      'SELECT * FROM blackjack_games WHERE game_id = $1 AND user_id = $2',
      [gameId, userId]
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return {
      ...row,
      player_hand_json: row.player_hand_json as Card[],
      dealer_hand_json: row.dealer_hand_json as Card[],
      bet_amount: new Decimal(row.bet_amount),
    };
  }

  async hit(gameId: string, userId: Snowflake): Promise<{ playerHand: Card[]; busted: boolean }> {
    const game = await this.getBlackjackGame(gameId, userId);
    if (!game || game.status !== 'player_turn') {
      throw new Error('Invalid game state');
    }

    const deck = this.createDeck();
    const playerHand = [...game.player_hand_json, deck.pop()!];
    const value = this.handValue(playerHand);

    if (value > 21) {
      await this.pool.query(
        `UPDATE blackjack_games SET player_hand_json = $1, status = 'completed', result = 'busted', completed_at = NOW() WHERE game_id = $2`,
        [JSON.stringify(playerHand), gameId]
      );
      return { playerHand, busted: true };
    }

    await this.pool.query('UPDATE blackjack_games SET player_hand_json = $1 WHERE game_id = $2', [
      JSON.stringify(playerHand),
      gameId,
    ]);
    return { playerHand, busted: false };
  }

  async stand(gameId: string, userId: Snowflake): Promise<{
    playerHand: Card[];
    dealerHand: Card[];
    result: string;
    payout: Decimal;
  }> {
    const game = await this.getBlackjackGame(gameId, userId);
    if (!game || game.status !== 'player_turn') {
      throw new Error('Invalid game state');
    }

    const playerHand = game.player_hand_json;
    let dealerHand = [...game.dealer_hand_json];
    const deck = this.createDeck();

    while (this.handValue(dealerHand) < 17) {
      dealerHand.push(deck.pop()!);
    }

    const playerVal = this.handValue(playerHand);
    const dealerVal = this.handValue(dealerHand);
    const bet = game.bet_amount;

    let result: string;
    let payout = new Decimal(0);

    if (dealerVal > 21 || playerVal > dealerVal) {
      result = 'win';
      payout = bet.mul(2);
    } else if (playerVal === dealerVal) {
      result = 'push';
      payout = bet;
    } else {
      result = 'loss';
    }

    if (payout.gt(0)) {
      await this.economy.addBalance(userId, payout, `Blackjack ${result}`, 'gamble', undefined, undefined, 'gamble_win');
    }

    await this.pool.query(
      `UPDATE blackjack_games SET dealer_hand_json = $1, status = 'completed', result = $2, player_payout = $3, completed_at = NOW() WHERE game_id = $4`,
      [JSON.stringify(dealerHand), result, payout.toFixed(2), gameId]
    );

    return { playerHand, dealerHand, result, payout };
  }

  async surrender(gameId: string, userId: Snowflake): Promise<void> {
    const game = await this.getBlackjackGame(gameId, userId);
    if (!game || game.status !== 'player_turn') {
      throw new Error('Invalid game state');
    }

    const refund = game.bet_amount.div(2);
    await this.economy.addBalance(userId, refund, 'Blackjack Surrender (half back)', 'gamble', undefined, undefined, 'gamble_win');

    await this.pool.query(
      `UPDATE blackjack_games SET status = 'completed', result = 'surrender', player_payout = $1, completed_at = NOW() WHERE game_id = $2`,
      [refund.toFixed(2), gameId]
    );
  }

  formatHand(hand: Card[], hideSecond?: boolean): string {
    if (hideSecond && hand.length >= 2) {
      return `${hand[0].rank}${hand[0].suit} ??`;
    }
    return hand.map((c) => `${c.rank}${c.suit}`).join(' ');
  }
}
