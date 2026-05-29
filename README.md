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
3. **Connect Postgres to the bot (fixes 28P01 auth errors):**
   - Open the **PostgreSQL** service → **Connect**
   - Select your **bot** service
   - Railway injects `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` on the bot
4. On the **bot** → **Variables** → delete any manual `DATABASE_URL` (optional once PG* vars exist)
5. Connect GitHub repo [WebsiteBuuilder/Rideyeyy](https://github.com/WebsiteBuuilder/Rideyeyy), branch `main`
6. Set Discord env vars and `REGISTER_COMMANDS=true` for first deploy
7. Logs should show: `[db] mode=railway-pg-vars` and `Database connection verified`

**Error `password authentication failed (28P01)`**

1. PostgreSQL → **Connect** → select bot (not only a DATABASE_URL reference)
2. Delete manual `DATABASE_URL` on bot
3. Postgres → **Settings** → **Reset Credentials** → **Connect** again → redeploy bot

Migrations run automatically on bot startup.

## Commands

| Command | Description |
|---------|-------------|
| `/balance` | Check RC balance |
| `/pay` | Transfer RC |
| `/transactions` | Transaction history |
| `/leaderboard` | Top balances |
| `/coinflip` `/dice` `/blackjack` | Gambling |
| `/crate` | Open loot crates |
| `/redeem` | Convert RC to ride credits (nickname tag) |
| `/book` | Open booking ticket |
| `/ticket` | Staff ticket management |
| `/admin` | Snapshots, rollback, replay, balance set |

## Architecture

- **EconomyService** — sole writer to `user_balances`; `FOR UPDATE` row locks
- **transactions** — immutable audit ledger
- **economy_snapshots** / **user_snapshots** — recovery points
- **BackupService** — rollback and transaction replay

## License

Private — Rideey business use.
