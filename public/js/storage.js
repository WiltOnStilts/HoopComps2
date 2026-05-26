import { pickImageFromScout } from "./card-image.js";
import { cardFingerprint, uniqueScoutCount, mergeCollectionByFingerprint } from "./card-fingerprint.js";

const STORAGE_KEY = "hoopcomps";

let syncCallback = null;

export function onStateChange(fn) {
  syncCallback = fn;
}

function notifyChange(state) {
  syncCallback?.(state);
}

function syncScoutCount(state) {
  state.scoutCount = uniqueScoutCount(state);
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const legacyComps = localStorage.getItem("compscourt");
    const legacy = localStorage.getItem("hoopsCardHunter");
    const parsed = raw || legacyComps || legacy;
    const data = parsed ? JSON.parse(parsed) : {};
    if ((legacyComps || legacy) && !raw) {
      localStorage.setItem(STORAGE_KEY, parsed);
    }
    return normalizeState(data);
  } catch {
    return defaultState();
  }
}

function normalizeState(data) {
  const scannedCards =
    data.scannedCards && typeof data.scannedCards === "object" && !Array.isArray(data.scannedCards)
      ? data.scannedCards
      : {};

  const state = {
    xp: 0,
    level: 1,
    streak: 0,
    scoutCount: 0,
    scannedCards,
    profile: {
      displayName: "Scout",
      favoritePlayer: "",
      favoriteTeam: "",
      collectorStyle: "investor",
      publicLeaderboard: false,
      ...data.profile,
    },
    collection: mergeCollectionByFingerprint(Array.isArray(data.collection) ? data.collection : []),
    lastScout: data.lastScout ?? null,
    ...data,
    profile: {
      displayName: "Scout",
      favoritePlayer: "",
      favoriteTeam: "",
      collectorStyle: "investor",
      publicLeaderboard: false,
      ...data.profile,
    },
    collection: mergeCollectionByFingerprint(Array.isArray(data.collection) ? data.collection : []),
    scannedCards,
  };

  syncScoutCount(state);
  return state;
}

function defaultState() {
  return {
    xp: 0,
    level: 1,
    streak: 0,
    scoutCount: 0,
    scannedCards: {},
    profile: {
      displayName: "Scout",
      favoritePlayer: "",
      favoriteTeam: "",
      collectorStyle: "investor",
      publicLeaderboard: false,
    },
    collection: [],
    lastScout: null,
  };
}

export function replaceState(next) {
  const state = normalizeState(next || {});
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  notifyChange(state);
  return state;
}

export function saveState(state) {
  syncScoutCount(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  notifyChange(state);
}

export function uuid() {
  return crypto.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getCollection(state) {
  return state.collection || [];
}

export function registerUniqueScan(state, card) {
  if (!card) return false;
  const fp = cardFingerprint(card);
  if (!state.scannedCards || typeof state.scannedCards !== "object") {
    state.scannedCards = {};
  }
  const isNew = !state.scannedCards[fp];
  if (isNew) {
    state.scannedCards[fp] = new Date().toISOString();
  }
  syncScoutCount(state);
  saveState(state);
  return isNew;
}

function clampQuantity(quantity) {
  return Math.max(1, Math.min(999, Number(quantity) || 1));
}

export function addToCollection(state, { card, estimatedValue, scoutData, userPhotoUrl, quantity = 1 }) {
  const qty = clampQuantity(quantity);
  const fp = cardFingerprint(card);
  const ebayImage = scoutData ? pickImageFromScout(card, scoutData) : null;
  const photo = userPhotoUrl?.trim() || null;
  const existing = getCollection(state).find((entry) => cardFingerprint(entry.card) === fp);

  if (existing) {
    const nextQty = (existing.quantity || 1) + qty;
    const patch = {
      quantity: nextQty,
      estimatedValue: estimatedValue ?? existing.estimatedValue,
      lastScoutedAt: scoutData ? new Date().toISOString() : existing.lastScoutedAt,
      tier: scoutData?.valuation?.tier ?? existing.tier,
    };
    if (photo) {
      patch.userPhotoUrl = photo;
      patch.imageUrl = photo;
      patch.imageSource = "photo";
      patch.imageListingTitle = null;
    } else if (ebayImage?.url && !existing.imageUrl) {
      patch.imageUrl = ebayImage.url;
      patch.imageSource = ebayImage.source ?? null;
      patch.imageListingTitle = ebayImage.listingTitle ?? null;
    }
    updateCollectionEntry(state, existing.id, patch);
    return { entry: { ...existing, ...patch }, merged: true, previousQty: existing.quantity || 1, quantity: nextQty };
  }

  const entry = {
    id: uuid(),
    card,
    estimatedValue: estimatedValue ?? null,
    quantity: qty,
    addedAt: new Date().toISOString(),
    lastScoutedAt: scoutData ? new Date().toISOString() : null,
    tier: scoutData?.valuation?.tier ?? null,
    userPhotoUrl: photo,
    imageUrl: photo || ebayImage?.url || null,
    imageSource: photo ? "photo" : ebayImage?.source ?? null,
    imageListingTitle: photo ? null : ebayImage?.listingTitle ?? null,
  };
  state.collection = [entry, ...getCollection(state)];
  saveState(state);
  return { entry, merged: false, quantity: qty };
}

export function removeFromCollection(state, id) {
  state.collection = getCollection(state).filter((c) => c.id !== id);
  saveState(state);
}

export function updateCollectionEntry(state, id, patch) {
  state.collection = getCollection(state).map((c) =>
    c.id === id ? { ...c, ...patch } : c
  );
  saveState(state);
}

export function collectionTotal(state) {
  return getCollection(state).reduce((sum, item) => {
    const v = item.estimatedValue;
    if (v == null) return sum;
    return sum + v * (item.quantity || 1);
  }, 0);
}

export function collectionValuedCount(state) {
  return getCollection(state).filter((c) => c.estimatedValue != null).length;
}

export function awardXp(state, amount) {
  const today = new Date().toDateString();
  state.xp = (state.xp || 0) + amount;
  state.level = Math.floor(state.xp / 100) + 1;
  if (state.lastScoutDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    state.streak =
      state.lastScoutDate === yesterday.toDateString() ? (state.streak || 0) + 1 : 1;
    state.lastScoutDate = today;
  }
  saveState(state);
  return state;
}
