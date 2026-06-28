"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOTTERY_COLOR = exports.BJ_COLOR = void 0;
exports.formatCard = formatCard;
exports.formatHiddenCard = formatHiddenCard;
exports.blackjackFooter = blackjackFooter;
exports.buildBlackjackEmbed = buildBlackjackEmbed;
exports.buildLotteryEmbed = buildLotteryEmbed;
exports.buildLotteryWinnerDmEmbed = buildLotteryWinnerDmEmbed;
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
const math_1 = require("./math");
const discord_1 = require("./discord");
// ═══════════════════════════════════════════════════════════════════════════
//  Casino embed presentation — Blackjack + Lottery (no game logic)
// ═══════════════════════════════════════════════════════════════════════════
exports.BJ_COLOR = {
    active: 0x5865f2,
    win: 0x57f287,
    loss: 0xed4245,
    blackjack: 0xfee75c,
    push: 0x99aab5,
    surrender: 0x99aab5,
};
exports.LOTTERY_COLOR = 0xfee75c;
const BJ_TITLE = {
    player_turn: '🎰 ┃ YOUR TURN — Make your move!',
    bust: '💥 ┃ BUST — Over 21!',
    blackjack: '⚡ ┃ BLACKJACK — Perfect 21!',
    win: '✅ ┃ YOU WIN — Nicely played!',
    loss: '❌ ┃ DEALER WINS — Better luck next time',
    push: '🤝 ┃ PUSH — It\'s a tie',
    surrender: '🏳️ ┃ FOLD — Half bet returned',
    timed_out: '⏱️ ┃ TIMED OUT — Game expired',
};
const BJ_COLOR_MAP = {
    player_turn: exports.BJ_COLOR.active,
    win: exports.BJ_COLOR.win,
    loss: exports.BJ_COLOR.loss,
    bust: exports.BJ_COLOR.loss,
    blackjack: exports.BJ_COLOR.blackjack,
    push: exports.BJ_COLOR.push,
    surrender: exports.BJ_COLOR.surrender,
    timed_out: exports.BJ_COLOR.loss,
};
const SUIT_EMOJI = {
    H: '♥️',
    D: '♦️',
    C: '♣️',
    S: '♠️',
};
function formatCard(card) {
    const suit = SUIT_EMOJI[card.suit] ?? card.suit;
    return `\`${card.rank}${suit}\``;
}
function formatHiddenCard() {
    return '🂠 `?`';
}
function formatScore(value, revealed) {
    if (!revealed)
        return '`??`';
    return `\`${value}\``;
}
function formatHandLine(hand, hideSecond) {
    return hand
        .map((c, i) => (hideSecond && i === 1 ? formatHiddenCard() : formatCard(c)))
        .join('  ');
}
function dealerHandBlock(hand, score, revealed) {
    const cards = formatHandLine(hand, !revealed);
    return `🎴 **DEALER**\n${cards}\n· Score: ${formatScore(score, revealed)}`;
}
function playerHandBlock(hand, score) {
    const cards = formatHandLine(hand, false);
    return `🪙 **YOU**\n${cards}\n· Score: ${formatScore(score, true)}`;
}
function blackjackFooter(bet) {
    return `🎰 GUHD RIDES Casino  ·  Bet: 💎 ${(0, math_1.formatRC)(bet)} RC`;
}
function applyBlackjackThumbnail(embed) {
    const url = config_1.config.assets.blackjackThumbnail;
    if (url)
        embed.setThumbnail(url);
}
function buildBlackjackEmbed(services, playerHand, dealerHand, bet, showDealer, status = 'player_turn', extras) {
    const playerValue = services.gambling.handValue(playerHand);
    const dealerValue = showDealer
        ? services.gambling.handValue(dealerHand)
        : services.gambling.handValue([dealerHand[0]]);
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(BJ_COLOR_MAP[status] ?? exports.BJ_COLOR.loss)
        .setTitle(BJ_TITLE[status] ?? BJ_TITLE.loss)
        .addFields({
        name: '\u200b',
        value: dealerHandBlock(dealerHand, dealerValue, showDealer),
        inline: true,
    }, {
        name: '\u200b',
        value: playerHandBlock(playerHand, playerValue),
        inline: true,
    })
        .setFooter({ text: blackjackFooter(bet) })
        .setTimestamp();
    applyBlackjackThumbnail(embed);
    if (showDealer && extras?.payout !== undefined) {
        const won = extras.payout.gt(bet);
        const tied = extras.payout.eq(bet);
        const net = won ? extras.payout.sub(bet) : bet.sub(extras.payout);
        const payoutVal = tied
            ? `\`${(0, math_1.formatRC)(extras.payout)} RC\``
            : won
                ? `\`+${(0, math_1.formatRC)(extras.payout)} RC\``
                : `\`${(0, math_1.formatRC)(extras.payout)} RC\``;
        const netLabel = tied ? '💰 **Net**' : won ? '💰 **Payout**' : '📉 **Loss**';
        const netVal = tied
            ? '`Bet returned`'
            : won
                ? `\`+${(0, math_1.formatRC)(net)} RC\``
                : `\`-${(0, math_1.formatRC)(net)} RC\``;
        embed.addFields({ name: discord_1.SPACER, value: discord_1.SPACER, inline: false }, { name: '💰 **Payout**', value: payoutVal, inline: true }, { name: netLabel, value: netVal, inline: true }, ...(extras.newBalance !== undefined
            ? [{ name: '🏦 **Balance**', value: `\`${(0, math_1.formatRC)(extras.newBalance)} RC\``, inline: true }]
            : []));
    }
    return embed;
}
const LOTTERY_FOOTER = '🎰 GUHD RIDES Premium Casino  ·  Earn tickets: /daily · invites · rides';
function applyLotteryThumbnail(embed) {
    const url = config_1.config.assets.lotteryThumbnail;
    if (url)
        embed.setThumbnail(url);
}
function lotteryHowToEnter() {
    return (`\n\n> 📌 **How to earn tickets:**\n` +
        `> • \`/daily\` — Claim your daily ticket\n` +
        `> • Invite friends — Earn per invite\n` +
        `> • Complete rides — Earn per ride\n` +
        `>\n` +
        `> Check your tickets with \`/lottery\``);
}
function lastWinnerLine(input) {
    if (input.lastWinnerUserId) {
        const when = input.lastDrawUnix ? `<t:${input.lastDrawUnix}:D>` : 'recently';
        return `🎉 <@${input.lastWinnerUserId}> won on ${when}`;
    }
    if (input.lastDrawUnix) {
        return `No winner on <t:${input.lastDrawUnix}:D> — next time could be you!`;
    }
    return 'No winner yet — could be YOU!';
}
function buildLotteryEmbed(input) {
    const enabled = input.enabled !== false;
    if (input.mode === 'results') {
        const detail = input.resultsDetail;
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(exports.LOTTERY_COLOR)
            .setTitle('🏅 Weekly Lottery Results')
            .setTimestamp()
            .setFooter({ text: LOTTERY_FOOTER });
        if (detail.winnerUserId) {
            embed.setDescription(`> 🌟 **Grand Prize: ${input.prizeLabel}** 🌟\n\n` +
                `>>> ⚡ **WE HAVE A WINNER!** ⚡\n\n` +
                `🎉 <@${detail.winnerUserId}> takes home **${input.prizeLabel}**!\n` +
                `👥 **${detail.participants}** entrants · 🎫 **${detail.totalTickets.toLocaleString()}** tickets\n\n` +
                `_Tickets reset for the new week — earn more and try again!_`);
        }
        else {
            embed.setDescription(`>>> ⚡ **No winner this week** ⚡\n\n` +
                `No tickets were entered — the pot rolls over to a fresh week!\n\n` +
                `_Earn tickets with \`/daily\`, invites, and completed rides._`);
        }
        applyLotteryThumbnail(embed);
        return embed;
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(enabled ? exports.LOTTERY_COLOR : 0x99aab5)
        .setTitle('🎟️  GUHD RIDES WEEKLY LOTTERY')
        .setDescription(enabled
        ? `> 🌟 **Grand Prize: ${input.prizeLabel}** 🌟\n\n>>> ⚡ **JACKPOT IS LIVE** ⚡ — Enter now for your chance to win!`
        : `> _The lottery is currently paused by staff._`)
        .addFields({ name: '🎫 **Tickets in Pot**', value: `\`${input.totalTickets.toLocaleString()}\``, inline: true }, { name: '👥 **Entrants**', value: `\`${input.participants}\``, inline: true }, { name: discord_1.SPACER, value: discord_1.SPACER, inline: true }, { name: discord_1.SPACER, value: discord_1.SPACER, inline: false }, { name: '🏆 **Grand Prize**', value: `\`🚗  ${input.prizeLabel}\``, inline: false }, { name: discord_1.SPACER, value: discord_1.SPACER, inline: false }, ...(input.nextDrawUnix
        ? [{ name: '⏰ **Next Draw**', value: `<t:${input.nextDrawUnix}:R>  ·  <t:${input.nextDrawUnix}:F>`, inline: false }]
        : []), { name: discord_1.SPACER, value: discord_1.SPACER, inline: false }, { name: '🏅 **Last Winner**', value: lastWinnerLine(input), inline: false })
        .setFooter({ text: LOTTERY_FOOTER })
        .setTimestamp();
    if (input.mode === 'personal' && input.yourTickets !== undefined) {
        embed.addFields({ name: discord_1.SPACER, value: discord_1.SPACER, inline: false }, { name: '🎟️ **Your Tickets**', value: `\`${input.yourTickets}\``, inline: true }, { name: '📊 **Your Odds**', value: `\`${input.yourOdds ?? '0.0'}%\``, inline: true }, { name: discord_1.SPACER, value: discord_1.SPACER, inline: true });
    }
    if (enabled) {
        embed.setDescription((embed.data.description ?? '') + lotteryHowToEnter());
    }
    applyLotteryThumbnail(embed);
    return embed;
}
function buildLotteryWinnerDmEmbed(prizeLabel) {
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(exports.LOTTERY_COLOR)
        .setTitle('🎟️  YOU WON THE WEEKLY LOTTERY!')
        .setDescription(`>>> ⚡ **JACKPOT!** ⚡\n\n` +
        `🏆 **Grand Prize:** \`🚗  ${prizeLabel}\`\n\n` +
        `_Your reward is in your wallet — apply it during \`/book\` on your next ride!_\n` +
        `Check with \`/rewards\`.`)
        .setFooter({ text: LOTTERY_FOOTER })
        .setTimestamp();
    applyLotteryThumbnail(embed);
    return embed;
}
