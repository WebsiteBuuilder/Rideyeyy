import Decimal from 'decimal.js';
import type { IGamblingService, Card, BlackjackGameRow } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
//  GAMBLING SERVICE
// ═══════════════════════════════════════════════════════════════════════════

const RANKS  = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const SUITS  = ['H','D','C','S'];

function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  return deck;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function cardValue(rank: string): number {
  if (['J','Q','K'].includes(rank)) return 10;
  if (rank === 'A') return 11;
  return parseInt(rank, 10);
}

// In-memory blackjack store (replace with DB persistence)
const games = new Map<string, BlackjackGameRow & { deck: Card[] }>();

export class GamblingService implements IGamblingService {
  handValue(hand: Card[]): number {
    let total = 0;
    let aces  = 0;
    for (const card of hand) {
      total += cardValue(card.rank);
      if (card.rank === 'A') aces++;
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }

  async coinflip(
    userId: string,
    amount: Decimal,
    choice: 'heads' | 'tails'
  ): Promise<{ won: boolean; outcome: string; payout: Decimal; net: Decimal }> {
    void userId;
    const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
    const won     = outcome === choice;
    const payout  = won ? amount.mul(2) : new Decimal(0);
    const net     = won ? amount : amount;
    return { won, outcome, payout, net };
  }

  async dice(
    userId: string,
    amount: Decimal,
    target: number
  ): Promise<{ roll: number; payout: Decimal; net: Decimal }> {
    void userId;
    const roll     = Math.floor(Math.random() * 6) + 1;
    const isExact  = roll === target;
    const adjacent = Math.abs(roll - target) === 1;
    const payout   = isExact ? amount.mul(6) : adjacent ? amount.mul(2) : new Decimal(0);
    const net      = isExact ? amount.mul(5) : adjacent ? amount : amount;
    return { roll, payout, net };
  }

  async startBlackjack(
    userId: string,
    bet: Decimal
  ): Promise<{
    gameId: string;
    status: 'player_turn' | 'completed';
    playerHand: Card[];
    dealerHand: Card[];
    canDouble: boolean;
  }> {
    const deck   = shuffle(newDeck());
    const player = [deck.pop()!, deck.pop()!];
    const dealer = [deck.pop()!, deck.pop()!];
    const gameId = `${userId}-${Date.now()}`;

    const playerVal = this.handValue(player);
    const status: 'player_turn' | 'completed' = playerVal === 21 ? 'completed' : 'player_turn';

    games.set(gameId, {
      game_id: gameId, user_id: userId, status,
      player_hand_json: player, dealer_hand_json: dealer,
      bet_amount: bet.toString(), doubled: false, deck,
    });

    return { gameId, status, playerHand: player, dealerHand: dealer, canDouble: true };
  }

  async hit(gameId: string, userId: string): Promise<{ playerHand: Card[]; busted: boolean }> {
    void userId;
    const game = games.get(gameId);
    if (!game) throw new Error('Game not found.');
    game.player_hand_json.push(game.deck.pop()!);
    const busted = this.handValue(game.player_hand_json) > 21;
    if (busted) game.status = 'completed';
    return { playerHand: game.player_hand_json, busted };
  }

  async stand(gameId: string, userId: string): Promise<{
    playerHand: Card[];
    dealerHand: Card[];
    result: string;
    payout: Decimal;
  }> {
    void userId;
    const game = games.get(gameId);
    if (!game) throw new Error('Game not found.');
    const bet = new Decimal(game.bet_amount);

    while (this.handValue(game.dealer_hand_json) < 17) {
      game.dealer_hand_json.push(game.deck.pop()!);
    }

    const pv = this.handValue(game.player_hand_json);
    const dv = this.handValue(game.dealer_hand_json);
    let result: string;
    let payout: Decimal;

    if (dv > 21 || pv > dv)       { result = 'win';  payout = bet.mul(2); }
    else if (pv === dv)            { result = 'push'; payout = bet; }
    else                           { result = 'loss'; payout = new Decimal(0); }

    game.status = 'completed';
    return { playerHand: game.player_hand_json, dealerHand: game.dealer_hand_json, result, payout };
  }

  async doubleDown(gameId: string, userId: string): Promise<{
    playerHand: Card[];
    dealerHand?: Card[];
    busted: boolean;
    result: string;
    payout?: Decimal;
  }> {
    const game = games.get(gameId);
    if (!game) throw new Error('Game not found.');
    game.player_hand_json.push(game.deck.pop()!);
    game.doubled = true;
    const busted = this.handValue(game.player_hand_json) > 21;
    if (busted) {
      game.status = 'completed';
      return { playerHand: game.player_hand_json, busted: true, result: 'bust', payout: new Decimal(0) };
    }
    const stood = await this.stand(gameId, userId);
    return { playerHand: stood.playerHand, dealerHand: stood.dealerHand, busted: false, result: stood.result, payout: stood.payout.mul(2) };
  }

  async surrender(gameId: string, userId: string): Promise<void> {
    void userId;
    const game = games.get(gameId);
    if (game) game.status = 'completed';
  }

  async getBlackjackGame(gameId: string, userId: string): Promise<BlackjackGameRow | null> {
    void userId;
    const game = games.get(gameId);
    if (!game) return null;
    const { deck: _deck, ...row } = game;
    void _deck;
    return row;
  }
}
