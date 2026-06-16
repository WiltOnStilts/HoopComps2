# DynastyDraft Architecture

Standalone app in `dynasty-draft/` — not coupled to HoopComps.

## Run

```bash
cd dynasty-draft
node server.mjs
```

Default port: **3850**

## Stack

- Node.js 18+ (ES modules, zero npm dependencies required)
- Vanilla HTML/CSS/JS frontend
- JSON file storage (`data/users.json`, `data/dynasty-db.json`, `data/social.json`)

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | App status |
| POST | `/api/auth/register` | No | Create account |
| POST | `/api/auth/login` | No | Sign in |
| GET | `/api/auth/session` | Cookie/Bearer | Current session |
| GET | `/api/dynasty/meta` | No | Teams, modifiers |
| GET | `/api/dynasty/today` | Yes | Daily challenge |
| GET | `/api/dynasty/players` | Yes | Eligible players |
| POST | `/api/dynasty/submit` | Yes | Run simulation |
| GET | `/api/dynasty/leaderboard` | No | Daily rankings |
| GET | `/api/social/friends/search` | Yes | Find users |

## Layout

```
dynasty-draft/
  server.mjs          # HTTP server + auth + static files
  lib/
    auth.mjs          # JWT + sessions
    db.mjs            # User accounts (JSON)
    store.mjs         # Game state (JSON)
    social.mjs        # Friends
    challenge.mjs     # Daily challenge RNG
    players.mjs       # Player pools + ratings
    simulate.mjs      # Season + playoffs
    scoring.mjs, grade.mjs, stories.mjs
    routes.mjs        # Game API
  data/dynasty/       # Seed data
  public/             # SPA
```
