# 📋 QUICK REFERENCE: Local Dev → GitHub → Railway

## PHASE 1: Discord Bot Setup (5 min)

```
Discord Developer Portal (https://discord.com/developers/applications)
├─ Create Application "Rideey"
├─ Create Bot → Copy TOKEN (DISCORD_TOKEN)
├─ Copy Client ID (CLIENT_ID)
├─ Enable Gateway Intents: ✓ Server Members ✓ Message Content
├─ OAuth2 → scopes: bot, applications.commands
├─ Permissions: Manage Nicknames, Manage Roles, Manage Channels, 
│  View Channels, Send Messages, Read Message History
├─ Generate invite URL → Authorize to test server
└─ Right-click server → Copy ID (GUILD_ID)
```

## PHASE 2: Local Database (5 min)

```bash
# Docker (easiest)
docker run -d --name rideey-postgres \
  -e POSTGRES_DB=rideey_dev \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  postgres:15

# OR: Install PostgreSQL locally and create rideey_dev database
```

## PHASE 3: Configure Environment (2 min)

```bash
cd c:\Users\elija\OneDrive\Desktop\Rideey
cp .env.example .env
```

Edit `.env`:
```
DISCORD_TOKEN=<token_from_discord>
CLIENT_ID=<client_id_from_discord>
GUILD_ID=<server_id>
DATABASE_URL=postgresql://postgres:password@localhost:5432/rideey_dev
ADMIN_ROLE_ID=<admin_role_id>
STAFF_ROLE_ID=<staff_role_id>
TICKET_CATEGORY_ID=0
REGISTER_COMMANDS=true
NODE_ENV=development
```

## PHASE 4: Build & Test Locally (3 min)

```bash
npm install
npm run build

# Verify migrations copied
ls -la dist/database/migrations/
```

## PHASE 5: Start Bot (1 min)

```bash
REGISTER_COMMANDS=true npm run dev
```

**Expected**:
```
Applied migration: V1__initial_schema.sql
Applied migration: V2__seed_crate_rewards.sql
Applied migration: V3__blackjack_deck.sql
Applied migration: V4__role_grants.sql
Slash commands registered
Logged in as Rideey#1234
```

## PHASE 6: Smoke Test (5 min)

Run these 15 commands in Discord:

```
1. /balance                              → 0.00 RC ✓
2. /admin balance @you 50000             → Set balance ✓
3. /pay @someone 1000 "test"             → Transfer ✓
4. /transactions                         → Ledger entries ✓
5. /leaderboard                          → Top balances ✓
6. /coinflip 100 heads                   → Win/loss ✓
7. /dice 100 3                           → Roll result ✓
8. /blackjack 100                        → Game UI ✓
9. Hit button                            → Update hand ✓
10. Stand button                         → Resolve game ✓
11. /crate bronze                        → Open crate ✓
12. /redeem five_dollar_credit           → Tag nickname ✓
13. /inventory                           → Show items ✓
14. /book                                → Create ticket ✓
15. /admin snapshot create               → Snapshot ID ✓
```

**All must pass ✓ before GitHub/Railway**

---

## PHASE 7: GitHub Setup (5 min)

```bash
git init
git add .
git commit -m "Initial: Rideey economy bot production-ready"

# Create repo on github.com (DO NOT init with README)
git remote add origin https://github.com/YOUR_USERNAME/rideey-discord-bot.git
git branch -M main
git push -u origin main

# Verify:
# ✓ .env NOT in repo (check .gitignore working)
# ✓ src/, migrations, package.json ARE in repo
```

---

## PHASE 8: Railway Deployment (10 min)

### 8A: Create Project
```
Railway.app
├─ Create New Project
├─ Add PostgreSQL (database auto-provisioned)
└─ Add GitHub Service → rideey-discord-bot repo
```

### 8B: Configure Variables (on bot service)

**Discord**:
```
DISCORD_TOKEN=<token>
CLIENT_ID=<client_id>
GUILD_ID=<guild_id>
ADMIN_ROLE_ID=<role_id>
STAFF_ROLE_ID=<role_id>
TICKET_CATEGORY_ID=0
ELITE_INVITER_ROLE_ID=0
LEGEND_DRIVER_ROLE_ID=0
```

**Database** (click "Add Reference" → PostgreSQL):
```
DATABASE_URL=<auto-populated>
```

**Environment**:
```
NODE_ENV=production
REGISTER_COMMANDS=true    # FIRST DEPLOY ONLY
LOG_LEVEL=info
```

**Crons** (use defaults or customize):
```
SNAPSHOT_CRON_SCHEDULE=0 0 * * *
INVITE_VALIDATOR_CRON_SCHEDULE=0 * * * *
COSMETIC_ROLE_CRON_SCHEDULE=0 */6 * * *
```

### 8C: Deploy
1. Click "Deploy"
2. Watch logs for success (same as local startup)
3. Should see: "Logged in as Rideey#1234"

### 8D: Post-Deploy (IMPORTANT)
After successful deploy:
1. Change `REGISTER_COMMANDS=false`
2. Save (auto-redeploy)
3. Verify logs don't show "Slash commands registered" again

---

## PHASE 9: Post-Deployment Check (5 min)

- [ ] Bot online in Discord
- [ ] All commands visible in `/` autocomplete
- [ ] Run all 15 smoke tests in production Discord server
- [ ] No errors in Railway logs
- [ ] Database tables exist (query PostgreSQL in Railway)

---

## 🔴 EMERGENCY: Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| **"DATABASE_URL not set"** | Missing Railway Reference | Add PostgreSQL Reference to Variables |
| **"DISCORD_TOKEN invalid"** | Bad token | Regenerate in Discord Dev Portal |
| **"Migrations failed"** | DB conflict | Delete PostgreSQL, recreate fresh |
| **"Slash commands not showing"** | Not registered | Set `REGISTER_COMMANDS=true`, deploy, set to `false` |
| **"Bot not responding"** | Offline | Check Railway logs for startup errors |

---

## ✅ SUCCESS = Bot Online + All 15 Tests Pass

**Estimated Total Time**: 30-45 minutes

**You are here**: Phase 1-5 code ready ✅ | Follow Phases 6-9 to deploy

**Next**: Run Phase 6 smoke tests locally, then follow Phases 7-9 for GitHub/Railway
