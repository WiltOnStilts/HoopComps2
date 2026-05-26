import { pickImageFromScout } from "./card-image.js";
import {
  scanFingerprint,
  uniqueScoutCount,
  mergeCollectionByFingerprint,
  migrateScanTracking,
  migrateCollectionQuantities,
  registerScanFingerprint,
} from "./card-fingerprint.js";
import {
  migrateEconomy,
  normalizeEconomy,
  processDailySession,
  markDailyNotificationsShown,
  shouldShowDailyNotifications,
  recordScoutStreak,
  awardUniqueScanCoins,
  defaultAvatarSelection,
  defaultOwnedAvatarParts,
} from "./economy.js";

const STORAGE_KEY = "hoopcomps";

let syncCallback = null;
let pendingDailyEvents = [];

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
    return applyDailySession(normalizeState(data));
  } catch {
    return defaultState();
  }
}

function applyDailySession(state) {
  const beforeKey = state.lastDailySessionKey;
  const { state: next, events } = processDailySession(state);
  const sessionAdvanced = next.lastDailySessionKey !== beforeKey;

  if (events.length) {
    pendingDailyEvents = [...pendingDailyEvents, ...events];
  }

  if (sessionAdvanced || events.length) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notifyChange(next);
  }

  return next;
}

export function peekPendingDailyEvents() {
  return [...pendingDailyEvents];
}

export function takePendingDailyEvents() {
  const events = [...pendingDailyEvents];
  pendingDailyEvents = [];
  return events;
}

export function finalizeDailyNotifications(state) {
  const next = markDailyNotificationsShown({ ...state });
  saveState(next);
  return next;
}

function normalizeState(data) {
  const scannedCards =
    data.scannedCards && typeof data.scannedCards === "object" && !Array.isArray(data.scannedCards)
      ? data.scannedCards
      : {};

  const state = {
    coins: 0,
    streak: 0,
    streakFreezes: 0,
    scoutCount: 0,
    scannedCards,
    ownedAvatarParts: defaultOwnedAvatarParts(),
    profile: {
      displayName: "Scout",
      favoritePlayer: "",
      favoriteTeam: "",
      collectorStyle: "investor",
      publicLeaderboard: false,
      avatar: defaultAvatarSelection(),
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
      avatar: defaultAvatarSelection(),
      ...data.profile,
    },
    collection: mergeCollectionByFingerprint(Array.isArray(data.collection) ? data.collection : []),
    scannedCards,
  };

  syncScoutCount(state);
  migrateScanTracking(state);
  migrateCollectionQuantities(state);
  migrateEconomy(state);
  normalizeEconomy(state);
  return state;
}

function defaultState() {
  return {
    coins: 0,
    economyVersion: 1,
    streak: 0,
    streakFreezes: 0,
    scoutCount: 0,
    scannedCards: {},
    ownedAvatarParts: defaultOwnedAvatarParts(),
    profile: {
      displayName: "Scout",
      favoritePlayer: "",
      favoriteTeam: "",
      collectorStyle: "investor",
      publicLeaderboard: false,
      avatar: defaultAvatarSelection(),
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
  normalizeEconomy(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  notifyChange(state);
}

export function handleScoutRewards(state, { isNewScan }) {
  if (isNewScan) {
    awardUniqueScanCoins(state);
  } else {
    recordScoutStreak(state);
  }
  saveState(state);
  return state;
}

export function uuid() {
  return crypto.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getCollection(state) {
  return state.collection || [];
}

export function registerUniqueScan(state, card) {
  if (!card) return false;
  const { map, isNew } = registerScanFingerprint(state.scannedCards || {}, card);
  state.scannedCards = map;
  syncScoutCount(state);
  saveState(state);
  return isNew;
}

function clampQuantity(quantity) {
  return Math.max(1, Math.min(999, Number(quantity) || 1));
}

export function addToCollection(state, { card, estimatedValue, scoutData, userPhotoUrl, quantity = 1 }) {
  const qty = clampQuantity(quantity);
  const fp = scanFingerprint(card);
  const ebayImage = scoutData ? pickImageFromScout(card, scoutData) : null;
  const photo = userPhotoUrl?.trim() || null;
  const existing = getCollection(state).find((entry) => scanFingerprint(entry.card) === fp);

  if (existing) {
    const nextQty = (existing.quantity || 1) + qty;
    const patch = {
      quantity: nextQty,
      quantityUserSet: true,
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
    quantityUserSet: true,
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

export function getCoins(state) {
  return state.coins ?? 0;
}
