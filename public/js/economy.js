/** Coins economy — client earning, shop, streak helpers */

export const COINS_PER_UNIQUE_SCAN = 200;
export const COINS_DAILY_BONUS = 300;
export const STREAK_FREEZE_COST = 650;
export const COD_BOOST_COST_PER_PERCENT = 100;
export const ECONOMY_VERSION = 1;

export function localDayKey(date = new Date()) {
  return date.toDateString();
}

function yesterdayLocalDayKey(fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() - 1);
  return localDayKey(d);
}

export function tomorrowUtcDayKey(fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function codBoostCost(percent) {
  const p = Math.max(1, Math.min(50, Math.round(Number(percent) || 0)));
  return p * COD_BOOST_COST_PER_PERCENT;
}

export function defaultAvatarSelection() {
  return { face: "classic", hair: "buzz", clothes: "jersey" };
}

export function defaultOwnedAvatarParts() {
  return { face: ["classic"], hair: ["buzz"], clothes: ["jersey"] };
}

export function normalizeEconomy(state) {
  if (!state || typeof state !== "object") return state;

  if (!state.profile) state.profile = {};
  if (!state.profile.avatar || typeof state.profile.avatar !== "object") {
    state.profile.avatar = defaultAvatarSelection();
  }
  if (!state.ownedAvatarParts || typeof state.ownedAvatarParts !== "object") {
    state.ownedAvatarParts = defaultOwnedAvatarParts();
  }
  for (const key of ["face", "hair", "clothes"]) {
    if (!Array.isArray(state.ownedAvatarParts[key])) {
      state.ownedAvatarParts[key] = defaultOwnedAvatarParts()[key];
    }
    const freeId = defaultAvatarSelection()[key];
    if (!state.ownedAvatarParts[key].includes(freeId)) {
      state.ownedAvatarParts[key].unshift(freeId);
    }
  }

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

export function grantDailyCoins(state) {
  const today = localDayKey();
  if (state.lastCoinDayKey === today) return 0;
  state.lastCoinDayKey = today;
  state.coins = (state.coins || 0) + COINS_DAILY_BONUS;
  return COINS_DAILY_BONUS;
}

/**
 * Once per local day: grant daily coins and resolve overnight streak (freeze or break).
 * Returns events for first-login notifications.
 */
export function processDailySession(state) {
  const today = localDayKey();
  if (state.lastDailySessionKey === today) {
    return { state, events: [] };
  }

  state.lastDailySessionKey = today;
  const events = [];

  const coinsGranted = grantDailyCoins(state);
  if (coinsGranted > 0) {
    events.push({ type: "coins", amount: coinsGranted });
  }

  if (state.lastScoutDate) {
    const gap = daysBetweenLocalDates(state.lastScoutDate, today);
    const previousStreak = state.streak || 0;

    if (gap >= 2 && previousStreak > 0) {
      if (gap === 2 && (state.streakFreezes || 0) > 0) {
        state.streakFreezes -= 1;
        state.lastScoutDate = yesterdayLocalDayKey();
        events.push({
          type: "freeze_used",
          streak: state.streak,
          freezesLeft: state.streakFreezes,
        });
      } else {
        state.streak = 0;
        events.push({ type: "streak_broken", previousStreak });
      }
    }
  }

  return { state, events };
}

export function markDailyNotificationsShown(state) {
  state.lastDailyNotifyShownKey = localDayKey();
  return state;
}

export function shouldShowDailyNotifications(state) {
  return state.lastDailyNotifyShownKey !== localDayKey();
}

function daysBetweenLocalDates(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  da.setHours(0, 0, 0, 0);
  db.setHours(0, 0, 0, 0);
  return Math.round((db - da) / (24 * 60 * 60 * 1000));
}

/** Update streak when user scouts; freeze for one missed day handled on daily session open */
export function recordScoutStreak(state) {
  const today = localDayKey();
  if (state.lastScoutDate === today) return state;

  if (!state.lastScoutDate) {
    state.streak = 1;
  } else {
    const gap = daysBetweenLocalDates(state.lastScoutDate, today);
    if (gap === 1) {
      state.streak = (state.streak || 0) + 1;
    } else if (gap === 2 && (state.streakFreezes || 0) > 0) {
      state.streakFreezes -= 1;
      state.streak = (state.streak || 0) + 1;
    } else {
      state.streak = 1;
    }
  }

  state.lastScoutDate = today;
  return state;
}

export function awardUniqueScanCoins(state) {
  recordScoutStreak(state);
  state.coins = (state.coins || 0) + COINS_PER_UNIQUE_SCAN;
  return COINS_PER_UNIQUE_SCAN;
}

export function canAfford(state, cost) {
  return (state.coins || 0) >= cost;
}

export function spendCoins(state, cost) {
  if (!canAfford(state, cost)) return false;
  state.coins -= cost;
  return true;
}

export function purchaseStreakFreeze(state) {
  if (!spendCoins(state, STREAK_FREEZE_COST)) return { ok: false, error: "Not enough coins" };
  state.streakFreezes = (state.streakFreezes || 0) + 1;
  return { ok: true };
}

export function purchaseCodBoost(state, percent) {
  const p = Math.max(1, Math.min(50, Math.round(Number(percent) || 0)));
  const cost = codBoostCost(p);
  if (!spendCoins(state, cost)) return { ok: false, error: "Not enough coins" };
  state.codBoost = { dayKey: tomorrowUtcDayKey(), percent: p };
  return { ok: true, cost, percent: p, dayKey: state.codBoost.dayKey };
}

export function purchaseAvatarPart(state, category, itemId, price) {
  const owned = state.ownedAvatarParts?.[category] || [];
  if (owned.includes(itemId)) return { ok: false, error: "Already owned" };
  if (!spendCoins(state, price)) return { ok: false, error: "Not enough coins" };
  state.ownedAvatarParts[category] = [...owned, itemId];
  return { ok: true };
}

export function equipAvatarPart(state, category, itemId) {
  const owned = state.ownedAvatarParts?.[category] || [];
  if (!owned.includes(itemId)) return { ok: false, error: "Not owned" };
  state.profile.avatar = { ...state.profile.avatar, [category]: itemId };
  return { ok: true };
}

export const COINS_HELP_TEXT =
  "Coins unlock streak freezes, avatar styles, and tomorrow's Card of the Day boost in the Shop. Earn 200 coins per unique scan and 300 coins at the start of each day.";

function mergeOwnedAvatarParts(a = {}, b = {}) {
  const out = { face: [], hair: [], clothes: [] };
  for (const key of ["face", "hair", "clothes"]) {
    out[key] = [...new Set([...(a[key] || []), ...(b[key] || [])])];
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
