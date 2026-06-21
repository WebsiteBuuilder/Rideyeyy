"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.blackjackData = exports.diceData = exports.coinflipData = void 0;
exports.handleCoinflip = handleCoinflip;
exports.handleDice = handleDice;
exports.handleBlackjack = handleBlackjack;
exports.handleBlackjackButton = handleBlackjackButton;
const discord_js_1 = require("discord.js");
const decimal_js_1 = __importDefault(require("decimal.js"));
const EconomyService_1 = require("../services/EconomyService");
const math_1 = require("../utils/math");
const discord_1 = require("../utils/discord");
const config_1 = require("../config");
// ═══════════════════════════════════════════════════════════════════════════
//  BLACKJACK — Premium Casino Experience
// ═══════════════════════════════════════════════════════════════════════════
// ---------------------------------------------------------------------------
// Card Display Helpers
// ---------------------------------------------------------------------------
const SUIT_ICON = { H: '♥', D: '♦', C: '♣', S: '♠' };
const DICE_FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
function cardLabel(card) {
    return `${card.rank}${SUIT_ICON[card.suit] ?? card.suit}`;
}
/** Premium card tile with clean styling */
function cardTile(card) {
    return `\`[ ${cardLabel(card)} ]\``;
}
const HIDDEN_TILE = '`[ ?? ]`';
function renderHand(hand, hideSecond = false) {
    return hand
        .map((c, i) => (hideSecond && i === 1 ? HIDDEN_TILE : cardTile(c)))
        .join('  ');
}
function valueLabel(v, show) {
    if (!show)
        return '**??**';
    if (v === 21)
        return `**21** \`${discord_1.ICON.jackpot} BLACKJACK\``;
    if (v > 21)
        return `**${v}** \`${discord_1.ICON.loss} BUST\``;
    return `**${v}**`;
}
// ---------------------------------------------------------------------------
// Blackjack Result Metadata
// ---------------------------------------------------------------------------
const BJ_META = {
    blackjack: { color: discord_1.COLOR.JACKPOT, title: 'BLACKJACK!', banner: `${discord_1.ICON.jackpot}  NATURAL 21  ${discord_1.ICON.jackpot}`, style: 'jackpot' },
    win: { color: discord_1.COLOR.WIN, title: 'YOU WIN', banner: `${discord_1.ICON.win}  WINNER  ${discord_1.ICON.win}`, style: 'win' },
    push: { color: discord_1.COLOR.NEUTRAL, title: 'PUSH', banner: '≈  TIE GAME  ≈', style: 'neutral' },
    loss: { color: discord_1.COLOR.LOSS, title: 'DEALER WINS', banner: `${discord_1.ICON.loss}  LOSS  ${discord_1.ICON.loss}`, style: 'loss' },
    bust: { color: discord_1.COLOR.LOSS, title: 'BUST', banner: `${discord_1.ICON.loss}  OVER 21  ${discord_1.ICON.loss}`, style: 'loss' },
    surrender: { color: discord_1.COLOR.MUTED, title: 'SURRENDERED', banner: `${discord_1.ICON.fold}  FOLDED  ${discord_1.ICON.fold}`, style: 'neutral' },
    timed_out: { color: discord_1.COLOR.LOSS, title: 'TIMED OUT', banner: `${discord_1.ICON.time}  EXPIRED  ${discord_1.ICON.time}`, style: 'loss' },
    player_turn: { color: discord_1.COLOR.ACTIVE, title: 'BLACKJACK', banner: `${discord_1.ICON.cards}  YOUR TURN  ${discord_1.ICON.cards}`, style: 'info' },
};
// ---------------------------------------------------------------------------
// Blackjack Embed Builder
// ---------------------------------------------------------------------------
function buildBlackjackEmbed(services, playerHand, dealerHand, bet, showDealer, status = 'player_turn', extras) {
    const meta = BJ_META[status] ?? BJ_META['loss'];
    const playerValue = services.gambling.handValue(playerHand);
    const dealerValue = showDealer
        ? services.gambling.handValue(dealerHand)
        : services.gambling.handValue([dealerHand[0]]);
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(meta.color)
        .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
        .setTitle(meta.title)
        .setDescription((0, discord_1.statusBanner)(meta.banner, meta.style) +
        `\n${discord_1.LINE}`)
        .addFields({
        name: `${discord_1.ICON.cards} DEALER`,
        value: `${renderHand(dealerHand, !showDealer)}\n${valueLabel(dealerValue, showDealer)}`,
        inline: true,
    }, {
        name: `${discord_1.ICON.chip} YOU`,
        value: `${renderHand(playerHand)}\n${valueLabel(playerValue, true)}`,
        inline: true,
    })
        .setFooter({ text: `Bet: ${discord_1.ICON.coin} ${(0, math_1.formatRC)(bet)}  ·  ${discord_1.BRAND.name}` })
        .setTimestamp();
    // Add payout info for completed games
    if (showDealer && extras?.payout !== undefined) {
        const won = extras.payout.gt(bet);
        const tied = extras.payout.eq(bet);
        const net = won ? extras.payout.sub(bet) : bet.sub(extras.payout);
        const netDisplay = tied
            ? '`BET RETURNED`'
            : won
                ? `\`+ ${(0, math_1.formatRC)(net)}\` ${discord_1.ICON.up}`
                : `\`- ${(0, math_1.formatRC)(net)}\` ${discord_1.ICON.down}`;
        embed.addFields({ name: discord_1.SPACER, value: discord_1.THIN_LINE, inline: false }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)('PAYOUT', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(extras.payout)}`), inline: true }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)(won ? 'PROFIT' : tied ? 'NET' : 'LOSS', netDisplay), inline: true }, ...(extras.newBalance !== undefined
            ? [{ name: discord_1.SPACER, value: (0, discord_1.statBlock)('BALANCE', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(extras.newBalance)}`), inline: true }]
            : []));
    }
    return embed;
}
// ---------------------------------------------------------------------------
// Blackjack Buttons — Modern Casino Style
// ---------------------------------------------------------------------------
function buildBlackjackButtons(gameId, canDouble) {
    const btns = [
        new discord_js_1.ButtonBuilder()
            .setCustomId(`bj:hit:${gameId}`)
            .setLabel(`${discord_1.ICON.hit} HIT`)
            .setStyle(discord_js_1.ButtonStyle.Primary),
        new discord_js_1.ButtonBuilder()
            .setCustomId(`bj:stand:${gameId}`)
            .setLabel(`${discord_1.ICON.stand} STAND`)
            .setStyle(discord_js_1.ButtonStyle.Success),
    ];
    if (canDouble) {
        btns.push(new discord_js_1.ButtonBuilder()
            .setCustomId(`bj:double:${gameId}`)
            .setLabel(`${discord_1.ICON.double} DOUBLE`)
            .setStyle(discord_js_1.ButtonStyle.Secondary));
    }
    btns.push(new discord_js_1.ButtonBuilder()
        .setCustomId(`bj:surrender:${gameId}`)
        .setLabel(`${discord_1.ICON.fold} FOLD`)
        .setStyle(discord_js_1.ButtonStyle.Danger));
    return new discord_js_1.ActionRowBuilder().addComponents(...btns.slice(0, 5));
}
// ═══════════════════════════════════════════════════════════════════════════
//  COMMAND DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════
exports.coinflipData = new discord_js_1.SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Flip a coin for Route Cash')
    .addStringOption((o) => o.setName('amount').setDescription('Bet amount').setRequired(true))
    .addStringOption((o) => o
    .setName('choice')
    .setDescription('Heads or tails')
    .setRequired(true)
    .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' }));
exports.diceData = new discord_js_1.SlashCommandBuilder()
    .setName('dice')
    .setDescription('Roll the dice for Route Cash')
    .addStringOption((o) => o.setName('amount').setDescription('Bet amount').setRequired(true))
    .addIntegerOption((o) => o.setName('target').setDescription('Target number 1-6').setMinValue(1).setMaxValue(6).setRequired(true));
exports.blackjackData = new discord_js_1.SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Play a hand of blackjack')
    .addStringOption((o) => o.setName('bet').setDescription('Bet amount').setRequired(true));
// ═══════════════════════════════════════════════════════════════════════════
//  COINFLIP — Quick Casino Game
// ═══════════════════════════════════════════════════════════════════════════
async function handleCoinflip(interaction, services) {
    const cd = (0, discord_1.checkCooldown)(interaction.user.id, 'coinflip', config_1.config.limits.gambleCooldownMs);
    if (cd) {
        await (0, discord_1.ephemeralReply)(interaction, `${discord_1.ICON.time} Slow down — wait **${cd}s** before flipping again.`);
        return;
    }
    try {
        const amount = (0, math_1.parseAmount)(interaction.options.getString('amount', true));
        const choice = interaction.options.getString('choice', true);
        await services.user.ensureUser(interaction.user.id);
        const result = await services.gambling.coinflip(interaction.user.id, amount, choice);
        const balance = await services.economy.getBalance(interaction.user.id);
        const won = result.won;
        const coinIcon = result.outcome === 'heads' ? '🪙' : '⚪';
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(won ? discord_1.COLOR.WIN : discord_1.COLOR.LOSS)
            .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
            .setTitle(won ? 'WINNER!' : 'LOSS')
            .setDescription((0, discord_1.statusBanner)(won ? `${discord_1.ICON.win}  YOU WIN  ${discord_1.ICON.win}` : `${discord_1.ICON.loss}  MISS  ${discord_1.ICON.loss}`, won ? 'win' : 'loss') +
            `\n## ${coinIcon} ${result.outcome.toUpperCase()}\n` +
            `${discord_1.LINE}\n` +
            `You bet \`${discord_1.ICON.coin} ${(0, math_1.formatRC)(amount)}\` on **${choice.toUpperCase()}**`)
            .addFields({ name: discord_1.SPACER, value: (0, discord_1.statBlock)('PAYOUT', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(result.payout)}`), inline: true }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)(won ? 'PROFIT' : 'LOSS', won ? `\`+ ${(0, math_1.formatRC)(result.net)}\` ${discord_1.ICON.up}` : `\`- ${(0, math_1.formatRC)(result.net)}\` ${discord_1.ICON.down}`), inline: true }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)('BALANCE', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(balance)}`), inline: true })
            .setTimestamp()
            .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` });
        await interaction.reply({ embeds: [embed] });
    }
    catch (err) {
        if (err instanceof EconomyService_1.InsufficientFundsError) {
            await (0, discord_1.ephemeralReply)(interaction, `${discord_1.ICON.loss} Not enough Route Cash for that bet.`);
            return;
        }
        throw err;
    }
}
// ═══════════════════════════════════════════════════════════════════════════
//  DICE — Target Number Game
// ═══════════════════════════════════════════════════════════════════════════
async function handleDice(interaction, services) {
    const cd = (0, discord_1.checkCooldown)(interaction.user.id, 'dice', config_1.config.limits.gambleCooldownMs);
    if (cd) {
        await (0, discord_1.ephemeralReply)(interaction, `${discord_1.ICON.time} Slow down — wait **${cd}s** before rolling again.`);
        return;
    }
    try {
        const amount = (0, math_1.parseAmount)(interaction.options.getString('amount', true));
        const target = interaction.options.getInteger('target', true);
        await services.user.ensureUser(interaction.user.id);
        const result = await services.gambling.dice(interaction.user.id, amount, target);
        const balance = await services.economy.getBalance(interaction.user.id);
        const isExact = result.roll === target;
        const isAdjacent = !isExact && result.net.gt(0);
        const color = isExact ? discord_1.COLOR.JACKPOT : isAdjacent ? discord_1.COLOR.WIN : discord_1.COLOR.LOSS;
        const won = result.net.gt(0);
        const rolledFace = DICE_FACE[result.roll] ?? `${result.roll}`;
        const statusText = isExact ? `${discord_1.ICON.jackpot}  JACKPOT  ${discord_1.ICON.jackpot}` : isAdjacent ? `${discord_1.ICON.win}  CLOSE  ${discord_1.ICON.win}` : `${discord_1.ICON.loss}  MISS  ${discord_1.ICON.loss}`;
        const style = isExact ? 'jackpot' : isAdjacent ? 'win' : 'loss';
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(color)
            .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
            .setTitle(isExact ? 'JACKPOT!' : isAdjacent ? 'CLOSE!' : 'MISS')
            .setDescription((0, discord_1.statusBanner)(statusText, style) +
            `\n## ${rolledFace}  You rolled **${result.roll}**\n` +
            `${discord_1.LINE}\n` +
            `Target: **${target}** for \`${discord_1.ICON.coin} ${(0, math_1.formatRC)(amount)}\``)
            .addFields({ name: discord_1.SPACER, value: (0, discord_1.statBlock)('PAYOUT', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(result.payout)}`), inline: true }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)(won ? 'PROFIT' : 'LOSS', won ? `\`+ ${(0, math_1.formatRC)(result.net)}\` ${discord_1.ICON.up}` : `\`- ${(0, math_1.formatRC)(result.net)}\` ${discord_1.ICON.down}`), inline: true }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)('BALANCE', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(balance)}`), inline: true })
            .setTimestamp()
            .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` });
        await interaction.reply({ embeds: [embed] });
    }
    catch (err) {
        if (err instanceof EconomyService_1.InsufficientFundsError) {
            await (0, discord_1.ephemeralReply)(interaction, `${discord_1.ICON.loss} Not enough Route Cash for that bet.`);
            return;
        }
        throw err;
    }
}
// ═══════════════════════════════════════════════════════════════════════════
//  BLACKJACK — Premium Card Game
// ═══════════════════════════════════════════════════════════════════════════
async function handleBlackjack(interaction, services) {
    try {
        const bet = (0, math_1.parseAmount)(interaction.options.getString('bet', true));
        await services.user.ensureUser(interaction.user.id);
        const game = await services.gambling.startBlackjack(interaction.user.id, bet);
        const isCompleted = game.status === 'completed';
        const balance = isCompleted ? await services.economy.getBalance(interaction.user.id) : undefined;
        const embed = buildBlackjackEmbed(services, game.playerHand, game.dealerHand, bet, isCompleted, isCompleted ? 'blackjack' : 'player_turn', isCompleted && balance !== undefined
            ? { newBalance: balance }
            : undefined);
        const row = game.status === 'player_turn'
            ? buildBlackjackButtons(game.gameId, game.canDouble)
            : null;
        await interaction.reply({ embeds: [embed], components: row ? [row] : [], ephemeral: true });
    }
    catch (err) {
        if (err instanceof EconomyService_1.InsufficientFundsError) {
            await (0, discord_1.ephemeralReply)(interaction, `${discord_1.ICON.loss} Not enough Route Cash for that bet.`);
            return;
        }
        await (0, discord_1.ephemeralReply)(interaction, err instanceof Error ? err.message : 'Failed to start game.');
    }
}
// ═══════════════════════════════════════════════════════════════════════════
//  BLACKJACK BUTTON HANDLERS
// ═══════════════════════════════════════════════════════════════════════════
async function handleBlackjackButton(interaction, services) {
    const [, action, gameId] = interaction.customId.split(':');
    if (!action || !gameId)
        return;
    try {
        if (action === 'hit') {
            const { playerHand, busted } = await services.gambling.hit(gameId, interaction.user.id);
            const game = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
            const bet = new decimal_js_1.default(game?.bet_amount ?? 0);
            if (busted) {
                const balance = await services.economy.getBalance(interaction.user.id);
                const embed = buildBlackjackEmbed(services, playerHand, game?.dealer_hand_json ?? [], bet, true, 'bust', { payout: new decimal_js_1.default(0), newBalance: balance });
                await interaction.update({ embeds: [embed], components: [] });
                return;
            }
            const canDouble = game ? game.player_hand_json.length === 2 && !game.doubled : false;
            const embed = buildBlackjackEmbed(services, playerHand, game.dealer_hand_json, bet, false);
            await interaction.update({ embeds: [embed], components: [buildBlackjackButtons(gameId, canDouble)] });
        }
        else if (action === 'stand') {
            const result = await services.gambling.stand(gameId, interaction.user.id);
            const game = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
            const bet = new decimal_js_1.default(game?.bet_amount ?? 0);
            const balance = await services.economy.getBalance(interaction.user.id);
            const embed = buildBlackjackEmbed(services, result.playerHand, result.dealerHand, bet, true, result.result, { payout: result.payout, newBalance: balance });
            await interaction.update({ embeds: [embed], components: [] });
        }
        else if (action === 'double') {
            const result = await services.gambling.doubleDown(gameId, interaction.user.id);
            const game = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
            const bet = new decimal_js_1.default(game?.bet_amount ?? 0);
            const balance = await services.economy.getBalance(interaction.user.id);
            const status = result.busted ? 'bust' : result.result;
            const embed = buildBlackjackEmbed(services, result.playerHand, result.dealerHand ?? game?.dealer_hand_json ?? [], bet, true, status, { payout: result.payout ?? new decimal_js_1.default(0), newBalance: balance });
            await interaction.update({ embeds: [embed], components: [] });
        }
        else if (action === 'surrender') {
            await services.gambling.surrender(gameId, interaction.user.id);
            const balance = await services.economy.getBalance(interaction.user.id);
            const game = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
            const bet = new decimal_js_1.default(game?.bet_amount ?? 0);
            const embed = new discord_js_1.EmbedBuilder()
                .setColor(discord_1.COLOR.MUTED)
                .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
                .setTitle('SURRENDERED')
                .setDescription((0, discord_1.statusBanner)(`${discord_1.ICON.fold}  FOLDED EARLY  ${discord_1.ICON.fold}`, 'neutral') +
                `\nHalf your bet has been returned.\n` +
                `${discord_1.LINE}`)
                .addFields({ name: discord_1.SPACER, value: (0, discord_1.statBlock)('BET', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(bet)}`), inline: true }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)('RETURNED', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(bet.div(2))}`), inline: true }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)('BALANCE', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(balance)}`), inline: true })
                .setTimestamp()
                .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` });
            await interaction.update({ embeds: [embed], components: [] });
        }
    }
    catch (err) {
        if (err instanceof EconomyService_1.InsufficientFundsError) {
            await interaction.reply({ content: `${discord_1.ICON.loss} Not enough Route Cash to double down.`, ephemeral: true });
            return;
        }
        const msg = err instanceof Error ? err.message : 'Action failed.';
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: msg, ephemeral: true });
        }
        else {
            await interaction.reply({ content: msg, ephemeral: true });
        }
    }
}
