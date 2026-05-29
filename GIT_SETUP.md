# 🔧 GIT & GITHUB SETUP GUIDE

## Pre-Deployment: Verify Git Setup

### Step 1: Verify Git Installed

```bash
git --version
# Should output: git version 2.x.x
```

### Step 2: Configure Git (First Time)

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### Step 3: Verify Repository State

```bash
cd c:\Users\elija\OneDrive\Desktop\Rideey

# Check current git status
git status

# Expected output:
# On branch main (or nothing if not initialized yet)
# nothing to commit, working tree clean
```

---

## Option A: Fresh Repository (Recommended)

If you haven't initialized git yet in the Rideey folder:

```bash
cd c:\Users\elija\OneDrive\Desktop\Rideey

# Initialize new repository
git init

# Verify files to commit
git status

# Add all files (respects .gitignore)
git add .

# Verify .env is NOT staged (should not appear in output)
git status

# Create initial commit
git commit -m "Initial commit: Rideey economy bot production-ready"

# Output should show all files committed except:
# - .env
# - node_modules/
# - dist/

# Verify commit created
git log --oneline
# Should show: abc1234 Initial commit: Rideey economy bot production-ready
```

### Verify .gitignore is Working

```bash
# These files should NOT appear in git status
git ls-files | grep -E "\.env|node_modules|dist"

# If any appear, fix .gitignore and re-stage
# (You already have correct .gitignore, just verify)
```

---

## Option B: Existing Repository

If you already have git initialized:

```bash
cd c:\Users\elija\OneDrive\Desktop\Rideey

# Check what's staged/uncommitted
git status

# If you see .env, node_modules, or dist — remove them:
git rm --cached .env
git rm -r --cached node_modules
git rm -r --cached dist

# Update .gitignore (already done in your repo)
git add .gitignore
git commit -m "Update gitignore to exclude sensitive files"

# Stage all changes
git add .

# Commit
git commit -m "Production-ready code for GitHub/Railway deployment"

# Verify
git log --oneline
```

---

## Create GitHub Repository

### Step 1: Create on GitHub.com

1. Go to [GitHub.com](https://github.com/new)
2. **Repository name**: `rideey-discord-bot` (or choose your name)
3. **Description**: "Route Cash (RC) economy bot for Rideey ride service — PostgreSQL-backed ledger with audit trail, snapshots, and recovery."
4. **Public/Private**: Choose based on preference (recommend Private for business)
5. **Initialize this repository with**: **LEAVE UNCHECKED** (we have our own files)
6. Click "Create repository"

### Step 2: Add Remote & Push

```bash
cd c:\Users\elija\OneDrive\Desktop\Rideey

# Add remote (replace USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/rideey-discord-bot.git

# Verify remote added
git remote -v
# Should output:
# origin  https://github.com/YOUR_USERNAME/rideey-discord-bot.git (fetch)
# origin  https://github.com/YOUR_USERNAME/rideey-discord-bot.git (push)

# Set default branch to main
git branch -M main

# Push to GitHub
git push -u origin main

# Output should show:
# Counting objects: XXX, done.
# Compressing objects: 100%, done.
# ...
# To https://github.com/YOUR_USERNAME/rideey-discord-bot.git
#  * [new branch]      main -> main
# Branch 'main' set up to track remote tracking branch 'main' from 'origin'.
```

### Step 3: Verify on GitHub

1. Go to your GitHub repository URL: `https://github.com/YOUR_USERNAME/rideey-discord-bot`
2. **Verify these files are present**:
   - ✅ `src/` folder
   - ✅ `package.json`
   - ✅ `tsconfig.json`
   - ✅ `README.md`
   - ✅ `DEPLOYMENT.md`
   - ✅ `QUICKSTART.md`
   - ✅ `railway.toml`
   - ✅ `.gitignore`
   - ✅ `.env.example`

3. **Verify these files are NOT present**:
   - ❌ `.env` (should not be visible)
   - ❌ `node_modules/` (should not be visible)
   - ❌ `dist/` (should not be visible)

4. **Verify file counts**: Should have ~30-40 files in repo (primarily TypeScript source + migrations + config)

---

## SSH Setup (Optional - Recommended for Future Pushes)

This makes future pushes faster (no password each time):

### Step 1: Generate SSH Key (First Time Only)

```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "your.email@example.com"

# Press Enter to accept default location (~/.ssh/id_ed25519)
# Enter a passphrase (can be empty, but recommended for security)

# Output should say:
# Your public key has been saved in C:\Users\YOUR_USERNAME\.ssh\id_ed25519.pub
```

### Step 2: Add SSH Key to GitHub

```bash
# Copy SSH public key to clipboard (Windows PowerShell)
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub | Set-Clipboard

# Go to GitHub Settings → SSH and GPG keys
# Click "New SSH key"
# Paste key, click "Add SSH key"
```

### Step 3: Switch to SSH Remote (Optional)

```bash
cd c:\Users\elija\OneDrive\Desktop\Rideey

# Change remote from HTTPS to SSH
git remote set-url origin git@github.com:YOUR_USERNAME/rideey-discord-bot.git

# Verify
git remote -v
# Should show: git@github.com:... instead of https://...

# Test SSH connection
ssh -T git@github.com
# Should output: Hi YOUR_USERNAME! You've successfully authenticated...
```

---

## Daily Workflow After Initial Setup

### Commit & Push Changes

```bash
cd c:\Users\elija\OneDrive\Desktop\Rideey

# Make code changes in src/, config files, etc.

# Check what changed
git status

# Stage changes
git add .

# Create commit
git commit -m "Description of changes"

# Push to GitHub (Railway auto-deploys)
git push

# Output should say:
# Counting objects: X, done.
# ...
# To github.com:YOUR_USERNAME/rideey-discord-bot.git
#    abc1234..def5678  main -> main
```

---

## ✅ Pre-Deployment Checklist

Before pushing to GitHub, verify:

- [ ] `npm run build` passes (zero errors)
- [ ] All 15 smoke tests pass locally
- [ ] `git status` shows "nothing to commit, working tree clean"
- [ ] `.env` is in `.gitignore`
- [ ] `node_modules/` is in `.gitignore`
- [ ] `dist/` is in `.gitignore`
- [ ] Initial commit created
- [ ] GitHub repository created
- [ ] Remote added (`git remote -v` shows origin)
- [ ] Push successful (`git push -u origin main` completed)
- [ ] GitHub repo shows all files (not .env, node_modules, dist)

---

## 🔐 Security: Never Commit Secrets

**NEVER commit these files**:
- ❌ `.env` (contains bot token)
- ❌ `node_modules/` (large + unnecessary)
- ❌ `dist/` (build output, rebuilt on Railway)
- ❌ `*.log` (log files)

**These are already in `.gitignore` ✅ — just verify**:

```bash
cat .gitignore
# Should contain:
# node_modules/
# .env
# dist/
# *.log
```

---

## 🚨 Oops: Committed `.env` Accidentally?

If you accidentally committed `.env` with secrets:

### Option A: Remove from History (Recommended)

```bash
# Remove .env from repository history
git rm --cached .env

# Create new commit
git commit -m "Remove .env from repository"

# Force push (ONLY if not deployed yet!)
git push -f origin main

# Regenerate Discord bot token in Discord Dev Portal
# (assume token was compromised)
```

### Option B: Fresh Repository

If multiple secrets were committed:

```bash
# Delete local repo
rm -r c:\Users\elija\OneDrive\Desktop\Rideey\.git

# Start over with git init
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/rideey-discord-bot.git
git push -u origin main
```

---

## 📞 GitHub Help

- **Sign up**: https://github.com/signup
- **Create repo**: https://github.com/new
- **Generate SSH key**: https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent
- **Clone repo**: `git clone <repo-url>`
- **Useful commands**:
  ```bash
  git log --oneline                    # View commit history
  git diff                             # See unstaged changes
  git status                           # Current state
  git add <file>                       # Stage specific file
  git commit -m "message"              # Create commit
  git push                             # Push to GitHub
  git pull                             # Pull from GitHub
  git branch                           # List branches
  git checkout -b <new-branch>         # Create new branch
  ```

---

## ✅ Success Criteria

You're done with Git setup when:

- ✅ Local repository initialized
- ✅ All files committed (except .env, node_modules, dist)
- ✅ GitHub repository created
- ✅ Remote added & verified
- ✅ Initial push successful
- ✅ GitHub repo shows correct files (no secrets)
- ✅ Ready for Railway to pull & deploy

**Next**: Proceed to Railway deployment (see DEPLOYMENT.md or QUICKSTART.md)
