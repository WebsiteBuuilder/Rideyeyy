# Rideey Discord Economy Bot

Route Cash (RC) economy bot for the Rideey ride service — a financial-grade ledger with PostgreSQL, full audit trail, snapshots, and recovery tools.

## Tech Stack

- **Runtime:** Node.js 18+, TypeScript
- **Discord:** discord.js v14
- **Database:** PostgreSQL (Railway)
- **Deploy:** Railway.app

## Setup

### 1. Discord Application

1. Create an application at [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a bot and copy the **token** and **client ID**.
3. Enable **Privileged Gateway Intents:** Server Members, Message Content.
4. Invite the bot with permissions:
   - Manage Nicknames
   - Manage Channels
   - Manage Roles
   - View Channels, Send Messages
   - Read Message History

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in values:

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Bot token |
| `CLIENT_ID` | Application client ID |
| `GUILD_ID` | Your server ID |
| `DATABASE_URL` | **Required.** Railway: Add Reference from PostgreSQL service (never type manually) |
| `ADMIN_ROLE_ID` | Admin role for `/admin` commands |
| `STAFF_ROLE_ID` | Staff role for tickets |
| `TICKET_CATEGORY_ID` | Category for booking channels |
| `REGISTER_COMMANDS` | Set `true` once to register slash commands |

### 3. Local Development

```bash
npm install
# Set DATABASE_URL and Discord vars in .env
REGISTER_COMMANDS=true npm run dev
```

### 4. Railway Deployment

1. Create a new project on [Railway](https://railway.app).
2. Add **PostgreSQL** to the project.
3. On the **bot** service → **Variables** → **Add Reference** → PostgreSQL → **`DATABASE_URL`**
4. Set `NODE_ENV=production` on the bot service (Railway often sets this automatically).
5. Set Discord env vars and `REGISTER_COMMANDS=true` for the first deploy.
6. Do **not** set `PGHOST`, `PGPASSWORD`, or other PG* vars — only `DATABASE_URL`.

Migrations run automatically on bot startup.

## Commands

| Command | Description |
|---------|-------------|
| `/balance` | Check RC balance |
| `/pay` | Transfer RC |
| `/transactions` | Transaction history |
| `/leaderboard` | Top balances |
| `/inventory` | Crate items and rewards |
| `/coinflip` `/dice` `/blackjack` | Gambling (blackjack supports double down; stale games auto-stand after timeout) |
| `/crate` | Open loot crates |
| `/redeem` | Convert RC to ride credits (nickname tag) |
| `/book` | Open booking ticket |
| `/ticket` | Staff ticket management |
| `/admin` | Snapshots, rollback, replay (double confirm), balance set |

### Optional tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `BLACKJACK_TIMEOUT_SECONDS` | `300` | Auto-stand inactive blackjack games |
| `GAMBLE_MIN_BET` / `GAMBLE_MAX_BET` | `10` / `10000` | Bet limits |
| `CRATE_*_PRICE` | see `.env.example` | Bronze/silver/gold crate costs |

Configure gold crate cosmetic roles in Postgres (`crate_rewards.reward_metadata.roleId`).

## Architecture

- **EconomyService** — sole writer to `user_balances`; `FOR UPDATE` row locks
- **transactions** — immutable audit ledger
- **economy_snapshots** / **user_snapshots** — recovery points
- **BackupService** — rollback and transaction replay

## License

Private — Rideey business use.
