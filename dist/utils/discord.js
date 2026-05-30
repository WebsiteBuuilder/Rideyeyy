"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ICON = exports.SUITS = exports.SPACER = exports.THIN_LINE = exports.LINE = exports.COLOR = exports.BRAND = void 0;
exports.progressBar = progressBar;
exports.meter = meter;
exports.streakBar = streakBar;
exports.rcDisplay = rcDisplay;
exports.heroAmount = heroAmount;
exports.inlineRC = inlineRC;
exports.netLabel = netLabel;
exports.heroNet = heroNet;
exports.statBlock = statBlock;
exports.inlineStat = inlineStat;
exports.kvRow = kvRow;
exports.statusBanner = statusBanner;
exports.resultBanner = resultBanner;
exports.cardDisplay = cardDisplay;
exports.hiddenCard = hiddenCard;
exports.handDisplay = handDisplay;
exports.handValue = handValue;
exports.tableHeader = tableHeader;
exports.dealerSection = dealerSection;
exports.playerSection = playerSection;
exports.baseEmbed = baseEmbed;
exports.brandedEmbed = brandedEmbed;
exports.gameEmbed = gameEmbed;
exports.resultEmbed = resultEmbed;
exports.ephemeralEmbed = ephemeralEmbed;
exports.publicEmbed = publicEmbed;
exports.ephemeralReply = ephemeralReply;
exports.actionButton = actionButton;
exports.buildConfirmRow = buildConfirmRow;
exports.waitForConfirmation = waitForConfirmation;
exports.waitForFollowUpConfirmation = waitForFollowUpConfirmation;
exports.hasAdminRole = hasAdminRole;
exports.hasStaffRole = hasStaffRole;
exports.checkCooldown = checkCooldown;
exports.isButtonInteraction = isButtonInteraction;
exports.memberFromInteraction = memberFromInteraction;
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
const constants_1 = require("./constants");
// ═══════════════════════════════════════════════════════════════════════════
//  DISCORD CASINO UI KIT — Premium Design System
// ═══════════════════════════════════════════════════════════════════════════
// ---------------------------------------------------------------------------
// Brand Identity
// ---------------------------------------------------------------------------
exports.BRAND = {
    name: 'GUHD RIDES',
    currency: 'Route Cash',
    ticker: 'RC',
    tagline: 'Premium Casino',
    logo: '◈',
    icon: '🎰',
};
// ---------------------------------------------------------------------------
// Color Palette — Cohesive Casino Aesthetic
// ---------------------------------------------------------------------------
exports.COLOR = {
    // Primary brand
    BRAND: 0x1a1a2e, // Deep navy — background essence
    ACCENT: 0x16213e, // Rich navy — secondary
    // Casino Status Colors
    WIN: 0x00d26a, // Emerald green — wins/success
    LOSS: 0xff4757, // Crimson — losses
    JACKPOT: 0xffd700, // Pure gold — jackpots/21
    EPIC: 0xe056fd, // Vibrant purple — epic rewards
    RARE: 0x9b59b6, // Royal purple — rare items
    // Game State Colors
    ACTIVE: 0x4a90d9, // Steel blue — active games
    ELECTRIC: 0x00d4ff, // Electric cyan — highlights
    // UI Colors
    INFO: 0x5865f2, // Discord blurple — info
    NEUTRAL: 0x2f3136, // Discord dark — neutral
    WHITE: 0xffffff, // Clean white
    MUTED: 0x747f8d, // Muted gray — subtle text
};
// ---------------------------------------------------------------------------
// Premium Visual Elements
// ---------------------------------------------------------------------------
/** Elegant line separator */
exports.LINE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
/** Thin separator for sub-sections */
exports.THIN_LINE = '─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─';
/** Zero-width spacer */
exports.SPACER = '\u200b';
/** Card suit icons for premium display */
exports.SUITS = {
    H: { icon: '♥', color: 'red', name: 'Hearts' },
    D: { icon: '♦', color: 'red', name: 'Diamonds' },
    C: { icon: '♣', color: 'black', name: 'Clubs' },
    S: { icon: '♠', color: 'black', name: 'Spades' },
};
// ---------------------------------------------------------------------------
// Casino Iconography
// ---------------------------------------------------------------------------
exports.ICON = {
    // Currency & Economy
    coin: '◈',
    coins: '💰',
    wallet: '👛',
    bank: '🏦',
    // Games
    cards: '🃏',
    dice: '🎲',
    slot: '🎰',
    chip: '🪙',
    // Status
    win: '✦',
    loss: '✕',
    push: '≈',
    jackpot: '★',
    streak: '🔥',
    // Actions
    hit: '↓',
    stand: '■',
    double: '⬆',
    split: '⟷',
    fold: '↩',
    // Rarity
    common: '○',
    uncommon: '◐',
    rare: '●',
    epic: '◆',
    legendary: '★',
    // Misc
    time: '⏱',
    check: '✓',
    cross: '✕',
    arrow: '→',
    up: '↗',
    down: '↘',
};
// ---------------------------------------------------------------------------
// Progress & Meter Components
// ---------------------------------------------------------------------------
/** Premium progress bar with gradient feel */
function progressBar(value, max, size = 12) {
    const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
    const filled = Math.round(ratio * size);
    const empty = size - filled;
    return '`[' + '▰'.repeat(filled) + '▱'.repeat(empty) + ']`';
}
/** Animated-feel meter with percentage */
function meter(value, max) {
    const pct = max <= 0 ? 0 : Math.round((value / max) * 100);
    return `${progressBar(value, max, 12)}  **${pct}%**`;
}
/** XP-style bar for streaks */
function streakBar(current, max) {
    const filled = Math.min(current, max);
    const empty = max - filled;
    const icons = exports.ICON.streak.repeat(filled) + '○'.repeat(empty);
    return `${icons}  \`${current}/${max}\``;
}
// ---------------------------------------------------------------------------
// Currency & Amount Formatting
// ---------------------------------------------------------------------------
/** Standard currency display */
function rcDisplay(amount) {
    return `**${exports.ICON.coin} ${amount}**`;
}
/** Large hero amount for big displays */
function heroAmount(amount) {
    return `# ${exports.ICON.coin} ${amount}`;
}
/** Compact inline amount */
function inlineRC(amount) {
    const formatted = typeof amount === 'number' ? amount.toString() : amount;
    return `\`${exports.ICON.coin} ${formatted}\``;
}
/** Net change with directional indicator */
function netLabel(net, positive) {
    if (positive) {
        return `\`+ ${net}\` ${exports.ICON.up}`;
    }
    return `\`- ${net}\` ${exports.ICON.down}`;
}
/** Large net change for results */
function heroNet(amount, positive) {
    const sign = positive ? '+' : '-';
    return `# ${sign} ${exports.ICON.coin} ${amount}`;
}
// ---------------------------------------------------------------------------
// Stat & Field Components
// ---------------------------------------------------------------------------
/** Clean stat block for embed fields */
function statBlock(label, value) {
    return `\`${label}\`\n**${value}**`;
}
/** Inline stat for compact displays */
function inlineStat(label, value) {
    return `\`${label}:\` **${value}**`;
}
/** Key-value pair row */
function kvRow(key, value) {
    return `> **${key}** ${exports.ICON.arrow} ${value}`;
}
// ---------------------------------------------------------------------------
// Status Banner Components (ANSI Code Blocks)
// ---------------------------------------------------------------------------
/** Premium status banner with ANSI colors */
function statusBanner(text, style = 'info') {
    const colorCode = {
        win: '32', // Green
        loss: '31', // Red
        jackpot: '33', // Gold/Yellow
        info: '36', // Cyan
        neutral: '37', // White
    };
    return `\`\`\`ansi\n[1;${colorCode[style]}m${text}[0m\n\`\`\``;
}
/** Game result banner */
function resultBanner(result) {
    const banners = {
        win: { text: '✦  WINNER  ✦', style: 'win' },
        loss: { text: '✕  DEALER WINS  ✕', style: 'loss' },
        push: { text: '≈  PUSH  ≈', style: 'neutral' },
        jackpot: { text: '★  BLACKJACK  ★', style: 'jackpot' },
        bust: { text: '✕  BUST  ✕', style: 'loss' },
        surrender: { text: '↩  SURRENDERED  ↩', style: 'neutral' },
    };
    const { text, style } = banners[result] ?? banners.loss;
    return statusBanner(text, style);
}
// ---------------------------------------------------------------------------
// Card Display Components
// ---------------------------------------------------------------------------
/** Premium single card display */
function cardDisplay(rank, suit) {
    const suitData = exports.SUITS[suit] ?? { icon: suit, color: 'black' };
    return `\`[ ${rank}${suitData.icon} ]\``;
}
/** Hidden card display */
function hiddenCard() {
    return '`[ ?? ]`';
}
/** Hand display with cards */
function handDisplay(cards, hideIndex) {
    return cards
        .map((card, i) => (i === hideIndex ? hiddenCard() : cardDisplay(card.rank, card.suit)))
        .join('  ');
}
/** Hand value display with special states */
function handValue(value, revealed) {
    if (!revealed)
        return '`Value: ??`';
    if (value === 21)
        return '**21** `BLACKJACK`';
    if (value > 21)
        return `**${value}** \`BUST\``;
    return `**${value}**`;
}
// ---------------------------------------------------------------------------
// Table Layout Components
// ---------------------------------------------------------------------------
/** Casino table header */
function tableHeader(title) {
    return `## ${exports.ICON.cards} ${title}\n${exports.LINE}`;
}
/** Dealer section */
function dealerSection(cards, value) {
    return `**DEALER**\n${cards}\n${value}`;
}
/** Player section */
function playerSection(cards, value) {
    return `**YOU**\n${cards}\n${value}`;
}
// ---------------------------------------------------------------------------
// Embed Builders — Premium Casino Style
// ---------------------------------------------------------------------------
/**
 * Base casino embed with consistent branding
 */
function baseEmbed(color, balance, guild) {
    const iconURL = guild?.iconURL({ size: 256 }) ?? undefined;
    const hasBalance = balance && balance !== '—';
    return new discord_js_1.EmbedBuilder()
        .setColor(color)
        .setTimestamp()
        .setFooter({
        text: hasBalance
            ? `${exports.ICON.coin} ${balance}  ·  ${exports.BRAND.name}`
            : `${exports.BRAND.name}  ·  ${exports.BRAND.tagline}`,
        iconURL,
    });
}
/**
 * Premium branded embed with author line
 */
function brandedEmbed(color, balance, guild) {
    const iconURL = guild?.iconURL({ size: 256 }) ?? undefined;
    const hasBalance = balance && balance !== '—';
    return new discord_js_1.EmbedBuilder()
        .setColor(color)
        .setAuthor({
        name: `${exports.BRAND.logo}  ${exports.BRAND.name}`,
        iconURL
    })
        .setTimestamp()
        .setFooter({
        text: hasBalance
            ? `Balance: ${exports.ICON.coin} ${balance}`
            : exports.BRAND.tagline,
    });
}
/**
 * Casino game embed with table styling
 */
function gameEmbed(title, color, guild) {
    const iconURL = guild?.iconURL({ size: 256 }) ?? undefined;
    return new discord_js_1.EmbedBuilder()
        .setColor(color)
        .setAuthor({
        name: `${exports.BRAND.icon}  ${exports.BRAND.name}`,
        iconURL
    })
        .setTitle(title)
        .setTimestamp()
        .setFooter({ text: exports.BRAND.tagline });
}
/**
 * Result embed with prominent status
 */
function resultEmbed(result, payout, balance, guild) {
    const colors = {
        win: exports.COLOR.WIN,
        loss: exports.COLOR.LOSS,
        push: exports.COLOR.NEUTRAL,
        jackpot: exports.COLOR.JACKPOT,
        bust: exports.COLOR.LOSS,
        surrender: exports.COLOR.MUTED,
    };
    const titles = {
        win: 'YOU WIN',
        loss: 'DEALER WINS',
        push: 'PUSH',
        jackpot: 'BLACKJACK!',
        bust: 'BUST',
        surrender: 'SURRENDERED',
    };
    return gameEmbed(titles[result], colors[result], guild)
        .setDescription(resultBanner(result))
        .addFields({ name: exports.SPACER, value: statBlock('PAYOUT', `${exports.ICON.coin} ${payout}`), inline: true }, { name: exports.SPACER, value: statBlock('BALANCE', `${exports.ICON.coin} ${balance}`), inline: true });
}
// ---------------------------------------------------------------------------
// Reply Helpers
// ---------------------------------------------------------------------------
/** Reply ephemerally with an embed */
async function ephemeralEmbed(interaction, embed) {
    try {
        if (interaction.deferred) {
            await interaction.followUp({ embeds: [embed], ephemeral: true });
        }
        else if (interaction.replied) {
            await interaction.followUp({ embeds: [embed], ephemeral: true });
        }
        else {
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
    catch (err) {
        console.error('[v0] ephemeralEmbed error:', err);
    }
}
/** Reply publicly with an embed */
async function publicEmbed(interaction, embed) {
    try {
        if (interaction.deferred) {
            await interaction.followUp({ embeds: [embed] });
        }
        else if (interaction.replied) {
            await interaction.followUp({ embeds: [embed] });
        }
        else {
            await interaction.reply({ embeds: [embed] });
        }
    }
    catch (err) {
        console.error('[v0] publicEmbed error:', err);
    }
}
/** Quick ephemeral text reply */
async function ephemeralReply(interaction, content) {
    if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, ephemeral: true });
    }
    else {
        await interaction.reply({ content, ephemeral: true });
    }
}
/** Premium action button */
function actionButton(customId, label, style, disabled = false) {
    return new discord_js_1.ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(style)
        .setDisabled(disabled);
}
/** Confirmation button row */
function buildConfirmRow(customIdPrefix) {
    return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId(`${customIdPrefix}:confirm`)
        .setLabel('CONFIRM')
        .setStyle(discord_js_1.ButtonStyle.Success), new discord_js_1.ButtonBuilder()
        .setCustomId(`${customIdPrefix}:cancel`)
        .setLabel('CANCEL')
        .setStyle(discord_js_1.ButtonStyle.Secondary));
}
// ---------------------------------------------------------------------------
// Confirmation Flows
// ---------------------------------------------------------------------------
async function waitForConfirmation(interaction, customIdPrefix, warningMessage) {
    const row = buildConfirmRow(customIdPrefix);
    await interaction.reply({
        content: warningMessage,
        components: [row],
        ephemeral: true,
    });
    return waitForButtonConfirmation(interaction, customIdPrefix);
}
async function waitForFollowUpConfirmation(interaction, customIdPrefix, warningMessage) {
    const row = buildConfirmRow(customIdPrefix);
    const followUpMessage = await interaction.followUp({
        content: warningMessage,
        components: [row],
        ephemeral: true,
    });
    try {
        const confirmation = await followUpMessage.awaitMessageComponent({
            filter: (i) => i.user.id === interaction.user.id &&
                (i.customId === `${customIdPrefix}:confirm` || i.customId === `${customIdPrefix}:cancel`),
            componentType: discord_js_1.ComponentType.Button,
            time: constants_1.CONFIRM_TIMEOUT_MS,
        });
        const confirmed = confirmation.customId === `${customIdPrefix}:confirm`;
        await confirmation.update({
            content: confirmed ? '`Processing...`' : '`Cancelled.`',
            components: [],
        });
        return confirmed;
    }
    catch {
        await followUpMessage.edit({ content: '`Confirmation timed out.`', components: [] }).catch(() => { });
        return false;
    }
}
async function waitForButtonConfirmation(interaction, customIdPrefix) {
    const message = await interaction.fetchReply();
    try {
        const confirmation = await message.awaitMessageComponent({
            filter: (i) => i.user.id === interaction.user.id &&
                (i.customId === `${customIdPrefix}:confirm` || i.customId === `${customIdPrefix}:cancel`),
            componentType: discord_js_1.ComponentType.Button,
            time: constants_1.CONFIRM_TIMEOUT_MS,
        });
        const confirmed = confirmation.customId === `${customIdPrefix}:confirm`;
        await confirmation.update({
            content: confirmed ? '`Processing...`' : '`Cancelled.`',
            components: [],
        });
        return confirmed;
    }
    catch {
        await interaction.editReply({ content: '`Confirmation timed out.`', components: [] }).catch(() => { });
        return false;
    }
}
// ---------------------------------------------------------------------------
// Permission & Role Helpers
// ---------------------------------------------------------------------------
function hasAdminRole(member) {
    return member.roles.cache.has(config_1.config.roles.admin);
}
function hasStaffRole(member) {
    return (hasAdminRole(member) ||
        (config_1.config.roles.staff !== '0' && member.roles.cache.has(config_1.config.roles.staff)));
}
// ---------------------------------------------------------------------------
// Cooldown System
// ---------------------------------------------------------------------------
const cooldowns = new Map();
function checkCooldown(userId, key, cooldownMs) {
    const mapKey = `${userId}:${key}`;
    const now = Date.now();
    const expires = cooldowns.get(mapKey);
    if (expires && expires > now) {
        return Math.ceil((expires - now) / 1000);
    }
    cooldowns.set(mapKey, now + cooldownMs);
    return null;
}
// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------
function isButtonInteraction(interaction) {
    return interaction instanceof Object && 'isButton' in interaction && interaction.isButton();
}
function memberFromInteraction(interaction) {
    if (!interaction.inGuild() || !interaction.member)
        return null;
    return interaction.member;
}
//# sourceMappingURL=discord.js.map