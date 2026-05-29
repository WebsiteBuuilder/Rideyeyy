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
| `DATABASE_URL` | PostgreSQL connection string |
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
2. Add **PostgreSQL** plugin — `DATABASE_URL` is injected automatically.
3. Connect your GitHub repo or deploy from CLI.
4. Set all env vars from `.env.example` in Railway Variables.
5. Set `REGISTER_COMMANDS=true` for the first deploy, then set back to `false`.
6. Build command: `npm run build`
7. Start command: `npm start`

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
