/** Local calendar day helpers using client timezone offset (minutes east of UTC). */

export function userLocalDayKey(date = new Date(), timezoneOffsetMinutes = 0) {
  const offset = Number(timezoneOffsetMinutes) || 0;
  const localMs = date.getTime() + offset * 60 * 1000;
  const local = new Date(localMs);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function userLocalHourMinute(date = new Date(), timezoneOffsetMinutes = 0) {
  const offset = Number(timezoneOffsetMinutes) || 0;
  const localMs = date.getTime() + offset * 60 * 1000;
  const local = new Date(localMs);
  return {
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
  };
}

export function normalizeDayKey(key) {
  if (!key || typeof key !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

export function hasLoggedInToday(state, timezoneOffsetMinutes, now = new Date()) {
  const today = userLocalDayKey(now, timezoneOffsetMinutes);
  const sessionDay = normalizeDayKey(state?.lastDailySessionKey);
  const coinDay = normalizeDayKey(state?.lastCoinDayKey);
  return sessionDay === today || coinDay === today;
}

export function hasScoutedToday(state, timezoneOffsetMinutes, now = new Date()) {
  const today = userLocalDayKey(now, timezoneOffsetMinutes);
  return normalizeDayKey(state?.lastScoutDate) === today;
}
