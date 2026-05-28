import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { pgReady } from "./pg-store.mjs";
import * as pgPush from "./pg-push.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUSH_PATH = path.join(__dirname, "..", "data", "push.json");

function emptyPushStore() {
  return {
    subscriptions: [],
    sent: [],
    meta: {},
  };
}

function readPushFile() {
  fs.mkdirSync(path.dirname(PUSH_PATH), { recursive: true });
  if (!fs.existsSync(PUSH_PATH)) return emptyPushStore();
  try {
    const data = JSON.parse(fs.readFileSync(PUSH_PATH, "utf8"));
    return {
      ...emptyPushStore(),
      ...data,
      subscriptions: data.subscriptions || [],
      sent: data.sent || [],
      meta: data.meta || {},
    };
  } catch {
    return emptyPushStore();
  }
}

function writePushFile(data) {
  fs.mkdirSync(path.dirname(PUSH_PATH), { recursive: true });
  fs.writeFileSync(PUSH_PATH, JSON.stringify(data, null, 2));
}

export async function upsertPushSubscription({
  userId,
  endpoint,
  p256dh,
  auth,
  timezoneOffsetMinutes = 0,
}) {
  if (pgPush.pgPushReady()) {
    await pgPush.pgUpsertPushSubscription({
      userId,
      endpoint,
      p256dh,
      auth,
      timezoneOffsetMinutes,
    });
    return;
  }

  const data = readPushFile();
  const existing = data.subscriptions.find((row) => row.endpoint === endpoint);
  const now = new Date().toISOString();
  if (existing) {
    existing.userId = userId;
    existing.p256dh = p256dh;
    existing.auth = auth;
    existing.timezoneOffsetMinutes = timezoneOffsetMinutes;
    existing.updatedAt = now;
  } else {
    data.subscriptions.push({
      id: crypto.randomUUID(),
      userId,
      endpoint,
      p256dh,
      auth,
      timezoneOffsetMinutes,
      createdAt: now,
      updatedAt: now,
    });
  }
  writePushFile(data);
}

export async function removePushSubscription(endpoint) {
  if (pgPush.pgPushReady()) {
    await pgPush.pgRemovePushSubscription(endpoint);
    return;
  }
  const data = readPushFile();
  data.subscriptions = data.subscriptions.filter((row) => row.endpoint !== endpoint);
  writePushFile(data);
}

export async function listPushSubscriptionsForUser(userId) {
  if (pgPush.pgPushReady()) {
    return pgPush.pgListPushSubscriptionsForUser(userId);
  }
  const data = readPushFile();
  return data.subscriptions
    .filter((row) => row.userId === userId)
    .map((row) => ({
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
      timezoneOffsetMinutes: Number(row.timezoneOffsetMinutes) || 0,
    }));
}

export async function listAllPushUsers() {
  if (pgPush.pgPushReady()) {
    return pgPush.pgListAllPushUsers();
  }
  const data = readPushFile();
  const byUser = new Map();
  for (const row of data.subscriptions) {
    if (!byUser.has(row.userId)) {
      byUser.set(row.userId, {
        userId: row.userId,
        timezoneOffsetMinutes: Number(row.timezoneOffsetMinutes) || 0,
      });
    }
  }
  return [...byUser.values()];
}

export async function wasNotificationSent(userId, type, dedupeKey) {
  if (pgPush.pgPushReady()) {
    return pgPush.pgWasNotificationSent(userId, type, dedupeKey);
  }
  const data = readPushFile();
  return data.sent.some(
    (row) => row.userId === userId && row.type === type && row.dedupeKey === dedupeKey
  );
}

export async function recordNotificationSent(userId, type, dedupeKey) {
  if (pgPush.pgPushReady()) {
    await pgPush.pgRecordNotificationSent(userId, type, dedupeKey);
    return;
  }
  const data = readPushFile();
  if (
    data.sent.some(
      (row) => row.userId === userId && row.type === type && row.dedupeKey === dedupeKey
    )
  ) {
    return;
  }
  data.sent.push({
    userId,
    type,
    dedupeKey,
    sentAt: new Date().toISOString(),
  });
  writePushFile(data);
}

export async function getPushMeta(key) {
  if (pgPush.pgPushReady()) {
    return pgPush.pgGetPushMeta(key);
  }
  const data = readPushFile();
  return data.meta?.[key] ?? null;
}

export async function setPushMeta(key, value) {
  if (pgPush.pgPushReady()) {
    await pgPush.pgSetPushMeta(key, value);
    return;
  }
  const data = readPushFile();
  if (!data.meta) data.meta = {};
  data.meta[key] = value;
  writePushFile(data);
}

export async function purgeOldNotificationSent(maxAgeDays = 14) {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
  if (pgPush.pgPushReady()) {
    await pgPush.pgPurgeOldNotificationSent(cutoff);
    return;
  }
  const data = readPushFile();
  data.sent = data.sent.filter((row) => row.sentAt >= cutoff);
  writePushFile(data);
}
