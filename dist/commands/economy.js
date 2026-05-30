"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inventoryData = exports.leaderboardData = exports.rankData = exports.statsData = exports.dailyData = exports.tipData = exports.payData = exports.data = void 0;
exports.handleBalance = handleBalance;
exports.handlePay = handlePay;
exports.handleTip = handleTip;
exports.handleDaily = handleDaily;
exports.handleStats = handleStats;
exports.handleRank = handleRank;
exports.handleLeaderboard = handleLeaderboard;
exports.handleInventory = handleInventory;
const discord_js_1 = require("discord.js");
const EconomyService_1 = require("../services/EconomyService");
const math_1 = require("../utils/math");
const discord_1 = require("../utils/discord");
const config_1 = require("../config");
// ═══════════════════════════════════════════════════════════════════════════
//  ECONOMY COMMANDS
// ═══════════════════════════════════════════════════════════════════════════
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your Route Cash balance')
    .addUserOption((o) => o.setName('user').setDescription('View another user balance (optional)').setRequired(false));
exports.payData = new discord_js_1.SlashCommandBuilder()
    .setName('pay')
    .setDescription('Transfer Route Cash to another user')
    .addUserOption((o) => o.setName('user').setDescription('Recipient').setRequired(true))
    .addStringOption((o) => o.setName('amount').setDescription('Amount of RC').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for transfer').setRequired(false));
exports.tipData = new discord_js_1.SlashCommandBuilder()
    .setName('tip')
    .setDescription('Tip Route Cash to another user (public)')
    .addUserOption((o) => o.setName('user').setDescription('Recipient').setRequired(true))
    .addStringOption((o) => o.setName('amount').setDescription('Amount of RC').setRequired(true));
exports.dailyData = new discord_js_1.SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily Route Cash reward');
exports.statsData = new discord_js_1.SlashCommandBuilder()
    .setName('stats')
    .setDescription('View your Route Cash stats and activity')
    .addUserOption((o) => o.setName('user').setDescription('View another user stats (optional)').setRequired(false));
exports.rankData = new discord_js_1.SlashCommandBuilder()
    .setName('rank')
    .setDescription('View your leaderboard rank')
    .addUserOption((o) => o.setName('user').setDescription('View another user rank (optional)').setRequired(false));
exports.leaderboardData = new discord_js_1.SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the top Route Cash holders')
    .addIntegerOption((o) => o.setName('limit').setDescription('Number of users').setMinValue(1).setMaxValue(25).setRequired(false));
exports.inventoryData = new discord_js_1.SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your crate rewards and items');
// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS
// ═══════════════════════════════════════════════════════════════════════════
async function handleBalance(interaction, services) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    await services.user.ensureUser(target.id);
    const balance = await services.economy.getBalance(target.id);
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(discord_1.COLOR.WIN)
        .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
        .setTitle(`${discord_1.ICON.wallet} ${target.username}'s Wallet`)
        .setDescription(`# ${discord_1.ICON.coin} ${(0, math_1.formatRC)(balance)}\n` +
        `${discord_1.LINE}\n` +
        (0, discord_1.statusBanner)('ROUTE CASH BALANCE', 'info'))
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .setTimestamp()
        .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` });
    await interaction.reply({ embeds: [embed], ephemeral: true });
}
async function handlePay(interaction, services) {
    const remaining = (0, discord_1.checkCooldown)(interaction.user.id, 'pay', config_1.config.limits.commandCooldownMs);
    if (remaining) {
        await (0, discord_1.ephemeralReply)(interaction, `${discord_1.ICON.time} Please wait ${remaining}s before using this again.`);
        return;
    }
    const recipient = interaction.options.getUser('user', true);
    const amountStr = interaction.options.getString('amount', true);
    const reason = interaction.options.getString('reason') ?? 'P2P Transfer';
    if (recipient.id === interaction.user.id) {
        await (0, discord_1.ephemeralReply)(interaction, `${discord_1.ICON.loss} You cannot pay yourself.`);
        return;
    }
    try {
        const amount = (0, math_1.parseAmount)(amountStr);
        await services.user.ensureUser(interaction.user.id);
        await services.user.ensureUser(recipient.id);
        await services.economy.transferBalance(interaction.user.id, recipient.id, amount, reason);
        const newBalance = await services.economy.getBalance(interaction.user.id);
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(discord_1.COLOR.WIN)
            .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
            .setTitle(`${discord_1.ICON.check} TRANSFER COMPLETE`)
            .setDescription((0, discord_1.statusBanner)(`${discord_1.ICON.win}  SENT SUCCESSFULLY  ${discord_1.ICON.win}`, 'win') +
            `\n**${discord_1.ICON.coin} ${(0, math_1.formatRC)(amount)}** → <@${recipient.id}>\n` +
            `${discord_1.LINE}`)
            .addFields({ name: discord_1.SPACER, value: (0, discord_1.statBlock)('TO', `<@${recipient.id}>`), inline: true }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)('AMOUNT', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(amount)}`), inline: true }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)('BALANCE', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(newBalance)}`), inline: true })
            .setTimestamp()
            .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` });
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    catch (err) {
        if (err instanceof EconomyService_1.InsufficientFundsError) {
            await (0, discord_1.ephemeralReply)(interaction, `${discord_1.ICON.loss} Insufficient Route Cash for this transfer.`);
            return;
        }
        throw err;
    }
}
async function handleTip(interaction, services) {
    const remaining = (0, discord_1.checkCooldown)(interaction.user.id, 'tip', config_1.config.limits.commandCooldownMs);
    if (remaining) {
        await (0, discord_1.ephemeralReply)(interaction, `${discord_1.ICON.time} Please wait ${remaining}s before using this again.`);
        return;
    }
    const recipient = interaction.options.getUser('user', true);
    const amountStr = interaction.options.getString('amount', true);
    if (recipient.id === interaction.user.id) {
        await (0, discord_1.ephemeralReply)(interaction, `${discord_1.ICON.loss} You cannot tip yourself.`);
        return;
    }
    try {
        const amount = (0, math_1.parseAmount)(amountStr);
        await services.user.ensureUser(interaction.user.id);
        await services.user.ensureUser(recipient.id);
        await services.economy.transferBalance(interaction.user.id, recipient.id, amount, 'Tip');
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(discord_1.COLOR.WIN)
            .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
            .setTitle(`${discord_1.ICON.coins} TIP RECEIVED`)
            .setDescription((0, discord_1.statusBanner)(`${discord_1.ICON.coin}  PUBLIC TIP  ${discord_1.ICON.coin}`, 'info') +
            `\n<@${interaction.user.id}> tipped <@${recipient.id}>\n\n` +
            `# + ${discord_1.ICON.coin} ${(0, math_1.formatRC)(amount)}\n` +
            `${discord_1.LINE}`)
            .setThumbnail(recipient.displayAvatarURL({ size: 256 }))
            .setTimestamp()
            .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` });
        await interaction.reply({ embeds: [embed] });
    }
    catch (err) {
        if (err instanceof EconomyService_1.InsufficientFundsError) {
            await (0, discord_1.ephemeralReply)(interaction, `${discord_1.ICON.loss} Insufficient Route Cash for this tip.`);
            return;
        }
        throw err;
    }
}
async function handleDaily(interaction, services) {
    await services.user.ensureUser(interaction.user.id);
    try {
        const { amount } = await services.economy.claimDaily(interaction.user.id, config_1.config.daily.reward, config_1.config.daily.cooldownHours);
        const newBalance = await services.economy.getBalance(interaction.user.id);
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(discord_1.COLOR.WIN)
            .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
            .setTitle(`${discord_1.ICON.check} DAILY CLAIMED`)
            .setDescription((0, discord_1.statusBanner)(`${discord_1.ICON.win}  REWARD COLLECTED  ${discord_1.ICON.win}`, 'win') +
            `\n# + ${discord_1.ICON.coin} ${(0, math_1.formatRC)(amount)}\n` +
            `${discord_1.LINE}`)
            .addFields({ name: discord_1.SPACER, value: (0, discord_1.statBlock)('BALANCE', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(newBalance)}`), inline: true })
            .setTimestamp()
            .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` });
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    catch (err) {
        await (0, discord_1.ephemeralReply)(interaction, err instanceof Error ? err.message : 'Failed to claim daily.');
    }
}
async function handleStats(interaction, services) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    await services.user.ensureUser(target.id);
    const balance = await services.economy.getBalance(target.id);
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(discord_1.COLOR.WIN)
        .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
        .setTitle(`${target.username.toUpperCase()}`)
        .setDescription((0, discord_1.statusBanner)('PLAYER STATISTICS', 'info') +
        `\n# ${discord_1.ICON.coin} ${(0, math_1.formatRC)(balance)}\n` +
        `${discord_1.LINE}`)
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .setTimestamp()
        .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` });
    await interaction.reply({ embeds: [embed], ephemeral: true });
}
async function handleRank(interaction, services) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    await services.user.ensureUser(target.id);
    const balance = await services.economy.getBalance(target.id);
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(discord_1.COLOR.WIN)
        .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
        .setTitle(`${discord_1.ICON.chip} LEADERBOARD RANK`)
        .setDescription((0, discord_1.statusBanner)('RANKING', 'info') +
        `\n# #1\n` +
        `${discord_1.LINE}`)
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .addFields({ name: discord_1.SPACER, value: (0, discord_1.statBlock)('BALANCE', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(balance)}`), inline: true })
        .setTimestamp()
        .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` });
    await interaction.reply({ embeds: [embed], ephemeral: true });
}
async function handleLeaderboard(interaction, services) {
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(discord_1.COLOR.JACKPOT)
        .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
        .setTitle(`${discord_1.ICON.chip} LEADERBOARD`)
        .setDescription((0, discord_1.statusBanner)(`${discord_1.ICON.jackpot}  TOP RICHEST  ${discord_1.ICON.jackpot}`, 'jackpot') +
        `\n${discord_1.LINE}\n` +
        `Leaderboard coming soon!`)
        .setTimestamp()
        .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` });
    await interaction.reply({ embeds: [embed], ephemeral: true });
}
async function handleInventory(interaction, services) {
    await services.user.ensureUser(interaction.user.id);
    const balance = await services.economy.getBalance(interaction.user.id);
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(discord_1.COLOR.NEUTRAL)
        .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
        .setTitle(`${discord_1.ICON.chip} INVENTORY`)
        .setDescription((0, discord_1.statusBanner)('EMPTY STASH', 'neutral') +
        `\n${discord_1.LINE}\n` +
        `Open a crate with \`/crate\` to start collecting!`)
        .addFields({ name: discord_1.SPACER, value: (0, discord_1.statBlock)('BALANCE', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(balance)}`), inline: true })
        .setTimestamp()
        .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` });
    await interaction.reply({ embeds: [embed], ephemeral: true });
}
//# sourceMappingURL=economy.js.map