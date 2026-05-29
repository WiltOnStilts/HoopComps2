import { getDayKey } from "./day-key.mjs";
import { pickCardOfDay } from "./card-of-day.mjs";
import {
  hasLoggedInToday,
  userLocalDayKey,
  userLocalHourMinute,
} from "./user-local-day.mjs";
import {
  listAllPushUsers,
  getPushMeta,
  setPushMeta,
  purgeOldNotificationSent,
} from "./push-store.mjs";
import {
  sendPushToUser,
  notifyCodSpotlight,
  PUSH_TYPES,
  STREAK_REMINDER_HOURS,
  SCOUT_PROMPT_HOUR,
  streakReminderDedupeKey,
  scoutPromptDedupeKey,
} from "./push.mjs";
import { isPushConfigured } from "./push-vapid.mjs";

const META_LAST_COD_DAY = "lastCodNotifyDayKey";
const SCHEDULER_MS = 5 * 60 * 1000;

let schedulerTimer = null;
let codDeps = null;
let tickInFlight = false;
let lastTickAt = null;

export function configurePushScheduler(deps) {
  codDeps = deps;
}

export function isPushSchedulerRunning() {
  return Boolean(schedulerTimer);
}

export function getPushSchedulerLastTickAt() {
  return lastTickAt;
}

/** True once the user's local clock has reached targetHour (any time that day). */
function hasReachedLocalHour(now, timezoneOffsetMinutes, targetHour) {
  const { hour } = userLocalHourMinute(now, timezoneOffsetMinutes);
  return hour >= targetHour;
}

async function runCodSpotlightJob(now = new Date()) {
  if (!codDeps?.getCommunityCards || !codDeps?.buildSpotlightCards) return;

  const dayKey = getDayKey(now);
  const lastDay = await getPushMeta(META_LAST_COD_DAY);
  if (lastDay === dayKey) return;

  try {
    const communityCards = await codDeps.getCommunityCards();
    const { cards, spotlightUserIds } = await codDeps.buildSpotlightCards(communityCards);
    const userBoosts = codDeps.getUserBoosts ? await codDeps.getUserBoosts() : {};
    const pick = pickCardOfDay(spotlightUserIds, cards, userBoosts);
    const ownerId = pick.spotlightUserId || pick.userId;
    if (ownerId) {
      await notifyCodSpotlight(ownerId, {
        dayKey,
        cardTitle: pick.card?.title || pick.headline || "Your card",
      });
    }
    await setPushMeta(META_LAST_COD_DAY, dayKey);
  } catch (err) {
    console.error("Push scheduler CoD job failed:", err.message);
  }
}

async function runUserScheduledNotifications(now = new Date()) {
  const users = await listAllPushUsers();
  if (!users.length || !codDeps?.getUserState) return;

  for (const { userId, timezoneOffsetMinutes } of users) {
    try {
      const stateRow = await codDeps.getUserState(userId);
      const state = stateRow?.state || {};
      const localDay = userLocalDayKey(now, timezoneOffsetMinutes);

      if (hasLoggedInToday(state, timezoneOffsetMinutes, now)) {
        continue;
      }

      const streak = Number(state.streak) || 0;

      if (streak > 0) {
        for (const hour of STREAK_REMINDER_HOURS) {
          if (!hasReachedLocalHour(now, timezoneOffsetMinutes, hour)) continue;
          const dedupeKey = streakReminderDedupeKey(localDay, hour);
          const result = await sendPushToUser(userId, PUSH_TYPES.streak_reminder, dedupeKey, {
            streak,
            dedupeKey,
          });
          if (result.sent) break;
          if (result.reason === "duplicate") continue;
          break;
        }
      } else if (hasReachedLocalHour(now, timezoneOffsetMinutes, STREAK_REMINDER_HOURS[0])) {
        const dedupeKey = scoutPromptDedupeKey(localDay);
        await sendPushToUser(userId, PUSH_TYPES.scout_prompt, dedupeKey, { dedupeKey });
      }

      if (streak === 0 && hasReachedLocalHour(now, timezoneOffsetMinutes, SCOUT_PROMPT_HOUR)) {
        const dedupeKey = scoutPromptDedupeKey(localDay);
        await sendPushToUser(userId, PUSH_TYPES.scout_prompt, dedupeKey, { dedupeKey });
      }
    } catch (err) {
      console.error(`Push scheduler user job failed for ${userId}:`, err.message);
    }
  }
}

async function runPushSchedulerTick() {
  if (tickInFlight) return { ok: false, reason: "in_flight" };
  if (!isPushConfigured()) return { ok: false, reason: "not_configured" };

  tickInFlight = true;
  try {
    await purgeOldNotificationSent(14);
    await runCodSpotlightJob();
    await runUserScheduledNotifications();
    lastTickAt = new Date().toISOString();
    return { ok: true, ranAt: lastTickAt };
  } catch (err) {
    console.error("Push scheduler tick failed:", err.message);
    return { ok: false, reason: err.message };
  } finally {
    tickInFlight = false;
  }
}

export function triggerPushSchedulerTick() {
  return runPushSchedulerTick();
}

export function startPushScheduler(deps) {
  configurePushScheduler(deps);
  if (schedulerTimer) return;
  if (!isPushConfigured()) return;
  void runPushSchedulerTick();
  schedulerTimer = setInterval(() => void runPushSchedulerTick(), SCHEDULER_MS);
}

export function stopPushScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
