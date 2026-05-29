#!/usr/bin/env node
/** Render cron entry — pings /api/push/cron to wake the app and deliver scheduled notifications. */

const base = (process.env.HOOPCOMPS_URL || "https://hoopcomps.onrender.com").replace(/\/$/, "");
const secret = process.env.PUSH_CRON_SECRET || process.env.JWT_SECRET;

if (!secret) {
  console.error("JWT_SECRET or PUSH_CRON_SECRET is required");
  process.exit(1);
}

const res = await fetch(`${base}/api/push/cron`, {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}` },
});

const body = await res.text();
console.log(body);

if (!res.ok) {
  process.exit(1);
}
