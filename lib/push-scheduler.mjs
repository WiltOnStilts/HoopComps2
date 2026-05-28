import { getDayKey } from "./day-key.mjs";
import { pickCardOfDay } from "./card-of-day.mjs";
import {
  hasLoggedInToday,
  hasScoutedToday,
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
import { initPushVapid } from "./push-vapid.mjs";

const META_LAST_COD_DAY = "lastCodNotifyDayKey";
const SCHEDULER_MS = 15 * 60 * 1000;
const SLOT_WINDOW_MINUTES = 15;

let schedulerTimer = null;
let codDeps = null;

export function configurePushScheduler(deps) {
  codDeps = deps;
}

function isInHourSlot(now, timezoneOffsetMinutes, targetHour) {
  const { hour, minute } = userLocalHourMinute(now, timezoneOffsetMinutes);
  return hour === targetHour && minute < SLOT_WINDOW_MINUTES;
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
      const needsStreakReminder =
        streak > 0 && !hasScoutedToday(state, timezoneOffsetMinutes, now);

      if (needsStreakReminder) {
        for (const hour of STREAK_REMINDER_HOURS) {
          if (!isInHourSlot(now, timezoneOffsetMinutes, hour)) continue;
          const dedupeKey = streakReminderDedupeKey(localDay, hour);
          await sendPushToUser(userId, PUSH_TYPES.streak_reminder, dedupeKey, {
            streak,
            dedupeKey,
          });
        }
      }

      if (isInHourSlot(now, timezoneOffsetMinutes, SCOUT_PROMPT_HOUR)) {
        const dedupeKey = scoutPromptDedupeKey(localDay);
        await sendPushToUser(userId, PUSH_TYPES.scout_prompt, dedupeKey, { dedupeKey });
      }
    } catch (err) {
      console.error(`Push scheduler user job failed for ${userId}:`, err.message);
    }
  }
}

async function runPushSchedulerTick() {
  try {
    initPushVapid();
    await purgeOldNotificationSent(14);
    await runCodSpotlightJob();
    await runUserScheduledNotifications();
  } catch (err) {
    console.error("Push scheduler tick failed:", err.message);
  }
}

export function startPushScheduler(deps) {
  configurePushScheduler(deps);
  if (schedulerTimer) return;
  void runPushSchedulerTick();
  schedulerTimer = setInterval(() => void runPushSchedulerTick(), SCHEDULER_MS);
}

export function stopPushScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
