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
2. Add **PostgreSQL** to the project (separate service).
3. On your **bot** service → **Variables**:
   - Delete any existing `DATABASE_URL`
   - **New Variable** → **Reference** → PostgreSQL service → select **`DATABASE_PRIVATE_URL`**
   - Name the variable on the bot: **`DATABASE_URL`** (our code reads this name; the value comes from private URL)
4. Connect GitHub repo, branch `main`.
5. Set Discord env vars (`DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `ADMIN_ROLE_ID`, etc.).
6. Set `REGISTER_COMMANDS=true` for the first deploy, then `false`.
7. Build: `npm run build` | Start: `npm start`

**Error `password authentication failed for user "postgres"`**

1. Bot `DATABASE_URL` must **Reference** Postgres → **`DATABASE_PRIVATE_URL`** (not the public URL).
2. Delete any duplicate/manual `DATABASE_URL` on the bot service.
3. In Railway Postgres service → **Settings** → **Reset Credentials** → redeploy bot.
4. Check deploy logs for `[db] target host=... network=private` — if `network=public`, switch to `DATABASE_PRIVATE_URL` reference.

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
