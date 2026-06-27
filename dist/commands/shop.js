"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lotteryData = exports.redeemData = exports.shopData = void 0;
exports.handleShop = handleShop;
exports.handleShopButton = handleShopButton;
exports.handleRedeem = handleRedeem;
exports.handleLottery = handleLottery;
const discord_js_1 = require("discord.js");
const client_1 = require("@prisma/client");
const discord_1 = require("../utils/discord");
const wallet_1 = require("../lib/wallet");
const ShopService_1 = require("../services/economy/ShopService");
// ═══════════════════════════════════════════════════════════════════════════
//  /shop    — spend RouteCash on ride rewards (issues a redemption code)
//  /redeem  — staff consume a code (or, with no code, list your own codes)
//  /lottery — weekly lottery pot, your tickets, and the last winner
// ═══════════════════════════════════════════════════════════════════════════
exports.shopData = new discord_js_1.SlashCommandBuilder()
    .setName('shop')
    .setDescription('Spend Route Cash on ride rewards');
exports.redeemData = new discord_js_1.SlashCommandBuilder()
    .setName('redeem')
    .setDescription('Redeem a reward code (staff), or list your own active codes')
    .addStringOption((o) => o.setName('code').setDescription('The redemption code to mark as used (staff only)').setRequired(false));
exports.lotteryData = new discord_js_1.SlashCommandBuilder()
    .setName('lottery')
    .setDescription('View the weekly lottery pot, your tickets, and the last winner');
// ── /shop ─────────────────────────────────────────────────────────────────--
async function handleShop(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId) {
        await (0, discord_1.ephemeralReply)(interaction, 'Use this command inside the server.');
        return;
    }
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const cfg = await services.invite.admin.getConfig(guildId);
    const items = await services.shop.listItems(guildId);
    const balance = await (0, wallet_1.getBalance)(interaction.user.id);
    const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.WIN)
        .setTitle(`🛒 Reward Shop`)
        .setDescription(`${discord_1.LINE}\nYour balance: ${discord_1.ICON.coin} **${balance.toFixed(0)}** ${discord_1.BRAND.ticker}\n\n` +
        (cfg.shopEnabled
            ? items.length
                ? items.map((i) => `**${i.label}** — ${discord_1.ICON.coin} ${i.priceRc} ${discord_1.BRAND.ticker}`).join('\n')
                : '_The shop is empty right now._'
            : '_The shop is currently disabled._'));
    const rows = [];
    if (cfg.shopEnabled) {
        let row = new discord_js_1.ActionRowBuilder();
        items.forEach((item, idx) => {
            if (idx > 0 && idx % 5 === 0) {
                rows.push(row);
                row = new discord_js_1.ActionRowBuilder();
            }
            row.addComponents(new discord_js_1.ButtonBuilder()
                .setCustomId(`shop:buy:${item.key}`)
                .setLabel(`Buy ${item.label}`.slice(0, 80))
                .setStyle(discord_js_1.ButtonStyle.Success));
        });
        if (row.components.length)
            rows.push(row);
    }
    await interaction.editReply({ embeds: [embed], components: rows });
}
async function handleShopButton(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId)
        return;
    // customId: shop:buy:<key>
    const key = interaction.customId.split(':')[2];
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const cfg = await services.invite.admin.getConfig(guildId);
    try {
        const { item, redemption } = await services.shop.purchase(guildId, interaction.user.id, key, cfg.shopEnabled);
        const balance = await (0, wallet_1.getBalance)(interaction.user.id);
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(discord_1.COLOR.WIN)
            .setAuthor({ name: `${discord_1.BRAND.logo}  Reward Shop` })
            .setTitle(`${discord_1.ICON.win} Purchase complete`)
            .setDescription(`You bought **${item.label}** for ${discord_1.ICON.coin} **${item.priceRc}** ${discord_1.BRAND.ticker}.\n\n` +
            `Your code: \`${redemption.code}\`\n_Show it to staff in your booking ticket to claim it._\n\n` +
            `Balance: ${discord_1.ICON.coin} **${balance.toFixed(0)}** ${discord_1.BRAND.ticker}`)
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    }
    catch (err) {
        if (err instanceof ShopService_1.ShopPurchaseError) {
            const msg = err.code === 'INSUFFICIENT_FUNDS'
                ? "You don't have enough Route Cash for that."
                : err.code === 'SHOP_DISABLED'
                    ? 'The shop is currently disabled.'
                    : 'That item is no longer available.';
            await interaction.editReply({ content: msg });
            return;
        }
        console.error('[Shop] purchase failed:', err);
        await interaction.editReply({ content: 'Purchase failed. Please try again.' });
    }
}
// ── /redeem ─────────────────────────────────────────────────────────────────
async function handleRedeem(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId) {
        await (0, discord_1.ephemeralReply)(interaction, 'Use this command inside the server.');
        return;
    }
    const code = interaction.options.getString('code');
    // No code → list the caller's own active codes.
    if (!code) {
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
        const codes = await services.redemption.listForUser(guildId, interaction.user.id, client_1.RedemptionStatus.ACTIVE);
        const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.INFO)
            .setTitle(`${discord_1.ICON.cards} Your Reward Codes`)
            .setDescription(codes.length
            ? `${discord_1.LINE}\n` +
                codes
                    .map((c) => `\`${c.code}\` — **${services.redemption.label(c.rewardKey)}** _(${c.source.toLowerCase()})_`)
                    .join('\n')
            : `${discord_1.LINE}\nYou have no active reward codes. Earn them via /shop, milestones, or the weekly lottery.`);
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    // Code provided → staff-only consume.
    const member = interaction.member;
    if (!member || !(0, discord_1.hasStaffRole)(member)) {
        await (0, discord_1.ephemeralReply)(interaction, 'Only staff can redeem a customer code.');
        return;
    }
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const result = await services.redemption.redeem(guildId, code, interaction.user.id);
    if (result.ok && result.redemption) {
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(discord_1.COLOR.WIN)
            .setAuthor({ name: `${discord_1.BRAND.logo}  Redemption` })
            .setTitle(`${discord_1.ICON.check} Code redeemed`)
            .setDescription(`Reward: **${services.redemption.label(result.redemption.rewardKey)}**\n` +
            `Belongs to: <@${result.redemption.userId}>\n` +
            `Honor this reward for the customer.`)
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    const reason = result.reason === 'NOT_FOUND'
        ? 'No code matches that value.'
        : result.reason === 'WRONG_GUILD'
            ? 'That code is not valid for this server.'
            : 'That code has already been used or is no longer valid.';
    await interaction.editReply({ content: reason });
}
// ── /lottery ─────────────────────────────────────────────────────────────---
async function handleLottery(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId) {
        await (0, discord_1.ephemeralReply)(interaction, 'Use this command inside the server.');
        return;
    }
    const cfg = await services.invite.admin.getConfig(guildId);
    const pot = await services.lottery.getPot(guildId);
    const mine = await services.lottery.getTickets(guildId, interaction.user.id);
    const last = await services.lottery.lastDraw(guildId);
    const odds = pot.totalTickets > 0 ? ((mine / pot.totalTickets) * 100).toFixed(1) : '0.0';
    const lastLine = last
        ? last.winnerUserId
            ? `<@${last.winnerUserId}> · ${last.drawnAt.toISOString().slice(0, 10)}`
            : `No winner · ${last.drawnAt.toISOString().slice(0, 10)}`
        : 'No draws yet';
    const embed = (0, discord_1.brandedEmbed)(cfg.lotteryEnabled ? discord_1.COLOR.JACKPOT : discord_1.COLOR.NEUTRAL)
        .setTitle(`🎟️ Weekly Lottery`)
        .setDescription(`${discord_1.LINE}\n${cfg.lotteryEnabled ? 'Earn tickets by being active — the more you have, the better your odds!' : '_The lottery is currently paused._'}`)
        .addFields({ name: 'Prize', value: services.redemption.label(cfg.lotteryPrizeKey), inline: true }, { name: 'Total Pot', value: `${pot.totalTickets} tickets`, inline: true }, { name: 'Entrants', value: `${pot.participants}`, inline: true }, { name: 'Your Tickets', value: `${mine}`, inline: true }, { name: 'Your Odds', value: `${odds}%`, inline: true }, { name: 'Last Winner', value: lastLine, inline: true }, {
        name: 'How to earn tickets',
        value: `/daily +${cfg.ticketsPerDaily} · verified invite +${cfg.ticketsPerInvite} · completed ride +${cfg.ticketsPerRide}`,
        inline: false,
    });
    await (0, discord_1.ephemeralEmbed)(interaction, embed);
}
