/** Spotlight pool — only real cloud-synced collections (no fake placeholder cards) */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const RUNTIME_PATH = path.join(DATA_DIR, "spotlight-runtime.json");

const DEFAULT_SPOTLIGHT_EMAILS = ["builtwilt@icloud.com"];

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function getSpotlightEmails() {
  const fromEnv = (process.env.SPOTLIGHT_USER_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_SPOTLIGHT_EMAILS.map((e) => e.toLowerCase());
}

function collectionToCommunityCards(userId, ownerName, collection = []) {
  const cards = [];
  for (const entry of collection) {
    if (!entry?.card?.title?.trim()) continue;
    cards.push({
      entryId: entry.id,
      userId,
      ownerName,
      card: entry.card,
      estimatedValue: entry.estimatedValue ?? null,
      addedAt: entry.addedAt || null,
      imageUrl: entry.imageUrl || null,
      imageSource: entry.imageSource || null,
      imageListingTitle: entry.imageListingTitle || null,
    });
  }
  return cards;
}

/** Registered spotlight collectors only */
export function resolveSpotlightUserIds(findUserByEmail) {
  const ids = new Set();

  for (const id of (process.env.SPOTLIGHT_USER_IDS || "").split(",")) {
    const trimmed = id.trim();
    if (trimmed) ids.add(trimmed);
  }

  for (const email of getSpotlightEmails()) {
    const user = findUserByEmail?.(email);
    if (user?.id) ids.add(user.id);
  }

  return [...ids].sort();
}

export function isSpotlightUser(userId, email, findUserByEmail) {
  const normalizedEmail = email?.toLowerCase().trim();
  if (normalizedEmail && getSpotlightEmails().includes(normalizedEmail)) return true;
  return resolveSpotlightUserIds(findUserByEmail).includes(userId);
}

/** Cloud cards first; runtime sync fills gaps when cloud is empty on this instance */
export function buildSpotlightCommunityCards(cloudCards = [], findUserByEmail) {
  const spotlightUserIds = resolveSpotlightUserIds(findUserByEmail);
  const runtime = readJson(RUNTIME_PATH, {});
  const merged = [];
  const seen = new Set();

  function addCards(cards) {
    for (const card of cards) {
      const key = `${card.userId}:${card.entryId || card.card.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(card);
    }
  }

  const cloudSpotlight = cloudCards.filter((entry) => spotlightUserIds.includes(entry.userId));
  addCards(cloudSpotlight);

  for (const userId of spotlightUserIds) {
    if (cloudSpotlight.some((entry) => entry.userId === userId)) continue;

    const runtimeRow = runtime[userId];
    if (runtimeRow?.collection?.length) {
      addCards(
        collectionToCommunityCards(
          userId,
          runtimeRow.ownerName || "Scout",
          runtimeRow.collection
        )
      );
    }
  }

  return { cards: merged, spotlightUserIds };
}

/** When a spotlight collector syncs, persist their real collection for Card of the Day */
export function persistSpotlightPool(userId, email, state, findUserByEmail) {
  if (!isSpotlightUser(userId, email, findUserByEmail)) return;
  const collection = (state?.collection || []).filter((entry) => entry?.card?.title?.trim());
  if (!collection.length) return;

  const runtime = readJson(RUNTIME_PATH, {});
  runtime[userId] = {
    ownerName: state.profile?.displayName?.trim() || "Scout",
    email: email?.toLowerCase().trim(),
    updatedAt: new Date().toISOString(),
    collection,
  };
  writeJson(RUNTIME_PATH, runtime);
}
