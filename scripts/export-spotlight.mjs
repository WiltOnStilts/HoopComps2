#!/usr/bin/env node
/** Export spotlight collector cards from data/users.json into data/spotlight-collection.json */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const USERS_PATH = path.join(ROOT, "data", "users.json");
const OUT_PATH = path.join(ROOT, "data", "spotlight-collection.json");

const email = (process.argv[2] || process.env.SPOTLIGHT_USER_EMAILS || "builtwilt@icloud.com")
  .toLowerCase()
  .trim();

if (!fs.existsSync(USERS_PATH)) {
  console.error(`Missing ${USERS_PATH} — sign in locally first so your collection syncs to the server.`);
  process.exit(1);
}

const store = JSON.parse(fs.readFileSync(USERS_PATH, "utf8"));
const userId = store.emailIndex?.[email];
if (!userId) {
  console.error(`No account found for ${email} in users.json`);
  process.exit(1);
}

const user = store.users[userId];
const state = JSON.parse(store.states[userId]?.state_json || "{}");
const collection = (state.collection || []).filter((entry) => entry?.card?.title?.trim());

if (!collection.length) {
  console.error(`No cards in cloud collection for ${email}`);
  process.exit(1);
}

const payload = {
  userId,
  ownerName: user.displayName || state.profile?.displayName || "Scout",
  email,
  collection,
};

fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
console.log(`Exported ${collection.length} cards for ${payload.ownerName} → ${OUT_PATH}`);
console.log("Commit and push this file so Card of the Day matches on all devices.");
