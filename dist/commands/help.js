"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.helpData = exports.HELP_NAV_ID = void 0;
exports.handleHelp = handleHelp;
exports.handleHelpSelect = handleHelpSelect;
const discord_js_1 = require("discord.js");
const config_1 = require("../config");
const discord_1 = require("../utils/discord");
// ═══════════════════════════════════════════════════════════════════════════
//  /help — new-user guide to verification, rides, Route Cash, casino & more
// ═══════════════════════════════════════════════════════════════════════════
exports.HELP_NAV_ID = 'help:nav';
const TOPICS = [
    { value: 'start', label: 'Getting Started', emoji: '👋', description: 'Verify & access the server' },
    { value: 'rides', label: 'Book a Ride', emoji: '🚗', description: 'Order rides & deliveries' },
    { value: 'economy', label: 'Route Cash', emoji: '💰', description: 'Balance, daily, crates' },
    { value: 'casino', label: 'Casino', emoji: '🎰', description: 'Coinflip, dice, blackjack' },
    { value: 'referrals', label: 'Referrals', emoji: '🎟️', description: 'Invite rewards & milestones' },
    { value: 'shop', label: 'Shop & Lottery', emoji: '🛒', description: 'Spend RC, redeem codes' },
    { value: 'providers', label: 'Providers', emoji: '🛞', description: 'Drivers & ticket workflow' },
];
function channelRef(id) {
    return id && id !== '0' ? `<#${id}>` : '_channel not set_';
}
function buildHelpEmbed(topic) {
    const verify = channelRef(config_1.config.channels.verify);
    const order = channelRef(config_1.config.channels.orderHere);
    const casino = channelRef(config_1.config.channels.casino);
    const firstOrderBonus = config_1.config.inviteEconomy.firstOrderBonusRc;
    switch (topic) {
        case 'start':
            return (0, discord_1.brandedEmbed)(discord_1.COLOR.ELECTRIC)
                .setTitle(`${discord_1.ICON.check} Getting Started`)
                .setDescription(`${discord_1.LINE}\n` +
                `Welcome to **${discord_1.BRAND.name}**! Follow these steps when you join:\n\n` +
                `**1. Verify** — Go to ${verify} and tap **Verify**. Solve the quick math captcha.\n` +
                `You'll receive the **Rider** role and access to the rest of the server.\n\n` +
                `**2. Book a ride** — Head to ${order} or use \`/book\` anywhere.\n\n` +
                `**3. Earn ${discord_1.BRAND.ticker}** — Claim \`/daily\`, invite friends, play casino games, or hit referral milestones.\n\n` +
                `**Key channels**\n` +
                `• Verify: ${verify}\n` +
                `• Order here: ${order}\n` +
                `• Casino: ${casino}`);
        case 'rides':
            return (0, discord_1.brandedEmbed)(discord_1.COLOR.ACTIVE)
                .setTitle('🚗 Book a Ride or Delivery')
                .setDescription(`${discord_1.LINE}\n` +
                `**How to order**\n` +
                `• Tap **Book Now** in ${order}, or run \`/book\`\n` +
                `• Choose **Ride** or **Courier Delivery**\n` +
                `• Pick a vehicle class (rides only)\n` +
                `• Paste **Google Maps links** for pickup and dropoff\n` +
                `• A private ticket channel opens for you and a provider\n\n` +
                `**In your ticket**\n` +
                `• **Claim** — provider accepts the job\n` +
                `• **Complete** — ride done; you'll get a DM to rate (4–5★ posts a public vouch)\n` +
                `• **Incomplete** — ride done with no review/vouch\n` +
                `• **Cancel** — staff only\n\n` +
                `_Tip: Have your Maps links ready before you start._`);
        case 'economy':
            return (0, discord_1.brandedEmbed)(discord_1.COLOR.WIN)
                .setTitle(`${discord_1.ICON.coin} Route Cash (${discord_1.BRAND.ticker})`)
                .setDescription(`${discord_1.LINE}\n` +
                `**${discord_1.BRAND.currency}** is the server currency. Earn it, spend it in the shop, or gamble in the casino.\n\n` +
                `**Wallet commands**\n` +
                `• \`/balance\` — check your balance\n` +
                `• \`/daily\` — free ${discord_1.BRAND.ticker} once per day (streak bonus!)\n` +
                `• \`/pay\` — send ${discord_1.BRAND.ticker} to someone\n` +
                `• \`/tip\` — quick tip a member\n` +
                `• \`/transactions\` — recent history\n` +
                `• \`/stats\` · \`/rank\` · \`/leaderboard\` — standings\n` +
                `• \`/inventory\` — items you've won\n\n` +
                `**Crates**\n` +
                `• \`/crate\` — open Bronze, Silver, or Gold crates for random rewards`);
        case 'casino':
            return (0, discord_1.brandedEmbed)(discord_1.COLOR.JACKPOT)
                .setTitle(`${discord_1.BRAND.icon} Casino Games`)
                .setDescription(`${discord_1.LINE}\n` +
                `Play in ${casino} (or anywhere commands work):\n\n` +
                `• \`/coinflip\` — heads or tails\n` +
                `• \`/dice\` — roll against a target number\n` +
                `• \`/blackjack\` — hit, stand, double, or surrender\n\n` +
                `_Gamble responsibly — only bet what you can afford to lose._`);
        case 'referrals':
            return (0, discord_1.brandedEmbed)(discord_1.COLOR.EPIC)
                .setTitle('🎟️ Referrals & Invites')
                .setDescription(`${discord_1.LINE}\n` +
                `**Invite friends and earn ${discord_1.BRAND.ticker}**\n\n` +
                `1. Share your personal Discord invite link\n` +
                `2. They join and **pass verification** in ${verify} → you earn invite ${discord_1.BRAND.ticker}\n` +
                `3. They complete their **first ride** → you get a **${firstOrderBonus} ${discord_1.BRAND.ticker}** bonus (once per invite)\n\n` +
                `**Commands**\n` +
                `• \`/referral\` — your dashboard (invites, milestones, lottery tickets)\n` +
                `• \`/invite card\` — invite card overview\n` +
                `• \`/invite stats\` · \`/invite history\` · \`/invite rewards\` · \`/invite milestones\`\n` +
                `• \`/invites\` — top inviters leaderboard\n\n` +
                `_Fake, self, or early-leave invites don't count._`);
        case 'shop':
            return (0, discord_1.brandedEmbed)(discord_1.COLOR.INFO)
                .setTitle('🛒 Shop, Codes & Lottery')
                .setDescription(`${discord_1.LINE}\n` +
                `**Reward Shop**\n` +
                `• \`/shop\` — browse items and spend ${discord_1.BRAND.ticker}\n` +
                `• Purchases grant **reward codes** (free rides, discounts)\n\n` +
                `**Redeem**\n` +
                `• \`/redeem\` — apply a code when booking\n\n` +
                `**Weekly Lottery**\n` +
                `• \`/lottery\` — view the pot and your tickets\n` +
                `• Tickets from dailies, invites, completed rides, and milestones\n` +
                `• One winner drawn each week for the prize ride`);
        case 'providers':
            return (0, discord_1.brandedEmbed)(discord_1.COLOR.NEUTRAL)
                .setTitle('🛞 For Providers (Drivers)')
                .setDescription(`${discord_1.LINE}\n` +
                `If you have the **Provider** role:\n\n` +
                `• Watch booking tickets — tap **Claim** on open jobs\n` +
                `• Coordinate with the customer in their private ticket\n` +
                `• **Complete** when done (triggers customer review) or **Incomplete** (no vouch)\n\n` +
                `**Stats**\n` +
                `• \`/provider-stats\` — your claims, completions, rating, revenue\n` +
                `• \`/provider-leaderboard\` — top drivers\n\n` +
                `_Need Provider access? Ask staff._`);
        default:
            return buildHelpEmbed('start');
    }
}
function navRow(active) {
    return new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.StringSelectMenuBuilder()
        .setCustomId(exports.HELP_NAV_ID)
        .setPlaceholder('Browse another topic…')
        .addOptions(TOPICS.map((t) => ({
        label: t.label,
        value: t.value,
        description: t.description,
        emoji: t.emoji,
        default: t.value === active,
    }))));
}
function helpView(topic) {
    return {
        embeds: [buildHelpEmbed(topic)],
        components: [navRow(topic)],
    };
}
exports.helpData = new discord_js_1.SlashCommandBuilder()
    .setName('help')
    .setDescription('Guide to GUHD RIDES — verify, book rides, earn Route Cash, and more')
    .addStringOption((o) => o
    .setName('topic')
    .setDescription('Jump to a section')
    .setRequired(false)
    .addChoices(...TOPICS.map((t) => ({ name: t.label, value: t.value }))));
async function handleHelp(interaction) {
    if (!interaction.guildId) {
        await (0, discord_1.ephemeralReply)(interaction, 'Use this command inside the server.');
        return;
    }
    const topic = interaction.options.getString('topic') ?? 'start';
    const valid = TOPICS.some((t) => t.value === topic) ? topic : 'start';
    const view = helpView(valid);
    await interaction.reply({ ...view, flags: discord_js_1.MessageFlags.Ephemeral });
}
async function handleHelpSelect(interaction) {
    const topic = interaction.values[0];
    await interaction.update(helpView(topic));
}
