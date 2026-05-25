/** Spotlight pool — cloud collections + committed seed + runtime sync fallback */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const SEED_PATH = path.join(DATA_DIR, "spotlight-collection.json");
const RUNTIME_PATH = path.join(DATA_DIR, "spotlight-runtime.json");

const DEFAULT_SPOTLIGHT_EMAILS = ["builtwilt@icloud.com"];
const DEFAULT_SPOTLIGHT_USER_ID = "acd960d3-7b96-4320-ab5a-0fb869322416";
const DEFAULT_OWNER_NAME = "WiltOnStilts";

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

export function loadSpotlightSeed() {
  const seed = readJson(SEED_PATH);
  if (seed?.userId && Array.isArray(seed.collection)) return seed;
  return {
    userId: DEFAULT_SPOTLIGHT_USER_ID,
    ownerName: DEFAULT_OWNER_NAME,
    email: DEFAULT_SPOTLIGHT_EMAILS[0],
    collection: [],
  };
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

/** Spotlight user IDs — registered accounts plus committed seed ID */
export function resolveSpotlightUserIds(findUserByEmail) {
  const ids = new Set();
  const seed = loadSpotlightSeed();
  ids.add(seed.userId);

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

/** Cloud cards first; runtime sync and committed seed fill gaps per spotlight user */
export function buildSpotlightCommunityCards(cloudCards = [], findUserByEmail) {
  const spotlightUserIds = resolveSpotlightUserIds(findUserByEmail);
  const seed = loadSpotlightSeed();
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
          runtimeRow.ownerName || seed.ownerName || DEFAULT_OWNER_NAME,
          runtimeRow.collection
        )
      );
      continue;
    }

    if (userId === seed.userId && seed.collection.length) {
      addCards(collectionToCommunityCards(seed.userId, seed.ownerName, seed.collection));
    }
  }

  return { cards: merged, spotlightUserIds };
}

/** When a spotlight collector syncs, persist their collection for Card of the Day */
export function persistSpotlightPool(userId, email, state, findUserByEmail) {
  if (!isSpotlightUser(userId, email, findUserByEmail)) return;
  const collection = (state?.collection || []).filter((entry) => entry?.card?.title?.trim());
  if (!collection.length) return;

  const seed = loadSpotlightSeed();
  const runtime = readJson(RUNTIME_PATH, {});
  runtime[userId] = {
    ownerName: state.profile?.displayName?.trim() || seed.ownerName || DEFAULT_OWNER_NAME,
    email: email?.toLowerCase().trim() || seed.email,
    updatedAt: new Date().toISOString(),
    collection,
  };
  writeJson(RUNTIME_PATH, runtime);
}
