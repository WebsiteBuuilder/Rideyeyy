import { randomInt, randomUUID } from 'crypto';
import { Pool } from 'pg';
import Decimal from 'decimal.js';
import { config } from '../config';
import { EconomyService } from './EconomyService';
import { LoggerService } from './LoggerService';
import type { Card, Rank, Suit, Snowflake, BlackjackStatus } from '../types';
import { assertPositive } from '../utils/math';

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
    const payout = won ? amount.mul(2) : new Decimal(0);

    const { net, payout: paid } = await this.economy.executeGambleRound(
      userId,
      amount,
      payout,
      batchId,
      'Coinflip Bet',
      'Coinflip Win',
      { game: 'coinflip', choice, outcome, won }
    );

    return { won, choice, outcome, payout: paid, net };
  }

  async dice(userId: Snowflake, amount: Decimal, target: number): Promise<DiceResult> {
    this.validateBet(amount);
    if (target < 1 || target > 6) {
      throw new Error('Target must be between 1 and 6');
    }

    const batchId = randomUUID();
    const roll = randomInt(1, 7);

    let payout = new Decimal(0);
    let description = 'Miss! You lose.';

    if (roll === target) {
      payout = amount.mul(config.gambling.diceTargetMultiplier);
      description = `Exact hit! ${config.gambling.diceTargetMultiplier}x payout.`;
    } else if (
      roll === target - 1 ||
      roll === target + 1 ||
      (target === 1 && roll === 6) ||
      (target === 6 && roll === 1)
    ) {
      payout = amount.mul(config.gambling.diceAdjacentMultiplier);
      description = `Close! ${config.gambling.diceAdjacentMultiplier}x payout.`;
    }

    const { net, payout: paid } = await this.economy.executeGambleRound(
      userId,
      amount,
      payout,
      batchId,
      'Dice Bet',
      'Dice Win',
      { game: 'dice', target, roll }
    );

    return { roll, target, payout: paid, net, description };
  }

  createDeck(): Card[] {
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

  private rebuildDeckFromHands(playerHand: Card[], dealerHand: Card[]): Card[] {
    const deck = this.createDeck();
    const removeCard = (hand: Card[], card: Card) => {
      const idx = deck.findIndex((c) => c.rank === card.rank && c.suit === card.suit);
      if (idx >= 0) deck.splice(idx, 1);
    };
    for (const c of playerHand) removeCard(playerHand, c);
    for (const c of dealerHand) removeCard(dealerHand, c);
    return deck;
  }

  private parseDeck(raw: unknown, playerHand: Card[], dealerHand: Card[]): Card[] {
    if (Array.isArray(raw) && raw.length > 0) {
      return raw as Card[];
    }
    return this.rebuildDeckFromHands(playerHand, dealerHand);
  }

  private drawCard(deck: Card[]): Card {
    const card = deck.pop();
    if (!card) throw new Error('Deck exhausted');
    return card;
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

  isSoft17(hand: Card[]): boolean {
    if (this.handValue(hand) !== 17) return false;
    return hand.some((c) => c.rank === 'A');
  }

  async startBlackjack(userId: Snowflake, betAmount: Decimal): Promise<{
    gameId: string;
    playerHand: Card[];
    dealerHand: Card[];
    status: BlackjackStatus;
    canDouble: boolean;
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
    const playerHand = [this.drawCard(deck), this.drawCard(deck)];
    const dealerHand = [this.drawCard(deck), this.drawCard(deck)];

    const batchId = randomUUID();

    if (this.isBlackjack(playerHand)) {
      const payout = betAmount.mul(2.5);
      const { betTxId, payoutTxId } = await this.economy.executeBlackjackRound(
        userId,
        betAmount,
        payout,
        batchId,
        'Blackjack Bet',
        'Blackjack Natural',
        { natural: true }
      );
      const insert = await this.pool.query<{ game_id: string }>(
        `INSERT INTO blackjack_games
          (user_id, bet_amount, player_hand_json, dealer_hand_json, deck_json, status, result, player_payout, completed_at, bet_transaction_id, payout_transaction_id)
         VALUES ($1, $2, $3, $4, $5, 'completed', 'blackjack', $6, NOW(), $7, $8)
         RETURNING game_id`,
        [
          userId,
          betAmount.toFixed(2),
          JSON.stringify(playerHand),
          JSON.stringify(dealerHand),
          JSON.stringify(deck),
          payout.toFixed(2),
          betTxId,
          payoutTxId,
        ]
      );
      return {
        gameId: insert.rows[0].game_id,
        playerHand,
        dealerHand,
        status: 'completed',
        canDouble: false,
      };
    }

    const betTxId = await this.economy.debitBlackjackBet(
      userId,
      betAmount,
      'Blackjack Bet',
      batchId
    );

    const insert = await this.pool.query<{ game_id: string }>(
      `INSERT INTO blackjack_games
        (user_id, bet_amount, player_hand_json, dealer_hand_json, deck_json, status, bet_transaction_id)
       VALUES ($1, $2, $3, $4, $5, 'player_turn', $6)
       RETURNING game_id`,
      [userId, betAmount.toFixed(2), JSON.stringify(playerHand), JSON.stringify(dealerHand), JSON.stringify(deck), betTxId]
    );

    return {
      gameId: insert.rows[0].game_id,
      playerHand,
      dealerHand,
      status: 'player_turn',
      canDouble: true,
    };
  }

  async getBlackjackGame(gameId: string, userId: Snowflake) {
    const result = await this.pool.query(
      'SELECT * FROM blackjack_games WHERE game_id = $1 AND user_id = $2',
      [gameId, userId]
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    const playerHand = row.player_hand_json as Card[];
    const dealerHand = row.dealer_hand_json as Card[];
    return {
      ...row,
      player_hand_json: playerHand,
      dealer_hand_json: dealerHand,
      deck_json: this.parseDeck(row.deck_json, playerHand, dealerHand),
      bet_amount: new Decimal(row.bet_amount),
      doubled: Boolean(row.doubled),
    };
  }

  async hit(gameId: string, userId: Snowflake): Promise<{ playerHand: Card[]; busted: boolean }> {
    const game = await this.getBlackjackGame(gameId, userId);
    if (!game || game.status !== 'player_turn') {
      throw new Error('Invalid game state');
    }

    const deck = [...game.deck_json];
    const playerHand = [...game.player_hand_json, this.drawCard(deck)];
    const value = this.handValue(playerHand);

    if (value > 21) {
      await this.pool.query(
        `UPDATE blackjack_games SET player_hand_json = $1, deck_json = $2, status = 'completed', result = 'busted', completed_at = NOW() WHERE game_id = $3`,
        [JSON.stringify(playerHand), JSON.stringify(deck), gameId]
      );
      return { playerHand, busted: true };
    }

    await this.pool.query(
      'UPDATE blackjack_games SET player_hand_json = $1, deck_json = $2 WHERE game_id = $3',
      [JSON.stringify(playerHand), JSON.stringify(deck), gameId]
    );
    return { playerHand, busted: false };
  }

  async doubleDown(gameId: string, userId: Snowflake): Promise<{
    playerHand: Card[];
    dealerHand: Card[];
    result: string;
    payout: Decimal;
    busted: boolean;
  }> {
    const game = await this.getBlackjackGame(gameId, userId);
    if (!game || game.status !== 'player_turn') {
      throw new Error('Invalid game state');
    }
    if (game.doubled) {
      throw new Error('Already doubled down');
    }
    if (game.player_hand_json.length !== 2) {
      throw new Error('Double down only allowed with two cards');
    }

    const extraBet = game.bet_amount;
    this.validateBet(extraBet);
    await this.economy.debitBlackjackBet(userId, extraBet, 'Blackjack Double Down');

    const deck = [...game.deck_json];
    const playerHand = [...game.player_hand_json, this.drawCard(deck)];
    const newBetTotal = game.bet_amount.mul(2);

    await this.pool.query(
      `UPDATE blackjack_games SET bet_amount = $1, doubled = TRUE, player_hand_json = $2, deck_json = $3 WHERE game_id = $4`,
      [newBetTotal.toFixed(2), JSON.stringify(playerHand), JSON.stringify(deck), gameId]
    );

    if (this.handValue(playerHand) > 21) {
      await this.pool.query(
        `UPDATE blackjack_games SET status = 'completed', result = 'busted', completed_at = NOW() WHERE game_id = $1`,
        [gameId]
      );
      return { playerHand, dealerHand: game.dealer_hand_json, result: 'busted', payout: new Decimal(0), busted: true };
    }

    const resolved = await this.resolveDealer(
      gameId,
      userId,
      playerHand,
      game.dealer_hand_json,
      deck,
      newBetTotal
    );
    return { ...resolved, busted: false };
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

    return this.resolveDealer(
      gameId,
      userId,
      game.player_hand_json,
      game.dealer_hand_json,
      [...game.deck_json],
      game.bet_amount
    );
  }

  private async resolveDealer(
    gameId: string,
    userId: Snowflake,
    playerHand: Card[],
    dealerHand: Card[],
    deck: Card[],
    bet: Decimal
  ): Promise<{ playerHand: Card[]; dealerHand: Card[]; result: string; payout: Decimal; busted?: boolean }> {
    let dealer = [...dealerHand];
    while (this.handValue(dealer) < 17 || this.isSoft17(dealer)) {
      dealer.push(this.drawCard(deck));
    }

    const playerVal = this.handValue(playerHand);
    const dealerVal = this.handValue(dealer);

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

    const payoutTxId = await this.economy.creditBlackjackPayout(
      userId,
      payout,
      `Blackjack ${result}`
    );

    await this.pool.query(
      `UPDATE blackjack_games SET dealer_hand_json = $1, deck_json = $2, status = 'completed', result = $3, player_payout = $4, completed_at = NOW(), payout_transaction_id = $5 WHERE game_id = $6`,
      [JSON.stringify(dealer), JSON.stringify(deck), result, payout.toFixed(2), payoutTxId, gameId]
    );

    return { playerHand, dealerHand: dealer, result, payout };
  }

  async surrender(gameId: string, userId: Snowflake): Promise<void> {
    const game = await this.getBlackjackGame(gameId, userId);
    if (!game || game.status !== 'player_turn') {
      throw new Error('Invalid game state');
    }

    const refund = game.bet_amount.div(2);
    const payoutTxId = await this.economy.creditBlackjackPayout(
      userId,
      refund,
      'Blackjack Surrender (half back)'
    );

    await this.pool.query(
      `UPDATE blackjack_games SET status = 'completed', result = 'surrender', player_payout = $1, completed_at = NOW(), payout_transaction_id = $2 WHERE game_id = $3`,
      [refund.toFixed(2), payoutTxId, gameId]
    );
  }

  async timeoutStaleGames(): Promise<number> {
    const seconds = config.gambling.blackjackTimeoutSeconds;
    const stale = await this.pool.query<{ game_id: string; user_id: string }>(
      `SELECT game_id, user_id FROM blackjack_games
       WHERE status = 'player_turn'
       AND created_at < NOW() - ($1 || ' seconds')::INTERVAL`,
      [String(seconds)]
    );

    for (const row of stale.rows) {
      try {
        // resolveDealer (called by stand) sets status='completed'; we overwrite
        // result and status together in a single follow-up query so there is no
        // window where the row appears as a normal completed game.
        await this.stand(row.game_id, row.user_id);
        await this.pool.query(
          `UPDATE blackjack_games SET result = 'timed_out', status = 'timed_out' WHERE game_id = $1 AND status = 'completed'`,
          [row.game_id]
        );
      } catch (err) {
        this.logger.warn('Blackjack timeout failed', { userId: row.user_id, commandName: 'blackjackTimeout' });
      }
    }

    return stale.rowCount ?? 0;
  }

  formatHand(hand: Card[], hideSecond?: boolean): string {
    if (hideSecond && hand.length >= 2) {
      return `${hand[0].rank}${hand[0].suit} ??`;
    }
    return hand.map((c) => `${c.rank}${c.suit}`).join(' ');
  }
}
