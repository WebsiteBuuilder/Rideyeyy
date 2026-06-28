"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REDEEM_PICK_PREFIX = exports.lotteryData = exports.redeemData = exports.rewardsData = exports.shopData = void 0;
exports.handleRewards = handleRewards;
exports.handleShop = handleShop;
exports.handleShopButton = handleShopButton;
exports.handleRedeem = handleRedeem;
exports.handleRedeemSelect = handleRedeemSelect;
exports.handleLottery = handleLottery;
const discord_js_1 = require("discord.js");
const discord_1 = require("../utils/discord");
const casinoEmbeds_1 = require("../utils/casinoEmbeds");
const config_1 = require("../config");
const lotterySchedule_1 = require("../utils/lotterySchedule");
const wallet_1 = require("../lib/wallet");
const ShopService_1 = require("../services/economy/ShopService");
// ═══════════════════════════════════════════════════════════════════════════
//  /shop     — spend Route Cash on ride rewards (added to rewards wallet)
//  /rewards  — view your active rewards wallet
//  /redeem   — staff consume a reward (by user select or legacy code)
//  /lottery  — weekly lottery pot, your tickets, and the last winner
// ═══════════════════════════════════════════════════════════════════════════
exports.shopData = new discord_js_1.SlashCommandBuilder()
    .setName('shop')
    .setDescription('Spend Route Cash on ride rewards');
exports.rewardsData = new discord_js_1.SlashCommandBuilder()
    .setName('rewards')
    .setDescription('View your active rewards wallet');
exports.redeemData = new discord_js_1.SlashCommandBuilder()
    .setName('redeem')
    .setDescription('Staff redeem a customer reward, or list your wallet')
    .addUserOption((o) => o.setName('user').setDescription('Customer whose reward to redeem (staff only)'))
    .addStringOption((o) => o.setName('code').setDescription('Legacy redemption code (staff only, optional)'));
exports.lotteryData = new discord_js_1.SlashCommandBuilder()
    .setName('lottery')
    .setDescription('View the weekly lottery pot, your tickets, and the last winner');
exports.REDEEM_PICK_PREFIX = 'redeem:pick:';
function formatWalletLines(services, rewards) {
    if (!rewards.length) {
        return '_Your wallet is empty. Earn rewards via `/shop`, invite milestones, or the weekly lottery._';
    }
    return rewards.map((r) => services.redemption.formatRewardLine(r)).join('\n');
}
// ── /rewards ────────────────────────────────────────────────────────────────
async function handleRewards(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId) {
        await (0, discord_1.ephemeralReply)(interaction, 'Use this command inside the server.');
        return;
    }
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const rewards = await services.redemption.listAvailable(guildId, interaction.user.id);
    const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.WIN)
        .setTitle(`${discord_1.ICON.cards} Your Rewards Wallet`)
        .setDescription(`${discord_1.LINE}\n` +
        `Active rewards can be applied during \`/book\`. Reserved rewards are attached to an open ticket.\n\n` +
        formatWalletLines(services, rewards));
    await interaction.editReply({ embeds: [embed] });
}
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
    const itemLines = items.length
        ? items
            .map((i) => {
            const desc = i.description ? `\n_${i.description}_` : '';
            return `**${i.label}** — ${discord_1.ICON.coin} ${i.priceRc} ${discord_1.BRAND.ticker}${desc}`;
        })
            .join('\n\n')
        : '_The shop is empty right now._';
    const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.WIN)
        .setTitle(`🛒 Reward Shop`)
        .setDescription(`${discord_1.LINE}\nYour balance: ${discord_1.ICON.coin} **${balance.toFixed(0)}** ${discord_1.BRAND.ticker}\n\n` +
        (cfg.shopEnabled ? itemLines : '_The shop is currently disabled._') +
        `\n\n_Purchases go to your rewards wallet — apply them during \`/book\`._`);
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
    const key = interaction.customId.split(':')[2];
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const cfg = await services.invite.admin.getConfig(guildId);
    try {
        const { item } = await services.shop.purchase(guildId, interaction.user.id, key, cfg.shopEnabled);
        const balance = await (0, wallet_1.getBalance)(interaction.user.id);
        const rewardLabel = services.redemption.label(item.rewardKey);
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(discord_1.COLOR.WIN)
            .setAuthor({ name: `${discord_1.BRAND.logo}  Reward Shop` })
            .setTitle(`${discord_1.ICON.win} Purchase complete`)
            .setDescription(`You bought **${item.label}** for ${discord_1.ICON.coin} **${item.priceRc}** ${discord_1.BRAND.ticker}.\n\n` +
            `**${rewardLabel}** was added to your rewards wallet — apply it during \`/book\`.\n\n` +
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
    const targetUser = interaction.options.getUser('user');
    const member = interaction.member;
    const isStaff = member != null && (0, discord_1.hasStaffRole)(member);
    if (code || targetUser) {
        if (!isStaff) {
            await (0, discord_1.ephemeralReply)(interaction, 'Only staff can redeem rewards for customers.');
            return;
        }
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
        if (code) {
            const result = await services.redemption.redeem(guildId, code, interaction.user.id);
            if (result.ok && result.redemption) {
                const embed = new discord_js_1.EmbedBuilder()
                    .setColor(discord_1.COLOR.WIN)
                    .setAuthor({ name: `${discord_1.BRAND.logo}  Redemption` })
                    .setTitle(`${discord_1.ICON.check} Legacy code redeemed`)
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
            return;
        }
        if (targetUser) {
            const rewards = await services.redemption.listAvailable(guildId, targetUser.id);
            if (!rewards.length) {
                await interaction.editReply({ content: `<@${targetUser.id}> has no active rewards in their wallet.` });
                return;
            }
            const options = rewards.slice(0, 25).map((r) => new discord_js_1.StringSelectMenuOptionBuilder()
                .setLabel(services.redemption.label(r.rewardKey).slice(0, 100))
                .setValue(r.id)
                .setDescription(`${services.redemption.sourceLabel(r.source)}`.slice(0, 100)));
            const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.StringSelectMenuBuilder()
                .setCustomId(`${exports.REDEEM_PICK_PREFIX}${targetUser.id}`)
                .setPlaceholder(`Select a reward for ${targetUser.username}`)
                .addOptions(options));
            await interaction.editReply({
                content: `Redeem a reward for <@${targetUser.id}>:`,
                components: [row],
            });
            return;
        }
    }
    await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const embed = (0, discord_1.brandedEmbed)(discord_1.COLOR.INFO)
        .setTitle(`${discord_1.ICON.cards} Rewards Wallet`)
        .setDescription(`${discord_1.LINE}\nUse \`/rewards\` to view your active rewards.\n\n` +
        `_Staff: use \`/redeem user:@member\` to redeem manually, or \`/redeem code:GR-...\` for legacy codes._`);
    await interaction.editReply({ embeds: [embed] });
}
async function handleRedeemSelect(interaction, services) {
    if (!interaction.customId.startsWith(exports.REDEEM_PICK_PREFIX))
        return;
    const guildId = interaction.guildId;
    if (!guildId)
        return;
    const member = interaction.member;
    if (!member || !(0, discord_1.hasStaffRole)(member)) {
        await (0, discord_1.ephemeralReply)(interaction, 'Only staff can redeem customer rewards.');
        return;
    }
    const targetUserId = interaction.customId.slice(exports.REDEEM_PICK_PREFIX.length);
    const redemptionId = interaction.values[0];
    await interaction.deferUpdate();
    const result = await services.redemption.redeemById(guildId, redemptionId, interaction.user.id);
    if (result.ok && result.redemption) {
        await interaction.editReply({
            content: `${discord_1.ICON.check} Redeemed **${services.redemption.label(result.redemption.rewardKey)}** for <@${targetUserId}>.`,
            components: [],
        });
        return;
    }
    const reason = result.reason === 'NOT_FOUND'
        ? 'That reward was not found.'
        : result.reason === 'WRONG_GUILD'
            ? 'That reward is not valid for this server.'
            : 'That reward has already been used or is no longer available.';
    await interaction.editReply({ content: reason, components: [] });
}
// ── /lottery ────────────────────────────────────────────────────────────────
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
    const prize = services.redemption.label(cfg.lotteryPrizeKey);
    const { drawDayOfWeek, drawHourUtc } = config_1.config.economy.lottery;
    const nextDraw = (0, lotterySchedule_1.nextLotteryDrawUtc)(drawDayOfWeek, drawHourUtc, new Date());
    const nextUnix = Math.floor(nextDraw.getTime() / 1000);
    const embed = (0, casinoEmbeds_1.buildLotteryEmbed)({
        mode: 'personal',
        prizeLabel: prize,
        totalTickets: pot.totalTickets,
        participants: pot.participants,
        nextDrawUnix: nextUnix,
        lastWinnerUserId: last?.winnerUserId ?? null,
        lastDrawUnix: last ? Math.floor(last.drawnAt.getTime() / 1000) : null,
        enabled: cfg.lotteryEnabled,
        yourTickets: mine,
        yourOdds: odds,
    });
    await (0, discord_1.ephemeralEmbed)(interaction, embed);
}
