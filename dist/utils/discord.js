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
exports.enforceCasinoChannel = enforceCasinoChannel;
exports.hasAdminRole = hasAdminRole;
exports.hasStaffRole = hasStaffRole;
exports.hasProviderRole = hasProviderRole;
exports.checkCooldown = checkCooldown;
exports.isButtonInteraction = isButtonInteraction;
exports.memberFromInteraction = memberFromInteraction;
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
const constants_1 = require("./constants");
exports.BRAND = {
    name: 'GUHD RIDES',
    currency: 'Route Cash',
    ticker: 'RC',
    tagline: 'Premium Casino',
    logo: '◈',
    icon: '🎰',
};
exports.COLOR = {
    BRAND: 0x1a1a2e,
    ACCENT: 0x16213e,
    WIN: 0x00d26a,
    LOSS: 0xff4757,
    JACKPOT: 0xffd700,
    EPIC: 0xe056fd,
    RARE: 0x9b59b6,
    ACTIVE: 0x4a90d9,
    ELECTRIC: 0x00d4ff,
    INFO: 0x5865f2,
    NEUTRAL: 0x2f3136,
    WHITE: 0xffffff,
    MUTED: 0x747f8d,
};
exports.LINE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
exports.THIN_LINE = '─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─';
exports.SPACER = '\u200b';
exports.SUITS = {
    H: { icon: '♥', color: 'red', name: 'Hearts' },
    D: { icon: '♦', color: 'red', name: 'Diamonds' },
    C: { icon: '♣', color: 'black', name: 'Clubs' },
    S: { icon: '♠', color: 'black', name: 'Spades' },
};
exports.ICON = {
    coin: '◈',
    coins: '💰',
    wallet: '👛',
    bank: '🏦',
    cards: '🃏',
    dice: '🎲',
    slot: '🎰',
    chip: '🪙',
    win: '✦',
    loss: '✕',
    push: '≈',
    jackpot: '★',
    streak: '🔥',
    hit: '↓',
    stand: '■',
    double: '⬆',
    split: '⟷',
    fold: '↩',
    up: '▲',
    down: '▼',
    common: '○',
    uncommon: '◐',
    rare: '●',
    epic: '◆',
    legendary: '★',
    time: '⏱',
    check: '✓',
    cross: '✕',
    arrow: '→',
};
function progressBar(current, max, size = 10) {
    const pct = Math.min(1, Math.max(0, current / max));
    const filled = Math.round(pct * size);
    return `\`[${'█'.repeat(filled)}${'░'.repeat(size - filled)}]\` ${Math.round(pct * 100)}%`;
}
function meter(value, max) {
    return progressBar(value, max, 8);
}
function streakBar(streak, max) {
    return `${exports.ICON.streak} ${progressBar(streak, max, max)}`;
}
function rcDisplay(amount) {
    return `${exports.ICON.coin} **${amount}** ${exports.BRAND.ticker}`;
}
function heroAmount(amount) {
    return `# ${exports.ICON.coin} ${amount}\n${exports.BRAND.ticker}`;
}
function inlineRC(amount) {
    return `\`${amount} ${exports.BRAND.ticker}\``;
}
function netLabel(net, positive) {
    return positive ? `\`+ ${net}\` ${exports.ICON.up}` : `\`- ${net}\` ${exports.ICON.down}`;
}
function heroNet(net, positive) {
    return positive ? `# +${net}` : `# -${net}`;
}
function statBlock(label, value) {
    return `**${label}**\n${value}`;
}
function inlineStat(label, value) {
    return `**${label}:** ${value}`;
}
function kvRow(key, value) {
    return `> **${key}** ${exports.ICON.arrow} ${value}`;
}
function statusBanner(text, style = 'info') {
    const colorCode = {
        win: '32',
        loss: '31',
        jackpot: '33',
        info: '36',
        neutral: '37',
    };
    return `\`\`\`ansi\n\u001b[1;${colorCode[style]}m${text}\u001b[0m\n\`\`\``;
}
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
function cardDisplay(rank, suit) {
    const suitData = exports.SUITS[suit] ?? { icon: suit, color: 'black' };
    return `\`[ ${rank}${suitData.icon} ]\``;
}
function hiddenCard() {
    return '`[ ?? ]`';
}
function handDisplay(cards, hideIndex) {
    return cards
        .map((card, i) => (i === hideIndex ? hiddenCard() : cardDisplay(card.rank, card.suit)))
        .join('  ');
}
function handValue(value, revealed) {
    if (!revealed)
        return '`Value: ??`';
    if (value === 21)
        return '**21** `BLACKJACK`';
    if (value > 21)
        return `**${value}** \`BUST\``;
    return `**${value}**`;
}
function tableHeader(title) {
    return `## ${exports.ICON.cards} ${title}\n${exports.LINE}`;
}
function dealerSection(cards, value) {
    return `**DEALER**\n${cards}\n${value}`;
}
function playerSection(cards, value) {
    return `**YOU**\n${cards}\n${value}`;
}
function baseEmbed(color, balance, guild) {
    const iconURL = guild?.iconURL({ size: 256 }) ?? undefined;
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: `${exports.BRAND.logo}  ${exports.BRAND.name}`, iconURL })
        .setFooter({ text: `${exports.BRAND.tagline}  ·  ${exports.BRAND.name}` })
        .setTimestamp();
    if (balance && balance !== '—') {
        embed.setDescription(`${exports.ICON.coin} **${balance}** ${exports.BRAND.ticker}`);
    }
    return embed;
}
function brandedEmbed(color, balance, guild) {
    return baseEmbed(color, balance, guild);
}
function gameEmbed(title, color, guild) {
    return baseEmbed(color, undefined, guild).setTitle(title);
}
function resultEmbed(result, payout, balance, guild) {
    const isWin = result.toLowerCase().includes('win');
    return brandedEmbed(isWin ? exports.COLOR.WIN : exports.COLOR.LOSS, balance, guild)
        .setTitle(result)
        .setDescription(`${statBlock('Payout', payout)}\n${statBlock('Balance', balance)}`);
}
async function ephemeralEmbed(interaction, embed) {
    try {
        if (interaction.deferred) {
            await interaction.editReply({ embeds: [embed] });
        }
        else if (interaction.replied) {
            await interaction.followUp({ embeds: [embed], flags: discord_js_1.MessageFlags.Ephemeral });
        }
        else {
            await interaction.reply({ embeds: [embed], flags: discord_js_1.MessageFlags.Ephemeral });
        }
    }
    catch (err) {
        console.error('[v0] ephemeralEmbed error:', err);
    }
}
async function publicEmbed(interaction, embed) {
    try {
        if (interaction.deferred || interaction.replied) {
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
async function ephemeralReply(interaction, content) {
    if (interaction.deferred) {
        await interaction.editReply({ content });
    }
    else if (interaction.replied) {
        await interaction.followUp({ content, flags: discord_js_1.MessageFlags.Ephemeral });
    }
    else {
        await interaction.reply({ content, flags: discord_js_1.MessageFlags.Ephemeral });
    }
}
function actionButton(customId, label, style, disabled = false) {
    return new discord_js_1.ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
}
function buildConfirmRow(customIdPrefix) {
    return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId(`${customIdPrefix}:confirm`)
        .setLabel('CONFIRM')
        .setStyle(discord_js_1.ButtonStyle.Success), new discord_js_1.ButtonBuilder()
        .setCustomId(`${customIdPrefix}:cancel`)
        .setLabel('CANCEL')
        .setStyle(discord_js_1.ButtonStyle.Secondary));
}
async function waitForConfirmation(interaction, customIdPrefix, warningMessage) {
    const row = buildConfirmRow(customIdPrefix);
    await interaction.reply({ content: warningMessage, components: [row], flags: discord_js_1.MessageFlags.Ephemeral });
    return waitForButtonConfirmation(interaction, customIdPrefix);
}
async function waitForFollowUpConfirmation(interaction, customIdPrefix, warningMessage) {
    const row = buildConfirmRow(customIdPrefix);
    const followUpMessage = await interaction.followUp({
        content: warningMessage,
        components: [row],
        flags: discord_js_1.MessageFlags.Ephemeral,
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
/**
 * Restricts casino games to the configured casino channel. Returns true if the
 * command may proceed. When CASINO_CHANNEL_ID is unset ('0'), games work
 * anywhere (no breakage).
 */
async function enforceCasinoChannel(interaction) {
    const casino = config_1.config.channels.casino;
    if (casino && casino !== '0' && interaction.channelId !== casino) {
        await ephemeralReply(interaction, `${exports.ICON.cross} Casino games can only be played in <#${casino}>.`);
        return false;
    }
    return true;
}
function hasAdminRole(member) {
    return config_1.config.roles.admin !== '0' && member.roles.cache.has(config_1.config.roles.admin);
}
function hasStaffRole(member) {
    return (hasAdminRole(member) ||
        (config_1.config.roles.staff !== '0' && member.roles.cache.has(config_1.config.roles.staff)));
}
function hasProviderRole(member) {
    return (hasAdminRole(member) ||
        (config_1.config.roles.provider !== '0' && member.roles.cache.has(config_1.config.roles.provider)));
}
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
function isButtonInteraction(interaction) {
    return (interaction instanceof Object &&
        'isButton' in interaction &&
        interaction.isButton());
}
function memberFromInteraction(interaction) {
    if (!interaction.inGuild() || !interaction.member)
        return null;
    return interaction.member;
}
