# DynastyDraft — Start Here

You have **two projects** in this repository:

| Folder | What it is | Port |
|--------|------------|------|
| **`dynasty-draft/`** | **DynastyDraft** — the new standalone game | 3850 |
| Everything else | HoopComps (card scout app) | 3847 |

**Ignore HoopComps** if you're done with it. All DynastyDraft work happens inside `dynasty-draft/`.

---

## Part 1: Run the game on your Mac (5 minutes)

### Step 1 — Open Terminal

Open Terminal (or use the terminal inside Cursor).

### Step 2 — Go to the app folder

```bash
cd ~/Projects/hoops-card-hunter/dynasty-draft
```

### Step 3 — (Optional) Set a secret for production-like auth

For local play you can skip this. For anything shared online, create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and change `JWT_SECRET` to any long random string.

### Step 4 — Start the server

```bash
node server.mjs
```

You should see:

```
🏀 DynastyDraft running on http://localhost:3850
  Accounts: 0 registered
```

Leave this terminal window open while you play.

### Step 5 — Open the game in your browser

Go to: **http://localhost:3850**

### Step 6 — Create an account

1. Click **Sign in** (top right)
2. Click **Create account**
3. Fill in email, password, display name, and **username** (username lets friends find you)
4. Submit

### Step 7 — Play today's challenge

1. Click **Reveal Today's Challenge** (spin animation)
2. Tap each position tab (PG, SG, SF, PF, C, 6th) and pick a player
3. When all six slots are filled, click **Simulate Season →**
4. Read your grade, record, playoff results, and stories
5. Share your result or check the daily leaderboard

### Step 8 — Verify everything works (optional)

In a **second** terminal (keep the server running in the first):

```bash
cd ~/Projects/hoops-card-hunter/dynasty-draft
node scripts/smoke-test.mjs
```

You should see `OK DynastyDraft smoke test passed`.

---

## Part 2: What gets saved where

When you play, data is written to `dynasty-draft/data/`:

| File | Contents |
|------|----------|
| `data/users.json` | Account emails, usernames (passwords are hashed) |
| `data/dynasty-db.json` | Daily challenges, your lineups, scores, streaks |
| `data/social.json` | Friend requests |
| `data/dynasty/*.json` | Game content (teams, players, modifiers) — **don't delete** |

These files are gitignored so your local accounts aren't committed by accident.

---

## Part 3: Deploy online so others can play

**Full walkthrough:** **[DEPLOY_RENDER.md](./DEPLOY_RENDER.md)** (step-by-step with screenshots-level detail).

### Short version — Render

1. Push `dynasty-draft/` to GitHub (Part 4 below)
2. [render.com](https://render.com) → **New → Web Service** → connect repo
3. **Root Directory:** `dynasty-draft` · **Start Command:** `node server.mjs` · **Build Command:** *(empty)*
4. Env vars: `NODE_ENV=production`, `JWT_SECRET` = Generate
5. **Health Check Path:** `/api/health`
6. Deploy → open `https://dynasty-draft.onrender.com` (or your chosen name)

**Free tier:** works, but accounts reset on redeploy. **Starter ($7/mo) + 1 GB disk** keeps accounts — see DEPLOY_RENDER.md.

### After deploy

- Share the public URL
- Create a **new** account on the live site (separate from localhost)
- Daily leaderboard resets at **UTC midnight**

---

## Part 4: Git — what to commit

DynastyDraft lives in a subfolder today. You can either:

### Keep one repo (simplest for now)

From the repo root:

```bash
cd ~/Projects/hoops-card-hunter
git add dynasty-draft/
git commit -m "Add standalone DynastyDraft app"
git push
```

Only `dynasty-draft/` needs to be pushed for the game; HoopComps changes are separate.

### Split into its own repo later (cleaner long-term)

```bash
cd ~/Projects
git clone hoops-card-hunter dynasty-draft-app
cd dynasty-draft-app
# remove everything except dynasty-draft, move contents up, etc.
```

Ask if you want help with this — not required to play locally.

---

## Part 5: How to keep building the game

### Folder map

```
dynasty-draft/
├── server.mjs              ← HTTP server, auth routes, static files
├── public/
│   ├── index.html          ← Page shell
│   ├── js/
│   │   ├── app.js          ← Auth UI, bootstraps game
│   │   ├── game-ui.js      ← Spin, draft, results screens
│   │   ├── api.js          ← Calls to /api/dynasty/*
│   │   └── auth.js         ← Login/register/session
│   └── css/
│       ├── base.css        ← Layout, buttons, modal
│       └── app.css         ← Game styling (orange/black)
└── lib/
    ├── routes.mjs          ← Game API endpoints
    ├── challenge.mjs       ← Daily challenge generation
    ├── players.mjs         ← Player pools & ratings
    ├── simulate.mjs        ← Season + playoff simulation
    ├── scoring.mjs         ← Points calculation
    ├── grade.mjs           ← Letter grades
    └── store.mjs           ← Saves submissions & streaks
```

### Common tasks

| You want to… | Edit… |
|--------------|-------|
| Add real players | `data/dynasty/players-seed.json` |
| Refresh full NBA rosters | `npm run build:rosters` (see Part 8) |
| Add teams | `data/dynasty/teams.json` |
| Add challenge modifiers | `data/dynasty/modifiers.json` |
| Change scoring | `lib/scoring.mjs` |
| Change UI / animations | `public/js/game-ui.js`, `public/css/app.css` |
| Add API features | `lib/routes.mjs` + `public/js/api.js` |

### Dev workflow

1. Edit files in Cursor
2. **Restart the server** (Ctrl+C in terminal, then `node server.mjs` again)
3. **Hard refresh** the browser (Cmd+Shift+R)
4. Run `node scripts/smoke-test.mjs` after backend changes

---

## Part 6: Troubleshooting

| Problem | Fix |
|---------|-----|
| `command not found: node` | **Install Node.js** — see [GETTING_STARTED.md](./GETTING_STARTED.md) Part 0, or download from [nodejs.org](https://nodejs.org) (LTS), install, quit Terminal, reopen |
| Port 3850 in use (`EADDRINUSE`) | Another server is already running. Run `lsof -i :3850` then `kill <PID>`, or use `PORT=3851 node server.mjs` |
| Blank page | Check terminal for errors; open browser devtools → Console |
| "Sign in to play" after login | Hard refresh; clear site data for localhost:3850 |
| Submit fails / invalid player | Restart server (bug fixes may need latest code) |
| Lost all accounts | `data/users.json` was deleted — normal if you wiped `data/` |

---

## Part 7: What's not built yet (future work)

These were in the original spec but aren't finished:

- Push notifications at 12:00 PM
- Full friend accept/decline flow (search + send request works; accepting pending)
- Postgres database (currently JSON files — fine for early launch)
- More player seed data — run `npm run build:rosters` for ~thousands of real players (see Part 8)
- Separate mobile app / PWA install banner

Tell Cursor what you want next and reference this file.

---

## Part 8: Refresh real NBA rosters (one-time or occasional)

DynastyDraft pulls real player names, teams, years, positions, and ratings from the community [Basketball GM roster files](https://github.com/alexnoob/BasketBall-GM-Rosters) (free to download).

### Full rebuild (recommended)

From the `dynasty-draft` folder, with internet access:

```bash
npm run build:rosters
```

This will:

1. Download ~13 season snapshot files into `data/dynasty/raw/bbgm/` (gitignored; ~30 MB total)
2. Write `data/dynasty/imported-bbgm.json` (~8,000+ player-season rows)
3. Merge with hand-tuned star careers → `data/dynasty/players-seed.json`

### After rebuilding rosters

```bash
rm -f data/dynasty-db.json    # reset today's challenge so new pools apply
node server.mjs               # restart server
```

Hard refresh the browser (Cmd+Shift+R).

### What you get

| Coverage | Detail |
|----------|--------|
| Years | ~1985–2024 (sparse before 1995; dense 1996–2024) |
| Teams | All 30 current franchises + historical names (Sonics→Thunder, etc.) |
| Players | Real names only — no fake generated fillers |
| Ratings | Converted from BBGM; star careers override hand-tuned values |

### If download fails

Re-run with cached files only:

```bash
node scripts/import-bbgm-rosters.mjs --skip-download
node scripts/generate-rosters.mjs
```

### Optional: fill 1997–2014 gaps (NBA official API)

Some seasons between snapshots are sparse. To pull rosters from stats.nba.com:

```bash
python3 -m venv .venv
.venv/bin/pip install nba_api
.venv/bin/python scripts/fetch-nba-rosters.py   # ~10 min, needs internet
npm run build:rosters
```

Ratings for these rows use sensible defaults; star careers still override.

---

## Quick reference

```bash
# Start game
cd ~/Projects/hoops-card-hunter/dynasty-draft && node server.mjs

# Test backend
node scripts/smoke-test.mjs

# Open
open http://localhost:3850
```

**You only need:** Node.js, the `dynasty-draft` folder, and a browser.

---

## Part 0: Install Node.js (required once)

DynastyDraft is a **Node.js** app. If Terminal says `command not found: node`, install Node first:

### Easiest method (recommended)

1. Open **https://nodejs.org** in Safari or Chrome  
2. Click the big green **LTS** download button (e.g. “22.x LTS”)  
3. Open the downloaded `.pkg` file and go through the installer (Next → Install)  
4. **Quit Terminal completely** (Cmd+Q) and open it again  
5. Verify:

   ```bash
   node --version
   ```

   You should see something like `v22.11.0` — not “command not found”.

### Then start the game

```bash
cd ~/Projects/hoops-card-hunter/dynasty-draft
node server.mjs
```

**Mac shortcut:** In Finder, open `dynasty-draft` and double-click **`start.command`**.  
(If macOS blocks it: right-click → Open → Open.)

### Alternative: Homebrew (if you already use brew)

```bash
brew install node
```

Then quit and reopen Terminal, and run `node --version` again.

---
