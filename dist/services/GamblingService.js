"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GamblingService = void 0;
const decimal_js_1 = __importDefault(require("decimal.js"));
const prisma_1 = require("../lib/prisma");
const wallet_1 = require("../lib/wallet");
// ═══════════════════════════════════════════════════════════════════════════
//  GAMBLING SERVICE — real Route Cash stakes + payouts (user_balances/transactions)
//
//  Blackjack hand/deck state is held in memory for the duration of a hand
//  (the bet is debited up-front and the payout credited on completion). A
//  process restart mid-hand forfeits the in-progress hand's stake.
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
        const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
        const won = outcome === choice;
        const payout = won ? amount.mul(2) : new decimal_js_1.default(0);
        await prisma_1.prisma.$transaction(async (tx) => {
            await (0, wallet_1.adjustBalance)(tx, userId, amount.neg(), 'coinflip_bet', `Coinflip on ${choice}`);
            if (won)
                await (0, wallet_1.adjustBalance)(tx, userId, payout, 'coinflip_win', `Coinflip win (${outcome})`);
        });
        return { won, outcome, payout, net: amount };
    }
    async dice(userId, amount, target) {
        const roll = Math.floor(Math.random() * 6) + 1;
        const isExact = roll === target;
        const adjacent = Math.abs(roll - target) === 1;
        const payout = isExact ? amount.mul(6) : adjacent ? amount.mul(2) : new decimal_js_1.default(0);
        const net = isExact ? amount.mul(5) : amount;
        await prisma_1.prisma.$transaction(async (tx) => {
            await (0, wallet_1.adjustBalance)(tx, userId, amount.neg(), 'dice_bet', `Dice on ${target}`);
            if (payout.gt(0))
                await (0, wallet_1.adjustBalance)(tx, userId, payout, 'dice_win', `Dice win (rolled ${roll})`);
        });
        return { roll, payout, net };
    }
    async startBlackjack(userId, bet) {
        if (bet.lte(0))
            throw new Error('Bet must be positive.');
        await (0, wallet_1.ensureWallet)(userId);
        // Take the stake up-front (throws InsufficientFundsError if they can't cover it).
        await (0, wallet_1.adjustBalanceTx)(userId, bet.neg(), 'blackjack_bet', 'Blackjack bet');
        const deck = shuffle(newDeck());
        const player = [deck.pop(), deck.pop()];
        const dealer = [deck.pop(), deck.pop()];
        const gameId = `${userId}-${Date.now()}`;
        const natural = this.handValue(player) === 21;
        const status = natural ? 'completed' : 'player_turn';
        const game = {
            game_id: gameId,
            user_id: userId,
            status,
            player_hand_json: player,
            dealer_hand_json: dealer,
            bet_amount: bet.toString(),
            doubled: false,
            deck,
            bet,
            settled: false,
        };
        games.set(gameId, game);
        if (natural) {
            // Natural blackjack pays 3:2 → return stake + 1.5x.
            await this.credit(game, bet.mul(2.5), 'Blackjack (natural 21)');
        }
        return { gameId, status, playerHand: player, dealerHand: dealer, canDouble: true };
    }
    async hit(gameId, userId) {
        const game = this.requireGame(gameId, userId);
        game.player_hand_json.push(game.deck.pop());
        const busted = this.handValue(game.player_hand_json) > 21;
        if (busted) {
            game.status = 'completed';
            game.settled = true; // stake already lost
        }
        return { playerHand: game.player_hand_json, busted };
    }
    async stand(gameId, userId) {
        const game = this.requireGame(gameId, userId);
        const totalStake = game.doubled ? game.bet.mul(2) : game.bet;
        while (this.handValue(game.dealer_hand_json) < 17) {
            game.dealer_hand_json.push(game.deck.pop());
        }
        const pv = this.handValue(game.player_hand_json);
        const dv = this.handValue(game.dealer_hand_json);
        let result;
        let payout;
        if (dv > 21 || pv > dv) {
            result = 'win';
            payout = totalStake.mul(2);
        }
        else if (pv === dv) {
            result = 'push';
            payout = totalStake;
        }
        else {
            result = 'loss';
            payout = new decimal_js_1.default(0);
        }
        game.status = 'completed';
        await this.credit(game, payout, `Blackjack ${result}`);
        return { playerHand: game.player_hand_json, dealerHand: game.dealer_hand_json, result, payout };
    }
    async doubleDown(gameId, userId) {
        const game = this.requireGame(gameId, userId);
        // Double the stake — take a second bet (throws if insufficient).
        await (0, wallet_1.adjustBalanceTx)(userId, game.bet.neg(), 'blackjack_double', 'Blackjack double down');
        game.doubled = true;
        game.player_hand_json.push(game.deck.pop());
        if (this.handValue(game.player_hand_json) > 21) {
            game.status = 'completed';
            game.settled = true; // both stakes lost
            return { playerHand: game.player_hand_json, busted: true, result: 'bust', payout: new decimal_js_1.default(0) };
        }
        const stood = await this.stand(gameId, userId);
        return {
            playerHand: stood.playerHand,
            dealerHand: stood.dealerHand,
            busted: false,
            result: stood.result,
            payout: stood.payout,
        };
    }
    async surrender(gameId, userId) {
        const game = this.requireGame(gameId, userId);
        game.status = 'completed';
        // Return half the original stake.
        await this.credit(game, game.bet.div(2), 'Blackjack surrender');
    }
    async getBlackjackGame(gameId, userId) {
        const game = games.get(gameId);
        if (!game || game.user_id !== userId)
            return null;
        return {
            game_id: game.game_id,
            user_id: game.user_id,
            status: game.status,
            player_hand_json: game.player_hand_json,
            dealer_hand_json: game.dealer_hand_json,
            bet_amount: game.bet_amount,
            doubled: game.doubled,
        };
    }
    // ── internal helpers ──────────────────────────────────────────────────────
    requireGame(gameId, userId) {
        const game = games.get(gameId);
        if (!game || game.user_id !== userId)
            throw new Error('Game not found.');
        return game;
    }
    /** Credit a payout exactly once per game and mark it settled. */
    async credit(game, payout, reason) {
        if (game.settled)
            return;
        game.settled = true;
        if (payout.gt(0)) {
            await (0, wallet_1.adjustBalanceTx)(game.user_id, payout, 'blackjack_payout', reason);
        }
    }
}
exports.GamblingService = GamblingService;
