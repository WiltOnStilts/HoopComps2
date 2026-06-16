# DynastyDraft

Standalone daily basketball team-building game — spin constraints, draft a lineup, simulate an 82-game season and playoffs.

**Not part of HoopComps.** This is its own app with its own server, accounts, and data.

## Run locally

```bash
cd dynasty-draft
node server.mjs
```

Open **http://localhost:3850**

**New to this project?** Read **[GETTING_STARTED.md](./GETTING_STARTED.md)** — step-by-step setup, deploy, and development guide.

## Environment

Optional `.env` in this folder:

```
PORT=3850
JWT_SECRET=change-me-in-production
```

## How it works

1. Create an account (username helps friends find you)
2. Each day, reveal the challenge — every lineup slot spins **Team**, **Year**, and **Modifier**
3. Draft PG, SG, SF, PF, C, and a 6th man from each slot's pool
4. Simulate the season and chase an undefeated championship

## Data

All data lives in `dynasty-draft/data/`:

- `users.json` — accounts
- `dynasty-db.json` — challenges, submissions, streaks, leaderboard
- `social.json` — friend requests
- `dynasty/` — teams, players, modifiers seed data

## Deploy on Render

See **[DEPLOY_RENDER.md](./DEPLOY_RENDER.md)** for the full checklist (GitHub push → Render web service → optional custom domain).
