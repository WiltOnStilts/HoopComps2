# Deploy DynastyDraft on Render

Turn your local game into a public URL like `https://dynasty-draft.onrender.com`.

---

## Before you start

You need:

1. A [GitHub](https://github.com) account
2. A [Render](https://render.com) account (free to sign up)
3. The `dynasty-draft` folder pushed to GitHub (see Step 1)

---

## Step 1 — Push code to GitHub

DynastyDraft lives inside your **HoopComps2** repo under `dynasty-draft/`. From Terminal:

```bash
cd ~/Projects/hoops-card-hunter

git add dynasty-draft/
git status
git commit -m "Add DynastyDraft standalone game"
git push origin main
```

If your branch is not `main`, use your branch name instead (e.g. `git push origin master`).

> **What gets pushed:** game code + `data/dynasty/players-seed.json` (rosters).  
> **What stays local:** your accounts (`users.json`), saves, and `.env` — those are gitignored.

---

## Step 2 — Create the Render web service

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click **New +** → **Web Service**
3. Connect your **HoopComps2** GitHub repo
4. Fill in these settings:

| Setting | Value |
|---------|--------|
| **Name** | `dynasty-draft` (becomes part of your URL) |
| **Region** | Pick closest to you (e.g. Oregon) |
| **Branch** | `main` (or your default branch) |
| **Root Directory** | `dynasty-draft` |
| **Runtime** | `Node` |
| **Build Command** | *(leave empty)* |
| **Start Command** | `node server.mjs` |
| **Instance Type** | Free *(or Starter for always-on + saved accounts)* |

5. Expand **Advanced** and set:

| Key | Value |
|-----|--------|
| **Health Check Path** | `/api/health` |

6. Under **Environment Variables**, add:

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `20` |
| `JWT_SECRET` | Click **Generate** (random secret — do not share) |

7. Click **Create Web Service**

Render builds and deploys. First deploy takes 1–3 minutes. When the log says **Live**, open your URL (shown at the top of the dashboard).

---

## Step 3 — Verify it works

1. Open your Render URL (e.g. `https://dynasty-draft.onrender.com`)
2. Create a new account (production accounts are separate from localhost)
3. Play today's challenge

Health check (optional):

```bash
curl https://YOUR-SERVICE.onrender.com/api/health
```

Should return `{"ok":true,"app":"DynastyDraft",...}`.

---

## Free vs paid — what to expect

| | **Free** | **Starter ($7/mo)** |
|--|----------|---------------------|
| Public URL | Yes | Yes |
| HTTPS | Yes | Yes |
| Cold starts | ~30–60 sec after 15 min idle | No spin-down |
| Accounts & scores saved | **Lost on redeploy/restart** | Yes, with disk (below) |
| Persistent disk | Not available | Add in Advanced → Disks |

**Free tier is fine** for testing and sharing with friends short-term. Accounts reset whenever Render redeploys or restarts the service.

**To keep accounts long-term:** upgrade to **Starter**, then in your service → **Disks** → **Add disk**:

- **Mount path:** `/opt/render/project/src/dynasty-draft/data`
- **Size:** 1 GB

Redeploy once after adding the disk.

---

## Step 4 — Custom domain (optional)

1. Render dashboard → your service → **Settings** → **Custom Domains**
2. Add your domain (e.g. `dynastydraft.com`)
3. Add the DNS records Render shows at your registrar
4. Wait for SSL (automatic)

---

## Updating the live site

After you change code locally:

```bash
cd ~/Projects/hoops-card-hunter
git add dynasty-draft/
git commit -m "Update DynastyDraft"
git push
```

Render auto-deploys on push (if auto-deploy is enabled — default).

If you changed roster data:

```bash
cd dynasty-draft
npm run build:rosters
cd ..
git add dynasty-draft/data/dynasty/players-seed.json
git commit -m "Refresh roster data"
git push
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Deploy fails | Check **Logs** tab; usually wrong Root Directory or Start Command |
| 502 / service unavailable | Free tier waking up — wait 30–60 sec and refresh |
| Login works locally but not on Render | Hard refresh; ensure `JWT_SECRET` is set in Render env vars |
| Old challenge / missing players | Push latest `players-seed.json`; redeploy |
| Port error in logs | Do not set `PORT` manually — Render sets it automatically |

---

## Alternative: Blueprint (Infrastructure as Code)

If you prefer one-click from `render.yaml`:

1. **New +** → **Blueprint**
2. Connect **HoopComps2** repo
3. Render may only read `render.yaml` at the **repo root** (HoopComps). For DynastyDraft-only deploy, use **Step 2** above instead.

The file `dynasty-draft/render.yaml` documents the intended service shape for reference.

---

## Quick checklist

- [ ] Pushed `dynasty-draft/` to GitHub
- [ ] Created Web Service with Root Directory = `dynasty-draft`
- [ ] Start Command = `node server.mjs`
- [ ] `JWT_SECRET` generated in Render
- [ ] Health check = `/api/health`
- [ ] Opened live URL and created an account
- [ ] (Optional) Starter + disk for persistent accounts
