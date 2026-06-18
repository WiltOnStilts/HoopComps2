# HoopComps 🏀

**Scout basketball card values.** Multi-user cloud collections, eBay/Amazon comps, AI insights, and a collector leaderboard.

> **DynastyDraft** (daily basketball team-building game) is a **separate app** in [`dynasty-draft/`](./dynasty-draft/).  
> See **[dynasty-draft/GETTING_STARTED.md](./dynasty-draft/GETTING_STARTED.md)** for how to run and deploy it.

## Quick start

```bash
cd ~/Projects/hoops-card-hunter
npm install
npm start
```

Open **http://localhost:3847**

## Multi-user

| Feature | Details |
|---------|---------|
| **Sign up / Sign in** | Email + password — collections sync to server |
| **Guest mode** | Browse without account; data stays in browser |
| **Merge on signup** | Guest cards automatically join your cloud collection |
| **Leaderboard** | Opt-in public ranking by portfolio value |

## Free launch

See **[LAUNCH.md](./LAUNCH.md)** for deploying to Render, Fly.io, or Railway at **$0**.

## App sections

- **Home** — collection value, Card of the Week, leaderboard, about
- **Scout** — sold/active comps, price variation, marketplace links
- **Collection** — track cards, refresh values, AI portfolio insight
- **Profile** — account, collector prefs, XP & streak

## eBay live prices

Add to `.env`:

```bash
EBAY_APP_ID=your_app_id
EBAY_CLIENT_SECRET=your_cert_id
```

## Tech

- Node.js + SQLite / file store for accounts
- JWT auth, auto cloud sync
- Static PWA frontend
- eBay Browse API + optional OpenAI / PriceCharting

Built by Wilt Harold · Kansas City · May 2026
