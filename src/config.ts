// ═══════════════════════════════════════════════════════════════════════════
//  BOT CONFIGURATION — loaded from environment variables
// ═══════════════════════════════════════════════════════════════════════════

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

export const config = {
  // Discord
  token:     requireEnv('DISCORD_TOKEN'),
  clientId:  requireEnv('DISCORD_CLIENT_ID'),
  guildId:   process.env['DISCORD_GUILD_ID'] ?? '',

  // Database
  databaseUrl: requireEnv('DATABASE_URL'),

  // Roles — Rider = customer; Provider = driver (never grant Provider on verify).
  roles: {
    admin:      process.env['ADMIN_ROLE_ID']     ?? '0',
    staff:      process.env['STAFF_ROLE_ID']     ?? '0',
    provider:   process.env['PROVIDER_ROLE_ID']  ?? '0',
    vip:        process.env['VIP_ROLE_ID']       ?? '',
    exclusive:  process.env['EXCLUSIVE_ROLE_ID'] ?? '',
    rider:      process.env['RIDER_ROLE_ID']     ?? '1510042972371292222',
    unverified: process.env['UNVERIFIED_ROLE_ID'] ?? '1520555170889469972',
  },

  // Channels
  channels: {
    bookingCategory: process.env['BOOKING_CATEGORY_ID'] ?? '0',
    vouch:           process.env['VOUCH_CHANNEL_ID']      ?? '0',
    transcript:      process.env['TRANSCRIPT_CHANNEL_ID'] ?? '1520338486467498174',
    orderHere:       process.env['ORDER_CHANNEL_ID']      ?? '1509654528801243316',
    casino:          process.env['CASINO_CHANNEL_ID']     ?? '1509652333070651444',
    verify:          process.env['VERIFY_CHANNEL_ID']   ?? '1509654341458595890',
  },

  // VaultCord-lite: backup server invite link for admin mass-DM pull.
  backup: {
    serverInviteUrl: process.env['BACKUP_SERVER_INVITE_URL'] ?? '',
  },

  // Invite economy bonuses (amounts beyond per-invite rewardAmount in InviteConfig).
  inviteEconomy: {
    firstOrderBonusRc: Number(process.env['INVITE_FIRST_ORDER_BONUS'] ?? 100),
  },

  // Daily reward
  daily: {
    reward:        Number(process.env['DAILY_REWARD']         ?? 100),
    cooldownHours: Number(process.env['DAILY_COOLDOWN_HOURS'] ?? 24),
    streakBonus:   Number(process.env['DAILY_STREAK_BONUS']   ?? 10),
    maxStreak:     Number(process.env['DAILY_MAX_STREAK']     ?? 7),
  },

  // Crate costs
  crates: {
    bronze: Number(process.env['CRATE_COST_BRONZE'] ?? 500),
    silver: Number(process.env['CRATE_COST_SILVER'] ?? 1500),
    gold:   Number(process.env['CRATE_COST_GOLD']   ?? 5000),
  },

  // Rate limits
  limits: {
    commandCooldownMs: Number(process.env['COMMAND_COOLDOWN_MS'] ?? 3_000),
    gambleCooldownMs:  Number(process.env['GAMBLE_COOLDOWN_MS']  ?? 5_000),
    crateCooldownMs:   Number(process.env['CRATE_COOLDOWN_MS']   ?? 10_000),
    bookCooldownMs:    90_000,
  },

  // Invite reward system — defaults used to seed InviteConfig on first run.
  // After seeding, live values are read from the InviteConfig table and are
  // editable via /admin economy.
  invite: {
    sweepIntervalMs:          Number(process.env['INVITE_SWEEP_INTERVAL_MS']    ?? 30_000),
    defaultReward:            Number(process.env['INVITE_REWARD']               ?? 30),
    defaultVerifyDelaySec:    Number(process.env['INVITE_VERIFY_DELAY_SEC']     ?? 600),
    defaultMinAccountAgeDays: Number(process.env['INVITE_MIN_ACCOUNT_AGE_DAYS'] ?? 7),
    // Default milestone ladder seeded (upserted by threshold) on first run.
    // rewardRideKey grants a redemption code; rewardTickets grants lottery
    // tickets; rewardRoleId grants a role.
    defaultMilestones: [
      { threshold: 1,  rewardAmount: 30,  rewardRideKey: null,           rewardRoleId: null,                                      rewardTickets: 0,  label: 'First Invite' },
      { threshold: 5,  rewardAmount: 175, rewardRideKey: null,           rewardRoleId: null,                                      rewardTickets: 0,  label: 'Recruiter' },
      { threshold: 10, rewardAmount: 400, rewardRideKey: null,           rewardRoleId: null,                                      rewardTickets: 0,  label: 'Connector' },
      { threshold: 20, rewardAmount: 0,   rewardRideKey: 'RIDE_FREE_20', rewardRoleId: null,                                      rewardTickets: 0,  label: 'Free Ride' },
      { threshold: 35, rewardAmount: 0,   rewardRideKey: 'RIDE_FREE_20', rewardRoleId: (process.env['VIP_ROLE_ID'] ?? '') || null,       rewardTickets: 0,  label: 'VIP' },
      { threshold: 50, rewardAmount: 0,   rewardRideKey: null,           rewardRoleId: (process.env['EXCLUSIVE_ROLE_ID'] ?? '') || null, rewardTickets: 25, label: 'Legend' },
    ] as ReadonlyArray<{
      threshold: number;
      rewardAmount: number;
      rewardRideKey: string | null;
      rewardRoleId: string | null;
      rewardTickets: number;
      label: string;
    }>,
  },

  // Referral economy expansion — shop, lottery, redemption codes.
  economy: {
    // Human-readable labels for reward keys used across shop / milestones /
    // lottery and shown on generated redemption codes.
    rewardLabels: {
      RIDE_FREE_20:     'FREE $20 Ride',
      RIDE_DISCOUNT_5:  '$5 Ride Discount',
    } as Record<string, string>,
    // Default shop catalogue (upserted by key on first run).
    defaultShopItems: [
      { key: 'RIDE_DISCOUNT_5', label: '$5 Ride Discount', priceRc: 300,  rewardKey: 'RIDE_DISCOUNT_5', sortOrder: 1 },
      { key: 'RIDE_FREE_20',    label: 'FREE $20 Ride',    priceRc: 2000, rewardKey: 'RIDE_FREE_20',    sortOrder: 2 },
    ],
    lottery: {
      // Weekly draw schedule (UTC). 0 = Sunday.
      drawDayOfWeek: Number(process.env['LOTTERY_DRAW_DOW']  ?? 0),
      drawHourUtc:   Number(process.env['LOTTERY_DRAW_HOUR'] ?? 18),
      schedulerIntervalMs: Number(process.env['SCHEDULER_INTERVAL_MS'] ?? 60_000),
    },
  },
} as const;
