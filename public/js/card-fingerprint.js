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

export const SCAN_TRACKING_VERSION = 3;

function parseFingerprintParts(fp) {
  const parts = {};
  for (const segment of String(fp || "").split("|")) {
    if (!segment) continue;
    const colon = segment.indexOf(":");
    if (colon === -1) continue;
    parts[segment.slice(0, colon)] = segment.slice(colon + 1);
  }
  return parts;
}

function normalizeYearToken(year) {
  const y = norm(year);
  const match = y.match(/^(\d{4})(?:[-/](\d{2,4}))?$/);
  return match ? match[1] : y;
}

function yearTokensCompatible(a, b) {
  if (!a || !b) return true;
  return normalizeYearToken(a) === normalizeYearToken(b);
}

function tokenTokensCompatible(a, b) {
  if (!a || !b) return true;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

export function fingerprintsCompatible(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;

  const pa = parseFingerprintParts(a);
  const pb = parseFingerprintParts(b);

  if (pa.title || pb.title) {
    return Boolean(pa.title && pb.title && pa.title === pb.title);
  }

  if (pa.p && pb.p && pa.p !== pb.p) return false;
  if (!pa.p && !pb.p) return false;

  if (!yearTokensCompatible(pa.y, pb.y)) return false;
  if (pa.n && pb.n && pa.n !== pb.n) return false;
  if (pa.par && pb.par && pa.par !== pb.par) return false;
  if (pa.ser && pb.ser && pa.ser !== pb.ser) return false;
  if (pa.g && pb.g && pa.g !== pb.g) return false;
  if (pa.gr && pb.gr && pa.gr !== pb.gr) return false;
  if (!tokenTokensCompatible(pa.s, pb.s)) return false;

  return true;
}

export function fingerprintSpecificity(fp) {
  return String(fp || "").split("|").filter(Boolean).length;
}

export function findMatchingScanKey(scannedCards, cardOrFp) {
  const fp = typeof cardOrFp === "string" ? cardOrFp : scanFingerprint(cardOrFp);
  if (!fp || fp === "title:unknown") return null;
  if (scannedCards?.[fp]) return fp;
  for (const key of Object.keys(scannedCards || {})) {
    if (fingerprintsCompatible(key, fp)) return key;
  }
  return null;
}

export function dedupeScannedCardsMap(scannedCards = {}) {
  const groups = [];
  for (const [fp, at] of Object.entries(scannedCards || {})) {
    let placed = false;
    for (const group of groups) {
      if (group.some((entry) => fingerprintsCompatible(entry.fp, fp))) {
        group.push({ fp, at });
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([{ fp, at }]);
  }

  const deduped = {};
  for (const group of groups) {
    const best = group.reduce((winner, entry) =>
      fingerprintSpecificity(entry.fp) >= fingerprintSpecificity(winner.fp) ? entry : winner
    );
    const earliest = group.reduce((min, entry) => {
      if (!min || new Date(entry.at) < new Date(min)) return entry.at;
      return min;
    }, null);
    deduped[best.fp] = earliest;
  }
  return deduped;
}

export function registerScanFingerprint(scannedCards, card, at = new Date().toISOString()) {
  const map = scannedCards && typeof scannedCards === "object" ? { ...scannedCards } : {};
  const fp = scanFingerprint(card);
  if (!fp || fp === "title:unknown") return { map, isNew: false };

  const existingKey = findMatchingScanKey(map, fp);
  if (existingKey) {
    const prevAt = map[existingKey];
    const bestKey =
      fingerprintSpecificity(fp) >= fingerprintSpecificity(existingKey) ? fp : existingKey;
    const bestAt = prevAt && new Date(prevAt) <= new Date(at) ? prevAt : at;
    if (bestKey !== existingKey) delete map[existingKey];
    map[bestKey] = bestAt;
    return { map, isNew: false };
  }

  map[fp] = at;
  return { map, isNew: true };
}

export function rebuildScannedCards(state) {
  let rebuilt = {};
  const stamp = (card, at) => {
    if (!card) return;
    const when = at || new Date().toISOString();
    const result = registerScanFingerprint(rebuilt, card, when);
    rebuilt = result.map;
  };

  for (const entry of state.collection || []) {
    stamp(entry.card, entry.lastScoutedAt || entry.addedAt);
  }
  if (state.lastScout?.card) {
    stamp(state.lastScout.card, state.lastScout.at);
  }

  state.scannedCards = dedupeScannedCardsMap(rebuilt);
  state.scoutCount = Object.keys(state.scannedCards).length;
  return state;
}

export function migrateScanTracking(state) {
  if (!state || typeof state !== "object") return state;
  const version = state.scanTrackingVersion || 0;
  if (version < 2) {
    rebuildScannedCards(state);
  } else if (version < SCAN_TRACKING_VERSION) {
    state.scannedCards = dedupeScannedCardsMap(state.scannedCards || {});
  }
  state.scanTrackingVersion = SCAN_TRACKING_VERSION;
  state.scoutCount = Object.keys(state.scannedCards || {}).length;
  return state;
}

export function uniqueScoutCount(state) {
  return Object.keys(state?.scannedCards || {}).length;
}

export function mergeScannedCards(a = {}, b = {}) {
  const combined = { ...a };
  for (const [key, at] of Object.entries(b || {})) {
    if (!combined[key] || new Date(at) < new Date(combined[key])) {
      combined[key] = at;
    }
  }
  return dedupeScannedCardsMap(combined);
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
