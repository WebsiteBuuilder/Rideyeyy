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
// Services
const EconomyService_1 = require("./services/EconomyService");
const UserService_1 = require("./services/UserService");
const CrateService_1 = require("./services/CrateService");
const GamblingService_1 = require("./services/GamblingService");
const BookingService_1 = require("./services/BookingService");
const ProviderStatsService_1 = require("./services/ProviderStatsService");
const BlacklistService_1 = require("./services/BlacklistService");
// Command handlers
const Economy = __importStar(require("./commands/economy"));
const Crates = __importStar(require("./commands/crates"));
const Gambling = __importStar(require("./commands/gambling"));
const Book = __importStar(require("./commands/book"));
const ProviderStats = __importStar(require("./commands/provider-stats"));
const ProviderLeaderboard = __importStar(require("./commands/provider-leaderboard"));
const Blacklist = __importStar(require("./commands/blacklist"));
// ═══════════════════════════════════════════════════════════════════════════
//  BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════════════
const services = {
    economy: new EconomyService_1.EconomyService(),
    user: new UserService_1.UserService(),
    crate: new CrateService_1.CrateService(),
    gambling: new GamblingService_1.GamblingService(),
    booking: new BookingService_1.BookingService(),
    providerStats: new ProviderStatsService_1.ProviderStatsService(),
    blacklist: new BlacklistService_1.BlacklistService(),
};
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.GuildVoiceStates,
        discord_js_1.GatewayIntentBits.GuildMembers,
    ],
});
// ═══════════════════════════════════════════════════════════════════════════
//  SLASH COMMAND REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════
async function registerCommands() {
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
    ].map((c) => c.toJSON());
    const rest = new discord_js_1.REST().setToken(config_1.config.token);
    const route = config_1.config.guildId
        ? discord_js_1.Routes.applicationGuildCommands(config_1.config.clientId, config_1.config.guildId)
        : discord_js_1.Routes.applicationCommands(config_1.config.clientId);
    await rest.put(route, { body: commands });
    console.log(`[Bot] Registered ${commands.length} slash commands.`);
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
            return;
        }
        // ── Modal submissions ────────────────────────────────────────────────
        if (interaction.isModalSubmit()) {
            const modal = interaction;
            if (modal.customId.startsWith('gudhrides-book-')) {
                await Book.handleBookModal(modal, services);
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
            default:
                console.warn(`[Bot] Unknown command: ${interaction.commandName}`);
        }
    }
    catch (err) {
        console.error('[Bot] Unhandled interaction error:', err);
        const msg = '`An error occurred. Please try again.`';
        try {
            if (interaction.isRepliable()) {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: msg, ephemeral: true });
                }
                else {
                    await interaction.reply({ content: msg, ephemeral: true });
                }
            }
        }
        catch { /* ignore reply errors */ }
    }
});
// ═══════════════════════════════════════════════════════════════════════════
//  STARTUP
// ═══════════════════════════════════════════════════════════════════════════
client.once(discord_js_1.Events.ClientReady, async (c) => {
    console.log(`[Bot] Logged in as ${c.user.tag}`);
    try {
        await registerCommands();
    }
    catch (err) {
        console.error('[Bot] Failed to register commands:', err);
    }
});
client.login(config_1.config.token).catch((err) => {
    console.error('[Bot] Login failed:', err);
    process.exit(1);
});
