"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;
exports.buildCrateButtons = buildCrateButtons;
exports.execute = execute;
exports.handleCrateButton = handleCrateButton;
const discord_js_1 = require("discord.js");
const EconomyService_1 = require("../services/EconomyService");
const math_1 = require("../utils/math");
const discord_1 = require("../utils/discord");
const config_1 = require("../config");
// ═══════════════════════════════════════════════════════════════════════════
//  CRATE SYSTEM — Premium Reward Crates
// ═══════════════════════════════════════════════════════════════════════════
// ---------------------------------------------------------------------------
// Crate Visual Definitions
// ---------------------------------------------------------------------------
const CRATE_META = {
    bronze: {
        icon: discord_1.ICON.common,
        label: 'BRONZE',
        color: 0xcd7f32,
        cost: config_1.config.crates.bronze,
        desc: 'Entry-level rewards',
        rarity: 'Common drops',
    },
    silver: {
        icon: discord_1.ICON.uncommon,
        label: 'SILVER',
        color: 0xc0c0c0,
        cost: config_1.config.crates.silver,
        desc: 'Better odds, better loot',
        rarity: 'Uncommon+ drops',
    },
    gold: {
        icon: discord_1.ICON.legendary,
        label: 'GOLD',
        color: discord_1.COLOR.JACKPOT,
        cost: config_1.config.crates.gold,
        desc: 'Premium rewards, rare drops',
        rarity: 'Rare+ drops',
    },
};
// Rarity icons for reward display
const RARITY_ICON = {
    common: discord_1.ICON.common,
    uncommon: discord_1.ICON.uncommon,
    rare: discord_1.ICON.rare,
    epic: discord_1.ICON.epic,
    legendary: discord_1.ICON.legendary,
};
function formatRewardLine(description) {
    // Detect high-value rewards
    const isHighValue = /\d{3,}/.test(description) ||
        /rare|epic|legendary|role|ride/i.test(description);
    const icon = isHighValue ? discord_1.ICON.rare : discord_1.ICON.common;
    return isHighValue ? `> ${discord_1.ICON.jackpot} **${description}**` : `> ${icon} ${description}`;
}
// ---------------------------------------------------------------------------
// Shop Embed
// ---------------------------------------------------------------------------
function buildShopEmbed() {
    const lines = ['bronze', 'silver', 'gold'].map((t) => {
        const m = CRATE_META[t];
        return `### ${m.icon} ${m.label}\n\`${discord_1.ICON.coin} ${(0, math_1.formatRC)(m.cost)}\` · *${m.desc}*\n\`${m.rarity}\``;
    });
    return new discord_js_1.EmbedBuilder()
        .setColor(discord_1.COLOR.JACKPOT)
        .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
        .setTitle(`${discord_1.ICON.slot} CRATE SHOP`)
        .setDescription((0, discord_1.statusBanner)(`${discord_1.ICON.jackpot}  PREMIUM REWARDS  ${discord_1.ICON.jackpot}`, 'jackpot') +
        `\n${discord_1.LINE}\n\n` +
        lines.join('\n\n'))
        .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` })
        .setTimestamp();
}
// ---------------------------------------------------------------------------
// Crate Buttons
// ---------------------------------------------------------------------------
function buildCrateButtons() {
    return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId('crate:bronze')
        .setLabel(`${discord_1.ICON.common} BRONZE`)
        .setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder()
        .setCustomId('crate:silver')
        .setLabel(`${discord_1.ICON.uncommon} SILVER`)
        .setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder()
        .setCustomId('crate:gold')
        .setLabel(`${discord_1.ICON.legendary} GOLD`)
        .setStyle(discord_js_1.ButtonStyle.Success), new discord_js_1.ButtonBuilder()
        .setCustomId('crate:rewards')
        .setLabel('VIEW DROPS')
        .setStyle(discord_js_1.ButtonStyle.Secondary));
}
// ---------------------------------------------------------------------------
// /crate Command
// ---------------------------------------------------------------------------
exports.data = new discord_js_1.SlashCommandBuilder()
    .setName('crate')
    .setDescription('Open reward crates with Route Cash');
async function execute(interaction, services) {
    await interaction.reply({
        embeds: [buildShopEmbed()],
        components: [buildCrateButtons()],
        flags: discord_js_1.MessageFlags.Ephemeral,
    });
}
// ---------------------------------------------------------------------------
// Crate Button Handler
// ---------------------------------------------------------------------------
async function handleCrateButton(interaction, services) {
    const [, action] = interaction.customId.split(':');
    if (!action)
        return;
    // ── Rewards Preview ──────────────────────────────────────────────────────
    if (action === 'rewards') {
        const summary = await services.crate.getAllRewardsSummary();
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(discord_1.COLOR.RARE)
            .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
            .setTitle(`${discord_1.ICON.slot} DROP TABLE`)
            .setDescription((0, discord_1.statusBanner)(`${discord_1.ICON.rare}  ALL POSSIBLE DROPS  ${discord_1.ICON.rare}`, 'info') +
            `\n${discord_1.LINE}\n` +
            summary.slice(0, 3800))
            .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` })
            .setTimestamp();
        await interaction.update({ embeds: [embed], components: [buildCrateButtons()] });
        return;
    }
    // ── Open a Crate ─────────────────────────────────────────────────────────
    const crateType = action;
    if (!['bronze', 'silver', 'gold'].includes(crateType))
        return;
    const cd = (0, discord_1.checkCooldown)(interaction.user.id, 'crate', config_1.config.limits.crateCooldownMs);
    if (cd) {
        await interaction.reply({
            content: `${discord_1.ICON.time} You're opening crates too fast — wait **${cd}s** before trying again.`,
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const meta = CRATE_META[crateType];
    try {
        await services.user.ensureUser(interaction.user.id);
        const guildId = interaction.guildId ?? interaction.guild?.id;
        if (!guildId) {
            await interaction.reply({ content: `${discord_1.ICON.loss} This command must be used in a server.`, flags: discord_js_1.MessageFlags.Ephemeral });
            return;
        }
        const rewards = await services.crate.openCrate(interaction.user.id, crateType, interaction.client, guildId);
        const balance = await services.economy.getBalance(interaction.user.id);
        const rewardLines = rewards.map((r) => formatRewardLine(r.description));
        // Determine if any high-value item was won
        const hasRare = rewardLines.some((l) => l.includes(discord_1.ICON.jackpot));
        const embedColor = hasRare ? (crateType === 'gold' ? discord_1.COLOR.JACKPOT : discord_1.COLOR.RARE) : meta.color;
        const statusStyle = hasRare ? 'jackpot' : 'win';
        const statusText = hasRare
            ? `${discord_1.ICON.jackpot}  RARE DROP  ${discord_1.ICON.jackpot}`
            : `${discord_1.ICON.win}  OPENED  ${discord_1.ICON.win}`;
        const embed = new discord_js_1.EmbedBuilder()
            .setColor(embedColor)
            .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
            .setTitle(`${meta.icon} ${meta.label} CRATE${hasRare ? ` ${discord_1.ICON.jackpot}` : ''}`)
            .setDescription((0, discord_1.statusBanner)(statusText, statusStyle) +
            `\n${discord_1.LINE}\n\n` +
            `**REWARDS RECEIVED:**\n` +
            rewardLines.join('\n'))
            .addFields({ name: discord_1.SPACER, value: (0, discord_1.statBlock)('COST', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(meta.cost)}`), inline: true }, { name: discord_1.SPACER, value: (0, discord_1.statBlock)('BALANCE', `${discord_1.ICON.coin} ${(0, math_1.formatRC)(balance)}`), inline: true })
            .setTimestamp()
            .setFooter({ text: `Opened by ${interaction.user.username}  ·  ${discord_1.BRAND.name}` });
        // Keep the opener's private shop ready for another pull...
        await interaction.update({ embeds: [buildShopEmbed()], components: [buildCrateButtons()] });
        // ...and broadcast the result to the channel so everyone can react.
        const channel = interaction.channel;
        if (channel && channel.isTextBased() && !channel.isDMBased()) {
            await channel.send({
                content: `${discord_1.ICON.slot} <@${interaction.user.id}> opened a **${meta.label}** crate!`,
                embeds: [embed],
            }).catch(() => { });
        }
    }
    catch (err) {
        if (err instanceof EconomyService_1.InsufficientFundsError) {
            const currentBalance = await services.economy.getBalance(interaction.user.id);
            const needed = meta.cost - Number(currentBalance.toFixed(0));
            const embed = new discord_js_1.EmbedBuilder()
                .setColor(discord_1.COLOR.LOSS)
                .setAuthor({ name: `${discord_1.BRAND.icon}  ${discord_1.BRAND.name}` })
                .setTitle(`${discord_1.ICON.loss} INSUFFICIENT FUNDS`)
                .setDescription((0, discord_1.statusBanner)(`${discord_1.ICON.loss}  NOT ENOUGH RC  ${discord_1.ICON.loss}`, 'loss') +
                `\nNeed **\`${discord_1.ICON.coin} ${(0, math_1.formatRC)(meta.cost)}\`** for ${meta.label}\n` +
                `${discord_1.LINE}\n` +
                (needed > 0 ? `Short by **${discord_1.ICON.coin} ${needed}**` : ''))
                .setTimestamp()
                .setFooter({ text: `${discord_1.BRAND.name}  ·  ${discord_1.BRAND.tagline}` });
            await interaction.reply({
                embeds: [embed],
                flags: discord_js_1.MessageFlags.Ephemeral,
            });
            return;
        }
        await interaction.reply({
            content: err instanceof Error ? err.message : `${discord_1.ICON.loss} Failed to open crate.`,
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
    }
}
