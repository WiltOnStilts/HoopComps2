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
  const lastScoutDate =
    !cloudState.lastScoutDate
      ? localState.lastScoutDate || null
      : !localState.lastScoutDate
        ? cloudState.lastScoutDate
        : new Date(cloudState.lastScoutDate) >= new Date(localState.lastScoutDate)
          ? cloudState.lastScoutDate
          : localState.lastScoutDate;

  return {
    coins: Math.max(cloudState.coins || 0, localState.coins || 0),
    streak: Math.max(cloudState.streak || 0, localState.streak || 0),
    streakFreezes: Math.max(cloudState.streakFreezes || 0, localState.streakFreezes || 0),
    ownedAvatarParts: mergeOwnedAvatarParts(cloudState.ownedAvatarParts, localState.ownedAvatarParts),
    codBoost: mergeCodBoost(cloudState.codBoost, localState.codBoost),
    lastCoinDayKey: cloudState.lastCoinDayKey || localState.lastCoinDayKey || null,
    lastDailySessionKey: cloudState.lastDailySessionKey || localState.lastDailySessionKey || null,
    lastDailyNotifyShownKey:
      cloudState.lastDailyNotifyShownKey || localState.lastDailyNotifyShownKey || null,
    lastScoutDate,
    economyVersion: Math.max(cloudState.economyVersion || 0, localState.economyVersion || 0, ECONOMY_VERSION),
  };
}
