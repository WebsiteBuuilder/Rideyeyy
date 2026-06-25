"use strict";
// ═══════════════════════════════════════════════════════════════════════════
//  BOT CONFIGURATION — loaded from environment variables
// ═══════════════════════════════════════════════════════════════════════════
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
function requireEnv(key) {
    const val = process.env[key];
    if (!val)
        throw new Error(`Missing required environment variable: ${key}`);
    return val;
}
exports.config = {
    // Discord
    token: requireEnv('DISCORD_TOKEN'),
    clientId: requireEnv('DISCORD_CLIENT_ID'),
    guildId: process.env['DISCORD_GUILD_ID'] ?? '',
    // Database
    databaseUrl: requireEnv('DATABASE_URL'),
    // Roles
    roles: {
        admin: process.env['ADMIN_ROLE_ID'] ?? '0',
        staff: process.env['STAFF_ROLE_ID'] ?? '0',
        provider: process.env['PROVIDER_ROLE_ID'] ?? '0',
    },
    // Channels
    channels: {
        bookingCategory: process.env['BOOKING_CATEGORY_ID'] ?? '0',
        vouch: process.env['VOUCH_CHANNEL_ID'] ?? '0',
    },
    // Daily reward
    daily: {
        reward: Number(process.env['DAILY_REWARD'] ?? 100),
        cooldownHours: Number(process.env['DAILY_COOLDOWN_HOURS'] ?? 24),
        streakBonus: Number(process.env['DAILY_STREAK_BONUS'] ?? 10),
        maxStreak: Number(process.env['DAILY_MAX_STREAK'] ?? 7),
    },
    // Crate costs
    crates: {
        bronze: Number(process.env['CRATE_COST_BRONZE'] ?? 500),
        silver: Number(process.env['CRATE_COST_SILVER'] ?? 1500),
        gold: Number(process.env['CRATE_COST_GOLD'] ?? 5000),
    },
    // Rate limits
    limits: {
        commandCooldownMs: Number(process.env['COMMAND_COOLDOWN_MS'] ?? 3000),
        gambleCooldownMs: Number(process.env['GAMBLE_COOLDOWN_MS'] ?? 5000),
        crateCooldownMs: Number(process.env['CRATE_COOLDOWN_MS'] ?? 10000),
        bookCooldownMs: 300000,
    },
};
