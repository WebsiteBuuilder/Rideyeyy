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
const casinoEmbeds_1 = require("../utils/casinoEmbeds");
const config_1 = require("../config");
// ═══════════════════════════════════════════════════════════════════════════
//  BLACKJACK — Premium Casino Experience
// ═══════════════════════════════════════════════════════════════════════════
const DICE_FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
// ---------------------------------------------------------------------------
// Blackjack Buttons — Modern Casino Style
// ---------------------------------------------------------------------------
function buildBlackjackButtons(gameId, canDouble, ownerId) {
    const btns = [
        new discord_js_1.ButtonBuilder()
            .setCustomId(`bj:hit:${gameId}:${ownerId}`)
            .setLabel('HIT')
            .setEmoji('🃏')
            .setStyle(discord_js_1.ButtonStyle.Primary),
        new discord_js_1.ButtonBuilder()
            .setCustomId(`bj:stand:${gameId}:${ownerId}`)
            .setLabel('STAND')
            .setEmoji('🛑')
            .setStyle(discord_js_1.ButtonStyle.Success),
    ];
    if (canDouble) {
        btns.push(new discord_js_1.ButtonBuilder()
            .setCustomId(`bj:double:${gameId}:${ownerId}`)
            .setLabel('DOUBLE')
            .setEmoji('⬆️')
            .setStyle(discord_js_1.ButtonStyle.Primary));
    }
    btns.push(new discord_js_1.ButtonBuilder()
        .setCustomId(`bj:surrender:${gameId}:${ownerId}`)
        .setLabel('FOLD')
        .setEmoji('🏳️')
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
    if (!(await (0, discord_1.enforceCasinoChannel)(interaction)))
        return;
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
    if (!(await (0, discord_1.enforceCasinoChannel)(interaction)))
        return;
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
    if (!(await (0, discord_1.enforceCasinoChannel)(interaction)))
        return;
    try {
        const bet = (0, math_1.parseAmount)(interaction.options.getString('bet', true));
        await services.user.ensureUser(interaction.user.id);
        const game = await services.gambling.startBlackjack(interaction.user.id, bet);
        const isCompleted = game.status === 'completed';
        const balance = isCompleted ? await services.economy.getBalance(interaction.user.id) : undefined;
        const embed = (0, casinoEmbeds_1.buildBlackjackEmbed)(services, game.playerHand, game.dealerHand, bet, isCompleted, isCompleted ? 'blackjack' : 'player_turn', isCompleted && balance !== undefined
            ? { newBalance: balance }
            : undefined);
        const row = game.status === 'player_turn'
            ? buildBlackjackButtons(game.gameId, game.canDouble, interaction.user.id)
            : null;
        await interaction.reply({ embeds: [embed], components: row ? [row] : [] });
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
    const [, action, gameId, ownerId] = interaction.customId.split(':');
    if (!action || !gameId)
        return;
    // The game message is public — only the player who started it may act.
    if (ownerId && ownerId !== interaction.user.id) {
        await interaction.reply({
            content: `${discord_1.ICON.cross} This isn't your blackjack game — start your own with \`/blackjack\`.`,
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    try {
        if (action === 'hit') {
            const { playerHand, busted } = await services.gambling.hit(gameId, interaction.user.id);
            const game = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
            const bet = new decimal_js_1.default(game?.bet_amount ?? 0);
            if (busted) {
                const balance = await services.economy.getBalance(interaction.user.id);
                const embed = (0, casinoEmbeds_1.buildBlackjackEmbed)(services, playerHand, game?.dealer_hand_json ?? [], bet, true, 'bust', { payout: new decimal_js_1.default(0), newBalance: balance });
                await interaction.update({ embeds: [embed], components: [] });
                return;
            }
            const canDouble = game ? game.player_hand_json.length === 2 && !game.doubled : false;
            const embed = (0, casinoEmbeds_1.buildBlackjackEmbed)(services, playerHand, game.dealer_hand_json, bet, false);
            await interaction.update({ embeds: [embed], components: [buildBlackjackButtons(gameId, canDouble, interaction.user.id)] });
        }
        else if (action === 'stand') {
            const result = await services.gambling.stand(gameId, interaction.user.id);
            const game = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
            const bet = new decimal_js_1.default(game?.bet_amount ?? 0);
            const balance = await services.economy.getBalance(interaction.user.id);
            const embed = (0, casinoEmbeds_1.buildBlackjackEmbed)(services, result.playerHand, result.dealerHand, bet, true, result.result, { payout: result.payout, newBalance: balance });
            await interaction.update({ embeds: [embed], components: [] });
        }
        else if (action === 'double') {
            const result = await services.gambling.doubleDown(gameId, interaction.user.id);
            const game = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
            const bet = new decimal_js_1.default(game?.bet_amount ?? 0);
            const balance = await services.economy.getBalance(interaction.user.id);
            const status = (result.busted ? 'bust' : result.result);
            const embed = (0, casinoEmbeds_1.buildBlackjackEmbed)(services, result.playerHand, result.dealerHand ?? game?.dealer_hand_json ?? [], bet, true, status, { payout: result.payout ?? new decimal_js_1.default(0), newBalance: balance });
            await interaction.update({ embeds: [embed], components: [] });
        }
        else if (action === 'surrender') {
            await services.gambling.surrender(gameId, interaction.user.id);
            const balance = await services.economy.getBalance(interaction.user.id);
            const game = await services.gambling.getBlackjackGame(gameId, interaction.user.id);
            const bet = new decimal_js_1.default(game?.bet_amount ?? 0);
            const returned = bet.div(2);
            const embed = (0, casinoEmbeds_1.buildBlackjackEmbed)(services, game?.player_hand_json ?? [], game?.dealer_hand_json ?? [], bet, true, 'surrender', { payout: returned, newBalance: balance });
            await interaction.update({ embeds: [embed], components: [] });
        }
    }
    catch (err) {
        if (err instanceof EconomyService_1.InsufficientFundsError) {
            await interaction.reply({ content: `${discord_1.ICON.loss} Not enough Route Cash to double down.`, flags: discord_js_1.MessageFlags.Ephemeral });
            return;
        }
        const msg = err instanceof Error ? err.message : 'Action failed.';
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: msg, flags: discord_js_1.MessageFlags.Ephemeral });
        }
        else {
            await interaction.reply({ content: msg, flags: discord_js_1.MessageFlags.Ephemeral });
        }
    }
}
