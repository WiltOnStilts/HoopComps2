/** Stable card identity for dedupe, unique scans, and fair rotation */

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

export function uniqueScoutCount(state) {
  const keys = Object.keys(state?.scannedCards || {});
  if (keys.length > 0) return keys.length;
  return state?.scoutCount || 0;
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

function pickNewerIso(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return new Date(a) >= new Date(b) ? a : b;
}

export function mergeCollectionByFingerprint(items = []) {
  const map = new Map();

  for (const item of items) {
    if (!item?.card) continue;
    const fp = cardFingerprint(item.card);
    const prev = map.get(fp);
    if (!prev) {
      map.set(fp, { ...item, quantity: Math.max(1, item.quantity || 1) });
      continue;
    }

    map.set(fp, {
      ...prev,
      quantity: (prev.quantity || 1) + Math.max(1, item.quantity || 1),
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
