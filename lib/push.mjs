import { initPushVapid, webpush, isPushConfigured } from "./push-vapid.mjs";
import {
  listPushSubscriptionsForUser,
  removePushSubscription,
  wasNotificationSent,
  recordNotificationSent,
} from "./push-store.mjs";

export const PUSH_TYPES = {
  streak_reminder: "streak_reminder",
  scout_prompt: "scout_prompt",
  friend_accepted: "friend_accepted",
  cod_spotlight: "cod_spotlight",
};

const STREAK_REMINDER_HOURS = [10, 14, 18, 21];
export const SCOUT_PROMPT_HOUR = 12;

function buildPayload(type, context = {}) {
  switch (type) {
    case PUSH_TYPES.streak_reminder:
      return {
        title: "Keep your streak alive 🔥",
        body: `You have a ${context.streak || 0}-day scouting streak. Scout a card today to keep it going.`,
        url: "/?view=scout",
        tag: context.dedupeKey,
      };
    case PUSH_TYPES.scout_prompt:
      return {
        title: "Got a new card?",
        body: "Come check the value on HoopComps!",
        url: "/?view=scout",
        tag: context.dedupeKey,
      };
    case PUSH_TYPES.friend_accepted:
      return {
        title: "Friend request accepted",
        body: `${context.displayName || "A collector"} accepted your friend request.`,
        url: "/?view=community",
        tag: context.dedupeKey,
      };
    case PUSH_TYPES.cod_spotlight:
      return {
        title: "Your card is the Card of the Day! ⭐",
        body: context.cardTitle
          ? `"${context.cardTitle}" is featured on HoopComps today.`
          : "One of your cards is featured on HoopComps today.",
        url: "/?view=community",
        tag: context.dedupeKey,
      };
    default:
      return {
        title: "HoopComps",
        body: context.body || "You have a new update.",
        url: context.url || "/",
        tag: context.dedupeKey,
      };
  }
}

function subscriptionObject(sub) {
  return {
    endpoint: sub.endpoint,
    keys: sub.keys,
  };
}

export async function sendPushToUser(userId, type, dedupeKey, context = {}) {
  initPushVapid();
  if (!isPushConfigured()) return { sent: false, reason: "not_configured" };

  if (await wasNotificationSent(userId, type, dedupeKey)) {
    return { sent: false, reason: "duplicate" };
  }

  const subs = await listPushSubscriptionsForUser(userId);
  if (!subs.length) return { sent: false, reason: "no_subscriptions" };

  const payload = buildPayload(type, { ...context, dedupeKey });
  let delivered = false;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        subscriptionObject(sub),
        JSON.stringify(payload),
        { TTL: 60 * 60 * 6 }
      );
      delivered = true;
    } catch (err) {
      const code = err?.statusCode;
      if (code === 404 || code === 410) {
        await removePushSubscription(sub.endpoint);
      }
    }
  }

  if (delivered) {
    await recordNotificationSent(userId, type, dedupeKey);
  }

  return { sent: delivered, reason: delivered ? "ok" : "delivery_failed" };
}

export async function notifyFriendRequestAccepted(fromUserId, { requestId, displayName }) {
  if (!fromUserId || !requestId) return;
  return sendPushToUser(fromUserId, PUSH_TYPES.friend_accepted, requestId, {
    displayName,
    dedupeKey: requestId,
  });
}

export async function notifyCodSpotlight(userId, { dayKey, cardTitle }) {
  if (!userId || !dayKey) return;
  return sendPushToUser(userId, PUSH_TYPES.cod_spotlight, dayKey, {
    cardTitle,
    dedupeKey: dayKey,
  });
}

export function streakReminderDedupeKey(localDayKey, hour) {
  return `${localDayKey}-streak-${hour}`;
}

export function scoutPromptDedupeKey(localDayKey) {
  return `${localDayKey}-scout_prompt`;
}

export { STREAK_REMINDER_HOURS };
