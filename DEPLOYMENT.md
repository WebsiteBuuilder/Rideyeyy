# PHASE 3: Deployment Readiness Checklist

## 🎯 Overview

This document covers everything needed to deploy Rideey Discord bot from local dev → GitHub → Railway.app.

**Current Status**: ✅ Code is production-ready (Phase 1 audit complete, zero TypeScript errors)

---

## 📋 PRE-DEPLOYMENT: LOCAL VERIFICATION

### Step 1: Environment Setup

```bash
cd c:\Users\elija\OneDrive\Desktop\Rideey
cp .env.example .env
```

Edit `.env`:
```
# CRITICAL: These MUST be filled
DISCORD_TOKEN=<your_bot_token>
CLIENT_ID=<your_app_client_id>
GUILD_ID=<your_server_id>
DATABASE_URL=postgresql://user:password@localhost:5432/rideey_dev

# IMPORTANT: Role IDs (get from Discord server)
ADMIN_ROLE_ID=<your_admin_role_id>
STAFF_ROLE_ID=<your_staff_role_id>
TICKET_CATEGORY_ID=<your_ticket_category_id>
ELITE_INVITER_ROLE_ID=<your_elite_role_id>
LEGEND_DRIVER_ROLE_ID=<your_legend_role_id>

# FIRST DEPLOY ONLY
REGISTER_COMMANDS=true

# Development
NODE_ENV=development
```

### Step 2: Discord Bot Setup

1. **Create Discord Application**:
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application"
   - Copy **Client ID** (for `CLIENT_ID`)

2. **Create Bot User**:
   - Click "Bot" → "Add Bot"
   - Copy **Token** (for `DISCORD_TOKEN`)
   - Enable **Privileged Gateway Intents**:
     - ✅ Server Members Intent
     - ✅ Message Content Intent
   - Click "Save"

3. **Generate Invite Link**:
   - OAuth2 → URL Generator
   - Select scopes: `bot`, `applications.commands`
   - Select permissions:
     - ✅ Manage Nicknames
     - ✅ Manage Channels
     - ✅ Manage Roles
     - ✅ View Channels
     - ✅ Send Messages
     - ✅ Read Message History
   - Copy generated URL, paste in browser
   - Authorize to your test server

4. **Get Server ID**:
   - Right-click server name
   - "Copy Server ID" (for `GUILD_ID`)

5. **Get Role IDs**:
   - Right-click each role → "Copy Role ID"
   - Set in `.env` (use `0` for optional roles)

### Step 3: Database Setup (Local Dev)

```bash
# On your system, install PostgreSQL or use Docker:
docker run -d \
  --name rideey-postgres \
  -e POSTGRES_DB=rideey_dev \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  postgres:15

# Verify connection (adjust DATABASE_URL as needed):
psql "postgresql://postgres:password@localhost:5432/rideey_dev" -c "SELECT NOW();"
```

Update `.env`:
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/rideey_dev
NODE_ENV=development
```

### Step 4: Build & Test Locally

```bash
# Install dependencies
npm install

# Verify TypeScript (should be 0 errors)
npm run build

# Verify migrations exist
ls -la dist/database/migrations/

# Expected output:
# V1__initial_schema.sql
# V2__seed_crate_rewards.sql
# V3__blackjack_deck.sql
# V4__role_grants.sql
```

### Step 5: Start Bot (Dev Mode)

```bash
# First deploy: register commands
REGISTER_COMMANDS=true npm run dev

# Expected startup log:
# Slash commands registered
# Applied migration: V1__initial_schema.sql
# Applied migration: V2__seed_crate_rewards.sql
# Applied migration: V3__blackjack_deck.sql
# Applied migration: V4__role_grants.sql
# Logged in as Rideey#1234
```

**If using `npm start` (production)**:
```bash
npm run build
npm start

# Should also show successful startup without reregistering commands
```

---

## ✅ SMOKE TEST CHECKLIST (Local)

After bot successfully starts, run these tests in your Discord server:

| # | Test | Command | Expected Result | Location |
|---|------|---------|-----------------|----------|
| 1 | **Bot Responds** | `/balance` on new user | `0.00 RC` | EconomyService |
| 2 | **Admin Balance Set** | `/admin balance @user 50000` | Balance updated; audit logged | admin.ts |
| 3 | **Pay Transfer** | `/pay @other 1000 "test"` | Both see `transfer_in`/`transfer_out` | economy.ts |
| 4 | **Transactions Query** | `/transactions` | Shows ledger entries | economy.ts |
| 5 | **Leaderboard** | `/leaderboard` | Top balance holders listed | economy.ts |
| 6 | **Coinflip** | `/coinflip 100 heads` | Win or loss; balance updates | gambling.ts |
| 7 | **Dice** | `/dice 100 3` | Roll result; balance updates | gambling.ts |
| 8 | **Blackjack Start** | `/blackjack 100` | Game UI with buttons | gambling.ts |
| 9 | **Blackjack Hit** | Click "Hit" button | Hand updates; no action if bust | gambling.ts |
| 10 | **Blackjack Stand** | Click "Stand" button | Dealer plays; result and payout shown | gambling.ts |
| 11 | **Crate Bronze** | `/crate bronze` | Crate opens; reward shown; balance -250 RC | crates.ts |
| 12 | **Redeem Credit** | `/redeem five_dollar_credit` | RC deducted; nickname tagged with "\| -$5 CREDIT" | redeem.ts |
| 13 | **Inventory** | `/inventory` | Shows items from crates | economy.ts |
| 14 | **Create Ticket** | `/book` | Private channel created; visible to user + staff | tickets.ts |
| 15 | **Snapshot** | `/admin snapshot create` | Snapshot ID returned | admin.ts |

**All 15 tests must pass before proceeding to GitHub/Railway.**

---

## 🌐 GITHUB SETUP

### Step 1: Initialize Repository

```bash
cd c:\Users\elija\OneDrive\Desktop\Rideey

# Initialize git
git init
git add .
git commit -m "Initial commit: Rideey economy bot production-ready"

# Verify .gitignore excludes .env
cat .gitignore
# Should contain: .env, node_modules/, dist/
```

### Step 2: Create GitHub Repository

1. Go to [GitHub.com](https://github.com/new)
2. Create new repository: `rideey-discord-bot` (or your chosen name)
3. **Do NOT initialize with README** (we have one)
4. After creation, follow "push existing repository" instructions:

```bash
git remote add origin https://github.com/YOUR_USERNAME/rideey-discord-bot.git
git branch -M main
git push -u origin main
```

### Step 3: Verify GitHub

- Check repo appears on GitHub
- Verify `.env` is NOT in the repo (check `.github` to confirm `.gitignore` working)
- Verify `dist/` is NOT in repo
- Verify `package.json`, `src/`, migrations, README, etc. are present

---

## 🚀 RAILWAY DEPLOYMENT

### Step 1: Railway Setup

1. Go to [Railway.app](https://railway.app)
2. Click "Create New Project"
3. **Add PostgreSQL service**:
   - Click "Add Service" → "Database" → "PostgreSQL"
   - Wait for database to provision
4. **Create bot service from GitHub**:
   - Click "Add Service" → "GitHub Repo"
   - Authorize Railway to access your GitHub account
   - Select `rideey-discord-bot` repository
   - Click "Deploy"

### Step 2: Configure Bot Service Variables

**Discord Variables**:
```
DISCORD_TOKEN=<your_bot_token>
CLIENT_ID=<your_app_client_id>
GUILD_ID=<your_server_id>
ADMIN_ROLE_ID=<your_admin_role>
STAFF_ROLE_ID=<your_staff_role>
TICKET_CATEGORY_ID=<your_ticket_category>
ELITE_INVITER_ROLE_ID=<elite_role_or_0>
LEGEND_DRIVER_ROLE_ID=<legend_role_or_0>
```

**Database**:
- Click "Add Reference" → Select PostgreSQL service
- Variable name: `DATABASE_URL`
- Railway auto-populates the connection string

**Environment**:
```
NODE_ENV=production
REGISTER_COMMANDS=true   # SET THIS FOR FIRST DEPLOY ONLY
LOG_LEVEL=info
SNAPSHOT_CRON_SCHEDULE=0 0 * * *
INVITE_VALIDATOR_CRON_SCHEDULE=0 * * * *
COSMETIC_ROLE_CRON_SCHEDULE=0 */6 * * *
```

**Rate Limits** (optional, use defaults or customize):
```
COMMAND_COOLDOWN_MS=3000
GAMBLE_COOLDOWN_MS=5000
CRATE_COOLDOWN_MS=5000
```

**Gambling/Economy** (optional, use defaults or customize):
```
INVITE_REWARD=100
GAMBLE_MIN_BET=10
GAMBLE_MAX_BET=10000
CRATE_BRONZE_PRICE=250
CRATE_SILVER_PRICE=750
CRATE_GOLD_PRICE=2000
```

### Step 3: Deploy

1. Click "Deploy" on the bot service
2. Watch logs for startup messages:
   ```
   Applied migration: V1__initial_schema.sql
   Applied migration: V2__seed_crate_rewards.sql
   Applied migration: V3__blackjack_deck.sql
   Applied migration: V4__role_grants.sql
   Slash commands registered
   Logged in as Rideey#1234
   ```

3. If successful, you should see:
   ```
   Deploy successful
   ```

### Step 4: Post-Deploy: Disable Command Registration

⚠️ **CRITICAL**: After first successful deploy, **disable command registration**:

1. Go to bot service Variables
2. Change `REGISTER_COMMANDS=false`
3. Click "Save" (auto-redeploy)
4. Watch logs — should NOT show "Slash commands registered"

This prevents unnecessary re-registration on every restart.

---

## ✅ POST-DEPLOYMENT VALIDATION

### Check 1: Bot is Online

1. Go to your Discord server
2. Look for "Rideey" in the member list with "Online" status
3. Should see all 7 commands in `/` autocomplete

### Check 2: Database Migrations

In Railway dashboard:
- Click PostgreSQL service
- Click "Data" tab
- Query to verify tables exist:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

**Should return 16 tables**:
- user_balances ✅
- transactions ✅
- economy_snapshots ✅
- user_snapshots ✅
- server_invite_codes ✅
- invite_tracking ✅
- invite_milestones_awarded ✅
- blackjack_games ✅
- crate_rewards ✅
- crate_opens ✅
- user_activity ✅
- user_inventory ✅
- tickets ✅
- redeem_transactions ✅
- role_grants ✅
- schema_migrations ✅

### Check 3: Crate Rewards Seeded

```sql
SELECT COUNT(*) FROM crate_rewards;
```

**Should return `22`** (all rewards seeded)

### Check 4: Run Smoke Tests in Discord

Repeat all 15 tests from Local Smoke Test Checklist in your production Discord server. All must pass.

### Check 5: Monitor Logs

In Railway dashboard:
- Click bot service
- Click "Logs" tab
- Watch for errors (should be none after initial startup)
- Verify scheduled jobs logging at their cron times

---

## 🔐 SECURITY CHECKLIST

Before going live, verify:

- ✅ `.env` NOT committed to GitHub (check `.gitignore`)
- ✅ `DATABASE_URL` set via Railway Reference (not hardcoded)
- ✅ Bot token rotated (regenerate in Discord if leaked)
- ✅ Admin/Staff role IDs are correct Discord role IDs
- ✅ `NODE_ENV=production` set in Railway
- ✅ SSL enabled for database (Railway handles this automatically)
- ✅ Logs don't contain sensitive data (they don't)

---

## 🆘 TROUBLESHOOTING

### "Missing required environment variable: DATABASE_URL"

**Cause**: Database connection not set
**Fix**: In Railway bot service Variables, add Reference to PostgreSQL

### "DISCORD_TOKEN invalid"

**Cause**: Token is wrong or regenerated
**Fix**: Go to Discord Developer Portal, regenerate bot token, update Railway Variables

### "Migrations failed"

**Cause**: Database already has tables or schema conflict
**Fix**: In Railway, delete PostgreSQL service and recreate (fresh database)

### "GUILD_ID not found"

**Cause**: Bot can't access your server
**Fix**: Verify bot is invited to server with proper intents; verify GUILD_ID is correct

### "Slash commands not showing"

**Cause**: Either not registered or REGISTER_COMMANDS=false during first deploy
**Fix**: Set `REGISTER_COMMANDS=true`, redeploy once, then set to `false`

### "Commands respond slowly"

**Cause**: Cold start or database connections
**Fix**: Normal for first few runs; should stabilize after 30 seconds

---

## 📊 SUCCESS CRITERIA

✅ **Deployment is successful when:**

- Bot appears online in Discord
- All 7 commands visible in `/` autocomplete
- All 15 smoke tests pass
- No errors in Railway logs
- Database has all 16 tables
- Scheduled jobs execute on cron schedule
- No sensitive data in logs

---

## 🔄 UPDATES & RE-DEPLOYMENTS

After initial deployment:

1. Make code changes locally
2. Run `npm run build` and smoke tests
3. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Describe changes"
   git push origin main
   ```
4. Railway automatically redeploys
5. Monitor logs for successful startup

---

## 📞 SUPPORT

Refer to:
- README.md for command reference
- ULTIMATE PROMPT (in project notes) for architecture details
- Railway docs: https://railway.app/docs
- discord.js docs: https://discord.js.org/docs
