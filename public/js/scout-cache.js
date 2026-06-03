/** Cached scout API responses — same card details always get consistent comps */

import { normalizeScoutCard } from "./card-image.js";
import { scanFingerprint } from "./card-fingerprint.js";

const MAX_CACHE_ENTRIES = 12;
const MAX_ITEMS_PER_SOURCE = 36;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function slimListing(item) {
  if (!item || typeof item !== "object") return item;
  return {
    id: item.id,
    title: item.title,
    name: item.name,
    price: item.price,
    image: item.image,
    url: item.url,
    condition: item.condition,
    seller: item.seller,
    sellerFeedback: item.sellerFeedback,
    endTime: item.endTime,
    itemLocation: item.itemLocation,
    source: item.source,
    sourceName: item.sourceName,
    sourceIcon: item.sourceIcon,
    listingType: item.listingType,
  };
}

function slimSource(source) {
  if (!source || typeof source !== "object") return source;
  const items = Array.isArray(source.items)
    ? source.items.slice(0, MAX_ITEMS_PER_SOURCE).map(slimListing)
    : source.items;
  return { ...source, items };
}

export function slimScoutPayload(data) {
  if (!data || typeof data !== "object") return data;
  const sources = {};
  for (const [key, src] of Object.entries(data.sources || {})) {
    sources[key] = slimSource(src);
  }
  return { ...data, sources };
}

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
  cache[key] = { data: slimScoutPayload(data), at: new Date().toISOString() };
  state.scoutResultCache = pruneScoutCache(cache);
  return state;
}

/** Resolve last scout report from cache key (avoids duplicating large payloads in state). */
export function resolveLastScoutData(state) {
  const last = state?.lastScout;
  if (!last) return null;
  if (last.data) return last.data;
  const key = last.cacheKey;
  if (!key) return null;
  return state?.scoutResultCache?.[key]?.data ?? null;
}
