/** Coins economy — earning rules, shop costs, migration */

import { getDayKey } from "./day-key.mjs";
import {
  defaultAvatarSelection,
  defaultOwnedAvatarParts,
  normalizeAvatarState,
} from "./avatar-catalog.mjs";

export { defaultAvatarSelection, defaultOwnedAvatarParts };

export const COINS_PER_UNIQUE_SCAN = 200;
export const COINS_DAILY_BONUS = 300;
export const STREAK_FREEZE_COST = 650;
export const COD_BOOST_COST_PER_PERCENT = 100;
export const ECONOMY_VERSION = 1;

export function codBoostCost(percent) {
  const p = Math.max(1, Math.min(50, Math.round(Number(percent) || 0)));
  return p * COD_BOOST_COST_PER_PERCENT;
}

export function tomorrowDayKey(fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setUTCDate(d.getUTCDate() + 1);
  return getDayKey(d);
}

export function normalizeEconomy(state) {
  if (!state || typeof state !== "object") return state;

  normalizeAvatarState(state);

  state.streakFreezes = Math.max(0, Number(state.streakFreezes) || 0);
  state.coins = Math.max(0, Number(state.coins) || 0);

  if (state.codBoost && typeof state.codBoost === "object") {
    state.codBoost = {
      dayKey: String(state.codBoost.dayKey || ""),
      percent: Math.max(0, Math.min(50, Number(state.codBoost.percent) || 0)),
    };
    if (!state.codBoost.dayKey || !state.codBoost.percent) state.codBoost = null;
  } else {
    state.codBoost = null;
  }

  delete state.xp;
  delete state.level;

  return state;
}

export function migrateEconomy(state) {
  if (!state || typeof state !== "object") return state;
  normalizeEconomy(state);

  if ((state.economyVersion || 0) >= ECONOMY_VERSION) return state;

  state.coins = 0;
  state.streakFreezes = 0;
  state.codBoost = null;
  state.lastCoinDayKey = null;
  state.profile.avatar = defaultAvatarSelection();
  state.ownedAvatarParts = defaultOwnedAvatarParts();
  state.economyVersion = ECONOMY_VERSION;
  delete state.xp;
  delete state.level;

  return state;
}

export function getCodBoostPercentForDay(state, dayKey = getDayKey()) {
  if (!state?.codBoost?.dayKey || state.codBoost.dayKey !== dayKey) return 0;
  return Math.max(0, Number(state.codBoost.percent) || 0);
}

/** Deterministic 0..1 float from an integer seed */
export function seededUnit(seed) {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Weighted user pick for Card of the Day.
 * Base weight 1 per collector; codBoostPercent adds weight (10% → +0.10).
 */
export function pickWeightedUser(userWeights, dayIdx) {
  const entries = [...userWeights.entries()].filter(([, w]) => w > 0);
  if (!entries.length) return null;
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = seededUnit(dayIdx) * total;
  for (const [userId, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return userId;
  }
  return entries[entries.length - 1][0];
}

export function buildUserCodWeights(userIds, cardsByUser, boostByUser = {}) {
  const weights = new Map();
  for (const userId of userIds) {
    const cardCount = cardsByUser.get(userId)?.length || 0;
    if (!cardCount) continue;
    const boost = Math.max(0, Number(boostByUser[userId]) || 0);
    weights.set(userId, 1 + boost / 100);
  }
  return weights;
}
