# HoopComps — free launch guide

Launch **HoopComps** without paying for hosting or a domain. You can still earn money later via affiliates, tips, or a paid tier.

## What costs $0

| Platform | URL you get | Good for |
|----------|-------------|----------|
| **[Render](https://render.com)** | `your-app.onrender.com` | Full Node server + user data |
| **[Railway](https://railway.app)** | `your-app.up.railway.app` | Node app, $5 free credits/month |
| **[Fly.io](https://fly.io)** | `your-app.fly.dev` | Node + volume for SQLite DB |
| **PWA install** | User's home screen | App-like experience, **no App Store fee** |

### Free URLs (no domain purchase)

- `hoopcomps.onrender.com`
- `hoopcomps.fly.dev`
- `hoopcomps.pages.dev`

A `.com` costs ~$10–15/year. **HoopComps.com** may be available — check Namecheap before buying.

## What is NOT free

| Thing | Cost | Alternative |
|-------|------|-------------|
| **Apple App Store** | $99/year | PWA (Add to Home Screen) |
| **Google Play** | $25 one-time | Same — use PWA |

## Deploy to Render (recommended, $0)

1. Push this repo to GitHub
2. [render.com](https://render.com) → New **Web Service**
3. Build: `npm install` · Start: `npm start`
4. Add `JWT_SECRET` (random string) in environment
5. Share `https://hoopcomps-xxxx.onrender.com`

## Making money (without charging users)

1. eBay / Amazon affiliate links on marketplace buttons
2. Ko-fi / Buy Me a Coffee tip jar
3. Optional Pro tier later
4. Ads once you have traffic
5. Sponsored Card of the Week

## Environment variables

```bash
JWT_SECRET=long-random-string
SITE_NAME=HoopComps
EBAY_APP_ID=...
EBAY_CLIENT_SECRET=...
PORT=3847
```

## Contact

Questions about HoopComps: **builtwilt@icloud.com**
