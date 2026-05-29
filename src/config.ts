function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function envString(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value !== undefined) return value;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`Missing required environment variable: ${key}`);
}

function envInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) throw new Error(`Invalid integer for ${key}: ${raw}`);
  return parsed;
}

function envFloat(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined) return defaultValue;
  const parsed = parseFloat(raw);
  if (isNaN(parsed)) throw new Error(`Invalid float for ${key}: ${raw}`);
  return parsed;
}

function envBool(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return defaultValue;
  return raw === 'true' || raw === '1';
}

export const config = {
  discord: {
    token: requireEnv('DISCORD_TOKEN'),
    clientId: requireEnv('CLIENT_ID'),
    guildId: requireEnv('GUILD_ID'),
    registerCommands: envBool('REGISTER_COMMANDS', false),
  },
  roles: {
    admin: requireEnv('ADMIN_ROLE_ID'),
    staff: envString('STAFF_ROLE_ID', '0'),
    eliteInviter: envString('ELITE_INVITER_ROLE_ID', '0'),
    legendDriver: envString('LEGEND_DRIVER_ROLE_ID', '0'),
  },
  channels: {
    ticketCategory: envString('TICKET_CATEGORY_ID', '0'),
  },
  invite: {
    reward: envInt('INVITE_REWARD', 100),
    minAccountAgeDays: envInt('MIN_INVITEE_ACCOUNT_AGE_DAYS', 7),
    minStayDays: envInt('MIN_INVITEE_STAY_DAYS', 7),
    minMessages: envInt('MIN_INVITEE_MESSAGES', 5),
    minVcMinutes: envInt('MIN_INVITEE_VC_TIME_MINS', 30),
    milestones: {
      5: envInt('INVITE_MILESTONE_5', 200),
      10: envInt('INVITE_MILESTONE_10', 500),
      25: envInt('INVITE_MILESTONE_25', 1200),
      50: envInt('INVITE_MILESTONE_50', 2500),
      100: envInt('INVITE_MILESTONE_100', 6000),
    },
    milestoneTiers: [5, 10, 25, 50, 100] as const,
  },
  gambling: {
    minBet: envInt('GAMBLE_MIN_BET', 10),
    maxBet: envInt('GAMBLE_MAX_BET', 10000),
    coinflipWinChance: envInt('COINFLIP_WIN_CHANCE', 49),
    diceTargetMultiplier: envFloat('DICE_TARGET_MULTIPLIER', 4.5),
    diceAdjacentMultiplier: envFloat('DICE_ADJACENT_MULTIPLIER', 2),
    blackjackTimeoutSeconds: envInt('BLACKJACK_TIMEOUT_SECONDS', 300),
  },
  crates: {
    bronze: envInt('CRATE_BRONZE_PRICE', 250),
    silver: envInt('CRATE_SILVER_PRICE', 750),
    gold: envInt('CRATE_GOLD_PRICE', 2000),
  },
  redeem: {
    oneDollar: envInt('REDEEM_ONE_DOLLAR', 1500),
    twoDollar: envInt('REDEEM_TWO_DOLLAR', 3000),
    fiveDollar: envInt('REDEEM_FIVE_DOLLAR', 7000),
    tenDollar: envInt('REDEEM_TEN_DOLLAR', 12000),
    freeRide: envInt('REDEEM_FREE_RIDE', 20000),
  },
  cron: {
    snapshot: envString('SNAPSHOT_CRON_SCHEDULE', '0 0 * * *'),
    inviteValidator: envString('INVITE_VALIDATOR_CRON_SCHEDULE', '0 * * * *'),
  },
  limits: {
    commandCooldownMs: envInt('COMMAND_COOLDOWN_MS', 3000),
    gambleCooldownMs: envInt('GAMBLE_COOLDOWN_MS', 5000),
    crateCooldownMs: envInt('CRATE_COOLDOWN_MS', 5000),
  },
  logging: {
    level: envString('LOG_LEVEL', 'info'),
  },
} as const;

export type Config = typeof config;
