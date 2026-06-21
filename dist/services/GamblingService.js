"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GamblingService = void 0;
const decimal_js_1 = __importDefault(require("decimal.js"));
// ═══════════════════════════════════════════════════════════════════════════
//  GAMBLING SERVICE
// ═══════════════════════════════════════════════════════════════════════════
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['H', 'D', 'C', 'S'];
function newDeck() {
    const deck = [];
    for (const suit of SUITS)
        for (const rank of RANKS)
            deck.push({ rank, suit });
    return deck;
}
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function cardValue(rank) {
    if (['J', 'Q', 'K'].includes(rank))
        return 10;
    if (rank === 'A')
        return 11;
    return parseInt(rank, 10);
}
// In-memory blackjack store (replace with DB persistence)
const games = new Map();
class GamblingService {
    handValue(hand) {
        let total = 0;
        let aces = 0;
        for (const card of hand) {
            total += cardValue(card.rank);
            if (card.rank === 'A')
                aces++;
        }
        while (total > 21 && aces > 0) {
            total -= 10;
            aces--;
        }
        return total;
    }
    async coinflip(userId, amount, choice) {
        void userId;
        const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
        const won = outcome === choice;
        const payout = won ? amount.mul(2) : new decimal_js_1.default(0);
        const net = won ? amount : amount;
        return { won, outcome, payout, net };
    }
    async dice(userId, amount, target) {
        void userId;
        const roll = Math.floor(Math.random() * 6) + 1;
        const isExact = roll === target;
        const adjacent = Math.abs(roll - target) === 1;
        const payout = isExact ? amount.mul(6) : adjacent ? amount.mul(2) : new decimal_js_1.default(0);
        const net = isExact ? amount.mul(5) : adjacent ? amount : amount;
        return { roll, payout, net };
    }
    async startBlackjack(userId, bet) {
        const deck = shuffle(newDeck());
        const player = [deck.pop(), deck.pop()];
        const dealer = [deck.pop(), deck.pop()];
        const gameId = `${userId}-${Date.now()}`;
        const playerVal = this.handValue(player);
        const status = playerVal === 21 ? 'completed' : 'player_turn';
        games.set(gameId, {
            game_id: gameId, user_id: userId, status,
            player_hand_json: player, dealer_hand_json: dealer,
            bet_amount: bet.toString(), doubled: false, deck,
        });
        return { gameId, status, playerHand: player, dealerHand: dealer, canDouble: true };
    }
    async hit(gameId, userId) {
        void userId;
        const game = games.get(gameId);
        if (!game)
            throw new Error('Game not found.');
        game.player_hand_json.push(game.deck.pop());
        const busted = this.handValue(game.player_hand_json) > 21;
        if (busted)
            game.status = 'completed';
        return { playerHand: game.player_hand_json, busted };
    }
    async stand(gameId, userId) {
        void userId;
        const game = games.get(gameId);
        if (!game)
            throw new Error('Game not found.');
        const bet = new decimal_js_1.default(game.bet_amount);
        while (this.handValue(game.dealer_hand_json) < 17) {
            game.dealer_hand_json.push(game.deck.pop());
        }
        const pv = this.handValue(game.player_hand_json);
        const dv = this.handValue(game.dealer_hand_json);
        let result;
        let payout;
        if (dv > 21 || pv > dv) {
            result = 'win';
            payout = bet.mul(2);
        }
        else if (pv === dv) {
            result = 'push';
            payout = bet;
        }
        else {
            result = 'loss';
            payout = new decimal_js_1.default(0);
        }
        game.status = 'completed';
        return { playerHand: game.player_hand_json, dealerHand: game.dealer_hand_json, result, payout };
    }
    async doubleDown(gameId, userId) {
        const game = games.get(gameId);
        if (!game)
            throw new Error('Game not found.');
        game.player_hand_json.push(game.deck.pop());
        game.doubled = true;
        const busted = this.handValue(game.player_hand_json) > 21;
        if (busted) {
            game.status = 'completed';
            return { playerHand: game.player_hand_json, busted: true, result: 'bust', payout: new decimal_js_1.default(0) };
        }
        const stood = await this.stand(gameId, userId);
        return { playerHand: stood.playerHand, dealerHand: stood.dealerHand, busted: false, result: stood.result, payout: stood.payout.mul(2) };
    }
    async surrender(gameId, userId) {
        void userId;
        const game = games.get(gameId);
        if (game)
            game.status = 'completed';
    }
    async getBlackjackGame(gameId, userId) {
        void userId;
        const game = games.get(gameId);
        if (!game)
            return null;
        const { deck: _deck, ...row } = game;
        void _deck;
        return row;
    }
}
exports.GamblingService = GamblingService;
