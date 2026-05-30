"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blackjackData = exports.diceData = exports.coinflipData = void 0;
exports.handleCoinflip = handleCoinflip;
exports.handleDice = handleDice;
exports.handleBlackjack = handleBlackjack;
exports.handleBlackjackButton = handleBlackjackButton;
const discord_js_1 = require("discord.js");
const EconomyService_1 = require("../services/EconomyService");
const math_1 = require("../utils/math");
const discord_1 = require("../utils/discord");
const config_1 = require("../config");
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
//  COINFLIP
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
//  DICE
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
        const statusText = isExact ? `${discord_1.ICON.jackpot}  JACKPOT  ${discord_1.ICON.jackpot}` : isAdjacent ? `${discord_1.ICON.win}  CLOSE  ${discord_1.ICON.win}` : `${discord_1.ICON.loss}  MISS  ${discord_1.ICON.loss}`;
        const style = isExact ? 'jackpot' : isAdjacent ? 'win' : 'loss';
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(color)
            .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
            .setTitle(isExact ? 'JACKPOT!' : isAdjacent ? 'CLOSE!' : 'MISS')
            .setDescription((0, discord_1.statusBanner)(statusText, style) +
            `\n## You rolled **${result.roll}**\n` +
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
//  BLACKJACK
// ═══════════════════════════════════════════════════════════════════════════
async function handleBlackjack(interaction, services) {
    try {
        const bet = (0, math_1.parseAmount)(interaction.options.getString('bet', true));
        await services.user.ensureUser(interaction.user.id);
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(discord_1.COLOR.WIN)
            .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
            .setTitle('BLACKJACK')
            .setDescription(`Starting game with bet: \`${discord_1.ICON.coin} ${(0, math_1.formatRC)(bet)}\``)
            .setTimestamp()
            .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` });
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    catch (err) {
        if (err instanceof EconomyService_1.InsufficientFundsError) {
            await (0, discord_1.ephemeralReply)(interaction, `${discord_1.ICON.loss} Not enough Route Cash for that bet.`);
            return;
        }
        await (0, discord_1.ephemeralReply)(interaction, err instanceof Error ? err.message : 'Failed to start game.');
    }
}
async function handleBlackjackButton(interaction, services) {
    await (0, discord_1.ephemeralReply)(interaction, 'Blackjack button handler not yet implemented.');
}
//# sourceMappingURL=gambling.js.map