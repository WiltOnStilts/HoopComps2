/** Merge economy fields when reconciling local + cloud state */

import { ECONOMY_VERSION } from "./economy.mjs";
import { defaultOwnedAvatarParts, AVATAR_PART_KEYS, SKIN_IDS, EYE_COLOR_IDS, EYEBROW_COLOR_IDS } from "./avatar-catalog.mjs";

function mergeOwnedAvatarParts(a = {}, b = {}) {
  const out = defaultOwnedAvatarParts();
  for (const key of AVATAR_PART_KEYS) {
    out[key] = [...new Set([...(a[key] || []), ...(b[key] || [])])];
    if (key === "skin") {
      out.skin = [...SKIN_IDS];
    } else if (key === "eyeColor") {
      out.eyeColor = [...EYE_COLOR_IDS];
    } else if (key === "eyebrowColor") {
      out.eyebrowColor = [...EYEBROW_COLOR_IDS];
    }
  }
  return out;
}

function localDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeDayKey(key) {
  if (!key) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  const legacy = new Date(key);
  if (Number.isNaN(legacy.getTime())) return null;
  return localDayKey(legacy);
}

function mergeMostRecentDayKey(a, b) {
  const na = normalizeDayKey(a);
  const nb = normalizeDayKey(b);
  if (!na) return nb || null;
  if (!nb) return na || null;
  return na >= nb ? na : nb;
}

function mergeStreak(cloudState, localState, lastScoutDate) {
  const cloudDate = normalizeDayKey(cloudState.lastScoutDate);
  const localDate = normalizeDayKey(localState.lastScoutDate);
  if (!lastScoutDate) return 0;
  if (cloudDate === localDate) {
    return Math.max(cloudState.streak || 0, localState.streak || 0);
  }
  if (cloudDate === lastScoutDate) return cloudState.streak || 0;
  if (localDate === lastScoutDate) return localState.streak || 0;
  return Math.max(cloudState.streak || 0, localState.streak || 0);
}

function mergeCodBoost(a, b) {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  if (a.dayKey === b.dayKey) {
    return { dayKey: a.dayKey, percent: Math.max(a.percent || 0, b.percent || 0) };
  }
  return (a.percent || 0) >= (b.percent || 0) ? a : b;
}

export function mergedEconomyFields(cloudState = {}, localState = {}) {
  const cloudScout = normalizeDayKey(cloudState.lastScoutDate);
  const localScout = normalizeDayKey(localState.lastScoutDate);
  const lastScoutDate =
    !cloudScout
      ? localScout || null
      : !localScout
        ? cloudScout
        : cloudScout >= localScout
          ? cloudScout
          : localScout;

  return {
    coins: Math.max(cloudState.coins || 0, localState.coins || 0),
    streak: mergeStreak(cloudState, localState, lastScoutDate),
    streakFreezes: Math.max(cloudState.streakFreezes || 0, localState.streakFreezes || 0),
    ownedAvatarParts: mergeOwnedAvatarParts(cloudState.ownedAvatarParts, localState.ownedAvatarParts),
    codBoost: mergeCodBoost(cloudState.codBoost, localState.codBoost),
    lastCoinDayKey: mergeMostRecentDayKey(cloudState.lastCoinDayKey, localState.lastCoinDayKey),
    lastDailySessionKey: mergeMostRecentDayKey(
      cloudState.lastDailySessionKey,
      localState.lastDailySessionKey
    ),
    lastDailyNotifyShownKey: mergeMostRecentDayKey(
      cloudState.lastDailyNotifyShownKey,
      localState.lastDailyNotifyShownKey
    ),
    lastScoutDate,
    economyVersion: Math.max(cloudState.economyVersion || 0, localState.economyVersion || 0, ECONOMY_VERSION),
  };
}
