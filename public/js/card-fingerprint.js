/** Stable card identity for dedupe, unique scans, and fair rotation (client) */

function norm(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function cardFingerprint(card = {}) {
  const player = norm(card.player);
  const year = norm(card.year);
  const set = norm(card.set);
  const cardNumber = norm(card.cardNumber).replace(/^#/, "");
  const parallel = norm(card.parallel);
  const serial = norm(card.serial);
  const gradingCompany = norm(card.gradingCompany);
  const grade = norm(card.grade);
  const notes = norm(card.notes);

  if (!player && !year && !set && !cardNumber && card.title?.trim()) {
    return `title:${norm(card.title)}`;
  }

  const parts = [
    player && `p:${player}`,
    year && `y:${year}`,
    set && `s:${set}`,
    cardNumber && `n:${cardNumber}`,
    parallel && `par:${parallel}`,
    serial && `ser:${serial}`,
    gradingCompany && `g:${gradingCompany}`,
    grade && `gr:${grade}`,
    notes && `note:${notes}`,
  ].filter(Boolean);

  return parts.length ? parts.join("|") : `title:${norm(card.title || "unknown")}`;
}

/** Core identity for scan counts and collection dedupe — ignores varying notes/titles */
export function scanFingerprint(card = {}) {
  return cardFingerprint({
    player: card.player,
    year: card.year,
    set: card.set,
    cardNumber: card.cardNumber,
    parallel: card.parallel,
    serial: card.serial,
    gradingCompany: card.gradingCompany,
    grade: card.grade,
    title: card.player?.trim() ? undefined : card.title,
  });
}

export const COLLECTION_QTY_VERSION = 1;

function looksLikeSyncInflation(qty) {
  const n = Math.max(1, Number(qty) || 1);
  return n >= 2 && (n & (n - 1)) === 0;
}

export function migrateCollectionQuantities(state) {
  if (!state || typeof state !== "object") return state;
  if ((state.collectionQtyVersion || 0) >= COLLECTION_QTY_VERSION) return state;

  state.collection = mergeCollectionByFingerprint(state.collection || []);
  for (const entry of state.collection) {
    if (!entry.quantityUserSet && looksLikeSyncInflation(entry.quantity)) {
      entry.quantity = 1;
    }
  }
  state.collectionQtyVersion = COLLECTION_QTY_VERSION;
  return state;
}

export const SCAN_TRACKING_VERSION = 2;

export function rebuildScannedCards(state) {
  const rebuilt = {};
  const stamp = (card, at) => {
    if (!card) return;
    const fp = scanFingerprint(card);
    if (!fp || fp === "title:unknown") return;
    const when = at || new Date().toISOString();
    if (!rebuilt[fp] || new Date(when) < new Date(rebuilt[fp])) {
      rebuilt[fp] = when;
    }
  };

  for (const entry of state.collection || []) {
    stamp(entry.card, entry.lastScoutedAt || entry.addedAt);
  }
  if (state.lastScout?.card) {
    stamp(state.lastScout.card, state.lastScout.at);
  }

  state.scannedCards = rebuilt;
  state.scoutCount = Object.keys(rebuilt).length;
  return state;
}

export function migrateScanTracking(state) {
  if (!state || typeof state !== "object") return state;
  if (state.scanTrackingVersion >= SCAN_TRACKING_VERSION) {
    state.scoutCount = Object.keys(state.scannedCards || {}).length;
    return state;
  }
  rebuildScannedCards(state);
  state.scanTrackingVersion = SCAN_TRACKING_VERSION;
  return state;
}

export function uniqueScoutCount(state) {
  return Object.keys(state?.scannedCards || {}).length;
}

export function mergeScannedCards(a = {}, b = {}) {
  const merged = { ...a };
  for (const [key, at] of Object.entries(b || {})) {
    if (!merged[key] || new Date(at) < new Date(merged[key])) {
      merged[key] = at;
    }
  }
  return merged;
}

export function mergedScanFields(cloudState, localState) {
  const cloud = migrateScanTracking({
    ...cloudState,
    scannedCards: { ...(cloudState?.scannedCards || {}) },
  });
  const local = migrateScanTracking({
    ...localState,
    scannedCards: { ...(localState?.scannedCards || {}) },
  });
  const scannedCards = mergeScannedCards(cloud.scannedCards, local.scannedCards);
  return {
    scannedCards,
    scoutCount: Object.keys(scannedCards).length,
    scanTrackingVersion: SCAN_TRACKING_VERSION,
  };
}

export function findCollectionByFingerprint(state, card) {
  const fp = scanFingerprint(card);
  return (state.collection || []).find((entry) => scanFingerprint(entry.card) === fp) || null;
}

function pickNewerIso(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return new Date(a) >= new Date(b) ? a : b;
}

export function mergeCollectionByFingerprint(items = []) {
  const map = new Map();

  for (const item of items) {
    if (!item?.card) continue;
    const fp = scanFingerprint(item.card);
    const prev = map.get(fp);
    if (!prev) {
      map.set(fp, { ...item, quantity: Math.max(1, item.quantity || 1) });
      continue;
    }

    map.set(fp, {
      ...prev,
      quantity: Math.max(prev.quantity || 1, Math.max(1, item.quantity || 1)),
      quantityUserSet: Boolean(prev.quantityUserSet || item.quantityUserSet),
      estimatedValue: prev.estimatedValue ?? item.estimatedValue ?? null,
      tier: prev.tier || item.tier || null,
      lastScoutedAt: pickNewerIso(prev.lastScoutedAt, item.lastScoutedAt),
      addedAt: pickNewerIso(prev.addedAt, item.addedAt) === prev.addedAt ? prev.addedAt : item.addedAt,
      userPhotoUrl: prev.userPhotoUrl || item.userPhotoUrl || null,
      imageUrl: prev.userPhotoUrl || item.userPhotoUrl || prev.imageUrl || item.imageUrl || null,
      imageSource: prev.userPhotoUrl || item.userPhotoUrl ? "photo" : prev.imageSource || item.imageSource || null,
      imageListingTitle: prev.imageListingTitle || item.imageListingTitle || null,
    });
  }

  return [...map.values()].sort(
    (a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0)
  );
}
