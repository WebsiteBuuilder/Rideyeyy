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

Copy `.env.example` to `.env` and fill in values. See `.env.example` for the full list.

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Bot token |
| `CLIENT_ID` | Application client ID |
| `GUILD_ID` | Your server ID |
| `DATABASE_URL` | **Required.** Railway: Add Reference from PostgreSQL service |
| `ADMIN_ROLE_ID` | Admin role for `/admin` commands |
| `STAFF_ROLE_ID` | Staff role for tickets |
| `TICKET_CATEGORY_ID` | Category for booking channels (`0` = disabled; bot logs a startup warning) |
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
4. Set `NODE_ENV=production` on the bot service.
5. Set Discord env vars and `REGISTER_COMMANDS=true` for the first deploy.
6. Do **not** set `PGHOST`, `PGPASSWORD`, or other PG* vars — only `DATABASE_URL`.

Migrations run automatically on bot startup.

## Commands

| Command | Description |
|---------|-------------|
| `/balance` | Check RC balance |
| `/pay @user amount` | Transfer RC to another member |
| `/transactions [limit]` | Recent ledger entries (default 10, max 25) |
| `/leaderboard [limit]` | Top balances |
| `/inventory` | Crate items and cosmetic rewards |
| `/coinflip amount heads\|tails` | 49% win chance, 2× payout |
| `/dice amount target` | Roll 1–6; exact/adjacent multipliers |
| `/blackjack amount` | Interactive blackjack (hit, stand, double, surrender; no split) |
| `/crate bronze\|silver\|gold` | Open a loot crate |
| `/redeem option` | Spend RC for ride credit nickname tag |
| `/book` | Open a private booking ticket channel |
| `/ticket close\|claim\|list` | Staff ticket management |
| `/admin` | Economy snapshots, rollback, replay, balance set, redeem clear |

### Admin subcommands

| Subcommand | Description |
|------------|-------------|
| `snapshot` | Take economy-wide balance snapshot |
| `rollback economy` | Restore all balances from a snapshot ID |
| `rollback user` | Restore one user from nearest snapshot before timestamp |
| `replay` | Rebuild balances from transaction log (double confirm) |
| `setbalance` | Set a user balance with audit trail |
| `redeem clear` | Clear pending redemption and restore nickname |

## Smoke test checklist

After deploy or major changes:

1. **Startup** — Bot logs in; migrations apply; no `DATABASE_URL` errors.
2. **Balance** — `/balance` returns `0.00` RC for a new user.
3. **Admin set** — `/admin setbalance` adjusts balance; `/transactions` shows `admin_add` / `admin_remove`.
4. **Pay** — `/pay` transfers RC; both users see `transfer_out` / `transfer_in`.
5. **Gamble** — `/coinflip` or `/dice` debits and credits atomically.
6. **Blackjack** — Start game, stand or natural 21; `bet_transaction_id` / `payout_transaction_id` populated on completion.
7. **Crate** — `/crate bronze` debits price; `crate_opens` row exists; RC reward in one transaction.
8. **Redeem** — `/redeem` debits RC and creates pending row before nickname; pending visible if nickname fails.
9. **Invite** — New member join creates `pending` or `rejected` row; validator job runs hourly.
10. **Cosmetic role** — Gold crate cosmetic reward adds `role_grants`; expiry job removes role after `COSMETIC_ROLE_DURATION_DAYS`.

## Disaster recovery

1. **Take a snapshot** — `/admin snapshot` or wait for daily cron (`SNAPSHOT_CRON_SCHEDULE`).
2. **Full economy rollback** — `/admin rollback economy <snapshot_id>` restores all `user_balances` from `economy_snapshots`; audit row type `rollback` logged.
3. **Single user rollback** — `/admin rollback user` with user and ISO timestamp; uses `user_snapshots` + `setbalance` + rollback audit.
4. **Replay from ledger** — `/admin replay` rebuilds balances from `transactions` between timestamps (skips `system`, `admin`, `rollback` audit rows).
5. **Pending redeem stuck** — `/admin redeem clear @user` restores nickname and logs `admin` audit.
6. **Database** — Restore PostgreSQL from Railway backup; redeploy bot; verify `schema_migrations` includes latest version.

## Optional tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `BLACKJACK_TIMEOUT_SECONDS` | `300` | Auto-stand inactive blackjack games |
| `GAMBLE_MIN_BET` / `GAMBLE_MAX_BET` | `10` / `10000` | Bet limits |
| `CRATE_*_PRICE` | see `.env.example` | Bronze/silver/gold crate costs |
| `COSMETIC_ROLE_DURATION_DAYS` | `7` | Temporary cosmetic role length |
| `COSMETIC_ROLE_CRON_SCHEDULE` | `0 */6 * * *` | Job to remove expired cosmetic roles |

Configure gold crate cosmetic roles in Postgres: `UPDATE crate_rewards SET reward_metadata = '{"roleId":"<DISCORD_ROLE_ID>"}' WHERE reward_type = 'cosmetic_role' AND crate_type = 'gold';`

## Architecture

- **EconomyService** — sole writer to `user_balances`; `FOR UPDATE` row locks; atomic gamble/crate/redeem/blackjack flows
- **transactions** — immutable audit ledger (`rollback` / `admin` for zero-balance audit events)
- **economy_snapshots** / **user_snapshots** — recovery points
- **BackupService** — rollback and transaction replay
- **role_grants** — temporary cosmetic roles from crates

## License

Private — Rideey business use.
