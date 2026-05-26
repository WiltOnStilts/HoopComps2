import { pickImageFromScout } from "./card-image.js";

const STORAGE_KEY = "hoopcomps";

let syncCallback = null;

export function onStateChange(fn) {
  syncCallback = fn;
}

function notifyChange(state) {
  syncCallback?.(state);
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
  return {
    xp: 0,
    level: 1,
    streak: 0,
    scoutCount: 0,
    profile: {
      displayName: "Scout",
      favoritePlayer: "",
      favoriteTeam: "",
      collectorStyle: "investor",
      publicLeaderboard: false,
      ...data.profile,
    },
    collection: Array.isArray(data.collection) ? data.collection : [],
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
    collection: Array.isArray(data.collection) ? data.collection : [],
  };
}

function defaultState() {
  return {
    xp: 0,
    level: 1,
    streak: 0,
    scoutCount: 0,
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  notifyChange(state);
}

export function uuid() {
  return crypto.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getCollection(state) {
  return state.collection || [];
}

export function addToCollection(state, { card, estimatedValue, scoutData, userPhotoUrl }) {
  const ebayImage = scoutData ? pickImageFromScout(card, scoutData) : null;
  const photo = userPhotoUrl?.trim() || null;
  const entry = {
    id: uuid(),
    card,
    estimatedValue: estimatedValue ?? null,
    quantity: 1,
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
  return entry;
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
