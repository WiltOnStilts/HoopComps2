/** Cached scout API responses — same card details always get consistent comps */

import { normalizeScoutCard } from "./card-image.js";
import { scanFingerprint } from "./card-fingerprint.js";

const MAX_CACHE_ENTRIES = 40;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function pruneScoutCache(cache = {}) {
  const entries = Object.entries(cache).sort(
    (a, b) => new Date(b[1]?.at || 0) - new Date(a[1]?.at || 0)
  );
  const keep = entries.slice(0, MAX_CACHE_ENTRIES);
  return Object.fromEntries(keep);
}

export function scoutCacheKey(card) {
  return scanFingerprint(normalizeScoutCard(card || {}));
}

export function getCachedScoutResult(state, card) {
  const key = scoutCacheKey(card);
  if (!key || key === "title:unknown") return null;

  const entry = state?.scoutResultCache?.[key];
  if (!entry?.data) return null;

  const age = Date.now() - new Date(entry.at || 0).getTime();
  if (age > CACHE_TTL_MS) return null;

  return { key, data: entry.data, at: entry.at };
}

export function setCachedScoutResult(state, card, data) {
  const key = scoutCacheKey(card);
  if (!key || key === "title:unknown" || !data) return state;

  const cache = { ...(state.scoutResultCache || {}) };
  cache[key] = { data, at: new Date().toISOString() };
  state.scoutResultCache = pruneScoutCache(cache);
  return state;
}
