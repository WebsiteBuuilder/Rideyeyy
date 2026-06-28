"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const config_1 = require("./config");
const prisma_1 = require("./lib/prisma");
// Services
const EconomyService_1 = require("./services/EconomyService");
const UserService_1 = require("./services/UserService");
const CrateService_1 = require("./services/CrateService");
const GamblingService_1 = require("./services/GamblingService");
const BookingService_1 = require("./services/BookingService");
const ProviderStatsService_1 = require("./services/ProviderStatsService");
const BlacklistService_1 = require("./services/BlacklistService");
const InviteService_1 = require("./services/invite/InviteService");
const MemberVerifyService_1 = require("./services/verify/MemberVerifyService");
const EconomyServices_1 = require("./services/economy/EconomyServices");
const SchedulerService_1 = require("./services/economy/SchedulerService");
// Command handlers
const Economy = __importStar(require("./commands/economy"));
const Crates = __importStar(require("./commands/crates"));
const Gambling = __importStar(require("./commands/gambling"));
const Book = __importStar(require("./commands/book"));
const ProviderStats = __importStar(require("./commands/provider-stats"));
const ProviderLeaderboard = __importStar(require("./commands/provider-leaderboard"));
const Blacklist = __importStar(require("./commands/blacklist"));
const Panels = __importStar(require("./commands/panels"));
const Invite = __importStar(require("./commands/invite"));
const Admin = __importStar(require("./commands/inviteAdmin"));
const Shop = __importStar(require("./commands/shop"));
const VerifyPanel = __importStar(require("./commands/verifyPanel"));
const Help = __importStar(require("./commands/help"));
// ═══════════════════════════════════════════════════════════════════════════
//  BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════════════
// Referral economy services (redemptions, shop, lottery, activity). Constructed
// first so the invite system can grant tickets / issue ride codes on rewards.
const economy = new EconomyServices_1.EconomyServices();
const invite = new InviteService_1.InviteService({
    redemption: economy.redemption,
    lottery: economy.lottery,
    activity: economy.activity,
});
const memberVerify = new MemberVerifyService_1.MemberVerifyService(invite);
const scheduler = new SchedulerService_1.SchedulerService(economy.lottery, invite);
const services = {
    economy: new EconomyService_1.EconomyService(),
    user: new UserService_1.UserService(),
    crate: new CrateService_1.CrateService(),
    gambling: new GamblingService_1.GamblingService(),
    booking: new BookingService_1.BookingService(),
    providerStats: new ProviderStatsService_1.ProviderStatsService(),
    blacklist: new BlacklistService_1.BlacklistService(),
    invite,
    redemption: economy.redemption,
    shop: economy.shop,
    lottery: economy.lottery,
    activity: economy.activity,
    memberVerify,
};
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.GuildVoiceStates,
        discord_js_1.GatewayIntentBits.GuildMembers,
        discord_js_1.GatewayIntentBits.GuildInvites,
    ],
});
// ═══════════════════════════════════════════════════════════════════════════
//  SLASH COMMAND REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════
async function registerCommands(client) {
    const commands = [
        Economy.data,
        Economy.payData,
        Economy.tipData,
        Economy.dailyData,
        Economy.statsData,
        Economy.rankData,
        Economy.transactionsData,
        Economy.leaderboardData,
        Economy.inventoryData,
        Crates.data,
        Gambling.coinflipData,
        Gambling.diceData,
        Gambling.blackjackData,
        Book.data,
        ProviderStats.data,
        ProviderLeaderboard.data,
        Blacklist.data,
        Panels.inviteData,
        Panels.howtoData,
        Panels.orderPanelData,
        Invite.invitesData,
        Invite.inviteLeaderboardData,
        Shop.shopData,
        Shop.redeemData,
        Shop.lotteryData,
        Admin.adminData,
        VerifyPanel.verifyPanelData,
        Help.helpData,
    ].map((c) => c.toJSON());
    const rest = new discord_js_1.REST().setToken(config_1.config.token);
    if (config_1.config.guildId) {
        // Register to the guild for instant availability, and clear the GLOBAL
        // scope so commands don't appear twice (a global + a guild copy).
        await rest.put(discord_js_1.Routes.applicationGuildCommands(config_1.config.clientId, config_1.config.guildId), { body: commands });
        await rest.put(discord_js_1.Routes.applicationCommands(config_1.config.clientId), { body: [] });
        console.log(`[Bot] Registered ${commands.length} guild commands (cleared global scope).`);
    }
    else {
        // Global-only registration, and clear any stale per-guild commands left
        // over from a previous guild-scoped deploy (avoids duplicate entries).
        await rest.put(discord_js_1.Routes.applicationCommands(config_1.config.clientId), { body: commands });
        for (const guild of client.guilds.cache.values()) {
            await rest
                .put(discord_js_1.Routes.applicationGuildCommands(config_1.config.clientId, guild.id), { body: [] })
                .catch(() => { });
        }
        console.log(`[Bot] Registered ${commands.length} global commands (cleared guild scopes).`);
    }
}
// ═══════════════════════════════════════════════════════════════════════════
//  INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════════════════════
client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    try {
        // ── Button interactions ──────────────────────────────────────────────
        if (interaction.isButton()) {
            const btn = interaction;
            const id = btn.customId;
            if (id.startsWith('bj:')) {
                await Gambling.handleBlackjackButton(btn, services);
                return;
            }
            if (id.startsWith('crate:')) {
                await Crates.handleCrateButton(btn, services);
                return;
            }
            if (id.startsWith('gudhrides-book:')) {
                await Book.handleBookButton(btn, services);
                return;
            }
            if (id.startsWith('gudhrides-booking:')) {
                await Book.handleBookingActionButton(btn, services);
                return;
            }
            if (id.startsWith('gudhrides-review:')) {
                await Book.handleReviewButton(btn, services);
                return;
            }
            if (id.startsWith('invlb:')) {
                await Invite.handleLeaderboardButton(btn, services);
                return;
            }
            if (id.startsWith('shop:')) {
                await Shop.handleShopButton(btn, services);
                return;
            }
            if (id === 'gudhrides-verify:start') {
                await VerifyPanel.handleVerifyButton(btn, services);
                return;
            }
            if (id.startsWith('invadm:')) {
                await Admin.handleAdminButton(btn, services);
                return;
            }
            return;
        }
        // ── Select menu interactions ─────────────────────────────────────────
        if (interaction.isStringSelectMenu()) {
            const select = interaction;
            if (select.customId === 'invadm:nav') {
                await Admin.handleAdminSelect(select, services);
                return;
            }
            if (select.customId === Help.HELP_NAV_ID) {
                await Help.handleHelpSelect(select);
                return;
            }
            return;
        }
        // ── Modal submissions ────────────────────────────────────────────────
        if (interaction.isModalSubmit()) {
            const modal = interaction;
            if (modal.customId.startsWith('gudhrides-book-')) {
                await Book.handleBookModal(modal, services);
                return;
            }
            if (modal.customId.startsWith('panel-edit:')) {
                await Panels.handlePanelModal(modal);
                return;
            }
            if (modal.customId === 'gudhrides-verify:modal') {
                await VerifyPanel.handleVerifyModal(modal, services);
                return;
            }
            if (modal.customId.startsWith('invadm:modal:')) {
                await Admin.handleAdminModal(modal, services);
                return;
            }
            return;
        }
        // ── Slash commands ───────────────────────────────────────────────────
        if (!interaction.isChatInputCommand())
            return;
        switch (interaction.commandName) {
            case 'balance':
                await Economy.handleBalance(interaction, services);
                break;
            case 'pay':
                await Economy.handlePay(interaction, services);
                break;
            case 'tip':
                await Economy.handleTip(interaction, services);
                break;
            case 'daily':
                await Economy.handleDaily(interaction, services);
                break;
            case 'stats':
                await Economy.handleStats(interaction, services);
                break;
            case 'rank':
                await Economy.handleRank(interaction, services);
                break;
            case 'transactions':
                await Economy.handleTransactions(interaction, services);
                break;
            case 'leaderboard':
                await Economy.handleLeaderboard(interaction, services);
                break;
            case 'inventory':
                await Economy.handleInventory(interaction, services);
                break;
            case 'crate':
                await Crates.execute(interaction, services);
                break;
            case 'coinflip':
                await Gambling.handleCoinflip(interaction, services);
                break;
            case 'dice':
                await Gambling.handleDice(interaction, services);
                break;
            case 'blackjack':
                await Gambling.handleBlackjack(interaction, services);
                break;
            case 'book':
                await Book.execute(interaction, services);
                break;
            case 'provider-stats':
                await ProviderStats.handleProviderStats(interaction, services);
                break;
            case 'provider-leaderboard':
                await ProviderLeaderboard.handleProviderLeaderboard(interaction, services);
                break;
            case 'blacklist':
                await Blacklist.handleBlacklist(interaction, services);
                break;
            case 'invitepanel':
                await Panels.handleInvite(interaction);
                break;
            case 'howto':
                await Panels.handleHowto(interaction);
                break;
            case 'orderpanel':
                await Panels.handleOrderPanel(interaction);
                break;
            case 'verifypanel':
                await VerifyPanel.handleVerifyPanel(interaction);
                break;
            case 'invites':
                await Invite.handleInvites(interaction, services);
                break;
            case 'invite-leaderboard':
                await Invite.handleInviteLeaderboard(interaction, services);
                break;
            case 'shop':
                await Shop.handleShop(interaction, services);
                break;
            case 'redeem':
                await Shop.handleRedeem(interaction, services);
                break;
            case 'lottery':
                await Shop.handleLottery(interaction, services);
                break;
            case 'admin':
                await Admin.handleAdmin(interaction, services);
                break;
            case 'help':
                await Help.handleHelp(interaction);
                break;
            default:
                console.warn(`[Bot] Unknown command: ${interaction.commandName}`);
        }
    }
    catch (err) {
        console.error('[Bot] Unhandled interaction error:', err);
        const msg = '`An error occurred. Please try again.`';
        try {
            if (interaction.isRepliable()) {
                if (interaction.deferred) {
                    await interaction.editReply({ content: msg });
                }
                else if (interaction.replied) {
                    await interaction.followUp({ content: msg, flags: discord_js_1.MessageFlags.Ephemeral });
                }
                else {
                    await interaction.reply({ content: msg, flags: discord_js_1.MessageFlags.Ephemeral });
                }
            }
        }
        catch { /* ignore reply errors */ }
    }
});
// ═══════════════════════════════════════════════════════════════════════════
//  STARTUP
// ═══════════════════════════════════════════════════════════════════════════
// ── Invite tracking events ─────────────────────────────────────────────────
client.on(discord_js_1.Events.GuildMemberAdd, async (member) => {
    try {
        await services.invite.handleMemberAdd(member);
        await services.memberVerify.onMemberAdd(member);
    }
    catch (err) {
        console.error('[Bot] guildMemberAdd error:', err);
    }
});
client.on(discord_js_1.Events.GuildMemberRemove, async (member) => {
    try {
        await services.invite.handleMemberRemove(member);
    }
    catch (err) {
        console.error('[Bot] guildMemberRemove error:', err);
    }
});
client.on(discord_js_1.Events.InviteCreate, (invite) => {
    try {
        services.invite.handleInviteCreate(invite);
    }
    catch (err) {
        console.error('[Bot] inviteCreate error:', err);
    }
});
client.on(discord_js_1.Events.InviteDelete, (invite) => {
    try {
        services.invite.handleInviteDelete(invite);
    }
    catch (err) {
        console.error('[Bot] inviteDelete error:', err);
    }
});
// Count member messages for the minimum-message anti-abuse gate (no content
// needed — only the per-user counter).
client.on(discord_js_1.Events.MessageCreate, async (message) => {
    if (!message.guildId || message.author.bot)
        return;
    try {
        await services.activity.increment(message.guildId, message.author.id);
    }
    catch (err) {
        console.error('[Bot] messageCreate activity error:', err);
    }
});
client.on(discord_js_1.Events.GuildCreate, async (guild) => {
    try {
        await services.invite.handleGuildCreate(guild);
        await economy.ensureGuild(guild.id);
    }
    catch (err) {
        console.error('[Bot] guildCreate error:', err);
    }
});
client.on(discord_js_1.Events.GuildDelete, (guild) => {
    try {
        services.invite.handleGuildDelete(guild);
    }
    catch (err) {
        console.error('[Bot] guildDelete error:', err);
    }
});
client.once(discord_js_1.Events.ClientReady, async (c) => {
    console.log(`[Bot] Logged in as ${c.user.tag}`);
    // Warm the DB connection pool so the first command query doesn't risk the
    // 3s Discord interaction timeout on a cold TLS handshake.
    try {
        await prisma_1.prisma.$connect();
        console.log('[Bot] Database connection established.');
    }
    catch (err) {
        console.error('[Bot] Failed to connect to database:', err);
    }
    try {
        await registerCommands(c);
    }
    catch (err) {
        console.error('[Bot] Failed to register commands:', err);
    }
    // Prime the invite cache, seed config/milestones, and start the verification
    // sweep. Best-effort so a missing Manage Server permission won't crash boot.
    try {
        await services.invite.init(c);
    }
    catch (err) {
        console.error('[Bot] Failed to initialise invite system:', err);
    }
    // Seed per-guild shop defaults and start the restart-safe scheduler (weekly
    // lottery draw + weekly/monthly resets).
    try {
        for (const guild of c.guilds.cache.values()) {
            await economy.ensureGuild(guild.id);
        }
        scheduler.start(c);
    }
    catch (err) {
        console.error('[Bot] Failed to start economy scheduler:', err);
    }
    try {
        await VerifyPanel.ensureVerifyPanel(c);
        console.log('[Bot] Verify panel ensured.');
    }
    catch (err) {
        console.error('[Bot] Failed to ensure verify panel:', err);
    }
});
client.login(config_1.config.token).catch((err) => {
    console.error('[Bot] Login failed:', err);
    process.exit(1);
});
