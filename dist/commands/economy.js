"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inventoryData = exports.leaderboardData = exports.transactionsData = exports.rankData = exports.statsData = exports.dailyData = exports.tipData = exports.payData = exports.data = void 0;
exports.handleBalance = handleBalance;
exports.handlePay = handlePay;
exports.handleTip = handleTip;
exports.handleDaily = handleDaily;
exports.handleStats = handleStats;
exports.handleRank = handleRank;
exports.handleTransactions = handleTransactions;
exports.handleLeaderboard = handleLeaderboard;
exports.handleInventory = handleInventory;
const discord_js_1 = require("discord.js");
const EconomyService_1 = require("../services/EconomyService");
const math_1 = require("../utils/math");
const discord_1 = require("../utils/discord");
const config_1 = require("../config");
const constants_1 = require("../utils/constants");
// ═══════════════════════════════════════════════════════════════════════════
//  ECONOMY COMMANDS — Premium Casino Economy System
// ═══════════════════════════════════════════════════════════════════════════
// ---------------------------------------------------------------------------
// Command Definitions
// ---------------------------------------------------------------------------
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
exports.transactionsData = new discord_js_1.SlashCommandBuilder()
    .setName('transactions')
    .setDescription('View your recent transactions')
    .addIntegerOption((o) => o
    .setName('limit')
    .setDescription('Number of transactions (max 25)')
    .setMinValue(1)
    .setMaxValue(constants_1.TRANSACTIONS_MAX_LIMIT)
    .setRequired(false));
exports.leaderboardData = new discord_js_1.SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the top Route Cash holders')
    .addIntegerOption((o) => o.setName('limit').setDescription('Number of users').setMinValue(1).setMaxValue(25).setRequired(false));
exports.inventoryData = new discord_js_1.SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your crate rewards and items');
// ═══════════════════════════════════════════════════════════════════════════
//  COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════════════════
// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------
async function handleBalance(interaction, services) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    await services.user.ensureUser(target.id);
    const balance = await services.economy.getBalance(target.id);
    const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.ELECTRIC, (0, math_1.formatRC)(balance), interaction.guild)
        .setTitle(`${discord_1.ICON.wallet} ${target.username}'s Wallet`)
        .setDescription(`# ${discord_1.ICON.coin} ${(0, math_1.formatRC)(balance)}\n` +
        `${discord_1.LINE}\n` +
        (0, discord_1.statusBanner)('ROUTE CASH BALANCE', 'info'))
        .setThumbnail(target.displayAvatarURL({ size: 256 }));
    await (0, discord_1.ephemeralEmbed)(interaction, embed);
}
// ---------------------------------------------------------------------------
// Pay / Transfer
// ---------------------------------------------------------------------------
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
        const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.WIN, (0, math_1.formatRC)(newBalance), interaction.guild)
            .setTitle(`${discord_1.ICON.check} TRANSFER COMPLETE`)
            .setDescription((0, discord_1.statusBanner)(`${discord_1.ICON.win}  SENT SUCCESSFULLY  ${discord_1.ICON.win}`, 'win') +
            `\n**${discord_1.ICON.coin} ${(0, math_1.formatRC)(amount)}** ${discord_1.ICON.arrow} <@${recipient.id}>\n` +
            `${discord_1.LINE}`)
            .addFields({ name: discord_1.SPACER, value: (0, discord_1.statBlock)('TO', `<@${recipient.id}>`), inline: true }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)('AMOUNT', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(amount)}`), inline: true }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)('BALANCE', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(newBalance)}`), inline: true });
        if (reason !== 'P2P Transfer') {
            embed.addFields({ name: `${discord_1.ICON.arrow} MEMO`, value: `\`\`\`${reason}\`\`\``, inline: false });
        }
        await (0, discord_1.ephemeralEmbed)(interaction, embed);
    }
    catch (err) {
        if (err instanceof EconomyService_1.InsufficientFundsError) {
            await (0, discord_1.ephemeralReply)(interaction, `${discord_1.ICON.loss} Insufficient Route Cash for this transfer.`);
            return;
        }
        throw err;
    }
}
// ---------------------------------------------------------------------------
// Tip (Public)
// ---------------------------------------------------------------------------
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
            .setColor(discord_1.COLOR.ELECTRIC)
            .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
            .setTitle(`${discord_1.ICON.coins} TIP RECEIVED`)
            .setDescription((0, discord_1.statusBanner)(`${discord_1.ICON.coin}  PUBLIC TIP  ${discord_1.ICON.coin}`, 'info') +
            `\n<@${interaction.user.id}> tipped <@${recipient.id}>\n\n` +
            `# + ${discord_1.ICON.coin} ${(0, math_1.formatRC)(amount)}\n` +
            `${discord_1.LINE}`)
            .setThumbnail(recipient.displayAvatarURL({ size: 256 }))
            .setTimestamp()
            .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` });
        // Tips are public
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [embed] });
        }
        else {
            await interaction.reply({ embeds: [embed] });
        }
    }
    catch (err) {
        if (err instanceof EconomyService_1.InsufficientFundsError) {
            await (0, discord_1.ephemeralReply)(interaction, `${discord_1.ICON.loss} Insufficient Route Cash for this tip.`);
            return;
        }
        throw err;
    }
}
// ---------------------------------------------------------------------------
// Daily Claim
// ---------------------------------------------------------------------------
async function handleDaily(interaction, services) {
    await services.user.ensureUser(interaction.user.id);
    try {
        const { amount, streak, nextClaimAt } = await services.economy.claimDaily(interaction.user.id, config_1.config.daily.reward, config_1.config.daily.cooldownHours, config_1.config.daily.streakBonus, config_1.config.daily.maxStreak);
        const newBalance = await services.economy.getBalance(interaction.user.id);
        const maxed = streak >= config_1.config.daily.maxStreak;
        // Award weekly-lottery tickets for the daily claim.
        if (interaction.guildId) {
            try {
                const cfg = await services.invite.admin.getConfig(interaction.guildId);
                if (cfg.lotteryEnabled && cfg.ticketsPerDaily > 0) {
                    await services.lottery.grantTickets(interaction.guildId, interaction.user.id, 'daily', cfg.ticketsPerDaily);
                }
            }
            catch (err) {
                console.error('[Daily] lottery ticket grant failed:', err);
            }
        }
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(maxed ? discord_1.COLOR.JACKPOT : discord_1.COLOR.WIN)
            .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}`, iconURL: interaction.guild?.iconURL({ size: 256 }) ?? undefined })
            .setTitle(`${discord_1.ICON.check} DAILY CLAIMED`)
            .setDescription((0, discord_1.statusBanner)(`${discord_1.ICON.win}  REWARD COLLECTED  ${discord_1.ICON.win}`, 'win') +
            `\n# + ${discord_1.ICON.coin} ${(0, math_1.formatRC)(amount)}\n` +
            `${discord_1.LINE}`)
            .addFields({
            name: `${discord_1.ICON.streak} STREAK`,
            value: `${(0, discord_1.streakBar)(streak, config_1.config.daily.maxStreak)}${maxed ? '\n`' + discord_1.ICON.jackpot + ' MAX STREAK BONUS ACTIVE`' : ''}`,
            inline: false
        }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)('BALANCE', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(newBalance)}`), inline: true }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)('STREAK', maxed ? `${streak} ${discord_1.ICON.jackpot}` : `${streak}`), inline: true }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)('NEXT', `<t:${Math.floor(nextClaimAt.getTime() / 1000)}:R>`), inline: true })
            .setTimestamp()
            .setFooter({ text: `Balance: ${discord_1.ICON.coin} ${(0, math_1.formatRC)(newBalance)}` });
        await (0, discord_1.ephemeralEmbed)(interaction, embed);
    }
    catch (err) {
        const nextClaimAt = err.nextClaimAt;
        if (nextClaimAt) {
            const embed = new discord_js_1.EmbedBuilder()
                .setColor(discord_1.COLOR.LOSS)
                .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
                .setTitle(`${discord_1.ICON.time} ON COOLDOWN`)
                .setDescription((0, discord_1.statusBanner)(`${discord_1.ICON.loss}  ALREADY CLAIMED  ${discord_1.ICON.loss}`, 'loss') +
                `\nCome back <t:${Math.floor(nextClaimAt.getTime() / 1000)}:R>\n` +
                `${discord_1.LINE}\n` +
                `*Keep your streak alive!*`)
                .setTimestamp()
                .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` });
            await (0, discord_1.ephemeralEmbed)(interaction, embed);
            return;
        }
        throw err;
    }
}
// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
async function handleStats(interaction, services) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    await services.user.ensureUser(target.id);
    const balance = await services.economy.getBalance(target.id);
    const activity = await services.user.getActivity(target.id);
    const inviteCount = await services.economy.getValidInviteCount(target.id);
    const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.ELECTRIC, (0, math_1.formatRC)(balance), interaction.guild)
        .setTitle(`${target.username.toUpperCase()}`)
        .setDescription((0, discord_1.statusBanner)('PLAYER STATISTICS', 'info') +
        `\n${(0, discord_1.heroAmount)((0, math_1.formatRC)(balance))}\n` +
        `${discord_1.LINE}`)
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .addFields({ name: discord_1.SPACER, value: (0, discord_1.statBlock)('MESSAGES', `${activity.messageCount}`), inline: true }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)('VC TIME', `${activity.vcMinutes}m`), inline: true }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)('INVITES', `${inviteCount}`), inline: true });
    await (0, discord_1.ephemeralEmbed)(interaction, embed);
}
// ---------------------------------------------------------------------------
// Rank
// ---------------------------------------------------------------------------
async function handleRank(interaction, services) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    await services.user.ensureUser(target.id);
    const { rank, total } = await services.economy.getUserRank(target.id);
    const balance = await services.economy.getBalance(target.id);
    const rankBar = (0, discord_1.progressBar)(Math.max(0, total - rank + 1), Math.max(1, total), 14);
    const topPct = total > 0 ? Math.max(1, Math.round((rank / total) * 100)) : 100;
    const isTop3 = rank <= 3;
    const medal = rank === 1 ? `${discord_1.ICON.jackpot} 1ST` : rank === 2 ? '2ND' : rank === 3 ? '3RD' : `#${rank}`;
    const embed = (0, discord_1.brandedEmbed)(isTop3 ? discord_1.COLOR.JACKPOT : discord_1.COLOR.BRAND, (0, math_1.formatRC)(balance), interaction.guild)
        .setTitle(`${discord_1.ICON.chip} LEADERBOARD RANK`)
        .setDescription((0, discord_1.statusBanner)(isTop3 ? `${discord_1.ICON.jackpot}  TOP PLAYER  ${discord_1.ICON.jackpot}` : 'RANKING', isTop3 ? 'jackpot' : 'info') +
        `\n# ${medal}\n` +
        `*Top ${topPct}% of all holders*\n` +
        `${discord_1.LINE}`)
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .addFields({ name: 'STANDING', value: rankBar, inline: false }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)('RANK', `#${rank} / ${total}`), inline: true }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)('BALANCE', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(balance)}`), inline: true });
    await (0, discord_1.ephemeralEmbed)(interaction, embed);
}
// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
async function handleTransactions(interaction, services) {
    const limit = interaction.options.getInteger('limit') ?? constants_1.TRANSACTIONS_DEFAULT_LIMIT;
    const txs = await services.economy.getTransactions(interaction.user.id, limit);
    if (txs.length === 0) {
        await (0, discord_1.ephemeralReply)(interaction, `${discord_1.ICON.loss} No transactions found.`);
        return;
    }
    const balance = await services.economy.getBalance(interaction.user.id);
    const lines = txs.map((t) => {
        const credit = !String(t.amount).trim().startsWith('-');
        const icon = credit ? `\`${discord_1.ICON.up}\`` : `\`${discord_1.ICON.down}\``;
        return `${icon} **${t.amount} RC** · \`${t.type}\`\n   ${discord_1.ICON.arrow} *${t.reason}*`;
    });
    const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.INFO, (0, math_1.formatRC)(balance), interaction.guild)
        .setTitle(`${discord_1.ICON.bank} TRANSACTION HISTORY`)
        .setDescription((0, discord_1.statusBanner)('RECENT ACTIVITY', 'info') +
        `\n${discord_1.LINE}\n` +
        lines.join('\n').slice(0, 3800));
    await (0, discord_1.ephemeralEmbed)(interaction, embed);
}
// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------
async function handleLeaderboard(interaction, services) {
    const limit = interaction.options.getInteger('limit') ?? constants_1.LEADERBOARD_DEFAULT_LIMIT;
    const rows = await services.economy.getLeaderboard(limit);
    if (rows.length === 0) {
        await (0, discord_1.ephemeralReply)(interaction, `${discord_1.ICON.loss} No balances yet.`);
        return;
    }
    const topBalance = Number(rows[0]?.balance ?? 0) || 1;
    const lines = await Promise.all(rows.map(async (r, i) => {
        const user = await interaction.client.users.fetch(r.user_id).catch(() => null);
        const name = user?.username ?? r.user_id;
        const medal = i === 0 ? `\`${discord_1.ICON.jackpot} 1ST\`` : i === 1 ? '`2ND`' : i === 2 ? '`3RD`' : `\`#${i + 1}\``;
        const bar = (0, discord_1.progressBar)(Number(r.balance), topBalance, 10);
        return `${medal}  **${name}**\n    ${bar}  **${discord_1.ICON.coin} ${r.balance}**`;
    }));
    const balance = await services.economy.getBalance(interaction.user.id);
    const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.JACKPOT, (0, math_1.formatRC)(balance), interaction.guild)
        .setTitle(`${discord_1.ICON.chip} LEADERBOARD`)
        .setDescription((0, discord_1.statusBanner)(`${discord_1.ICON.jackpot}  TOP ${rows.length} RICHEST  ${discord_1.ICON.jackpot}`, 'jackpot') +
        `\n${discord_1.LINE}\n` +
        lines.join('\n\n').slice(0, 3600));
    await (0, discord_1.ephemeralEmbed)(interaction, embed);
}
// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------
async function handleInventory(interaction, services) {
    await services.user.ensureUser(interaction.user.id);
    const items = await services.user.getInventory(interaction.user.id);
    const balance = await services.economy.getBalance(interaction.user.id);
    if (items.length === 0) {
        const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.NEUTRAL, (0, math_1.formatRC)(balance), interaction.guild)
            .setTitle(`${discord_1.ICON.chip} INVENTORY`)
            .setDescription((0, discord_1.statusBanner)('EMPTY STASH', 'neutral') +
            `\n${discord_1.LINE}\n` +
            `Open a crate with \`/crate\` to start collecting!`);
        await (0, discord_1.ephemeralEmbed)(interaction, embed);
        return;
    }
    const lines = items.map((item) => {
        const meta = item.item_metadata ? ` · \`${JSON.stringify(item.item_metadata)}\`` : '';
        return `\`${discord_1.ICON.rare} x${item.quantity}\`  **${item.item_type.replace(/_/g, ' ').toUpperCase()}**${meta}`;
    });
    const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.RARE, (0, math_1.formatRC)(balance), interaction.guild)
        .setTitle(`${discord_1.ICON.chip} INVENTORY`)
        .setDescription((0, discord_1.statusBanner)(`${discord_1.ICON.jackpot}  YOUR ITEMS  ${discord_1.ICON.jackpot}`, 'jackpot') +
        `\n${discord_1.LINE}\n` +
        lines.join('\n').slice(0, 3800));
    await (0, discord_1.ephemeralEmbed)(interaction, embed);
}
