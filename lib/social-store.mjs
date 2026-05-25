import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDayKey } from "./day-key.mjs";
import { pgReady } from "./pg-store.mjs";
import * as pgSocial from "./pg-social.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOCIAL_PATH = path.join(__dirname, "..", "data", "social.json");

function emptySocial() {
  return {
    friendRequests: [],
    friendships: [],
    profilePosts: [],
    codComments: [],
    codCommentAgreements: [],
    commentBans: [],
    testUnbanUsed: [],
  };
}

function readSocialFile() {
  fs.mkdirSync(path.dirname(SOCIAL_PATH), { recursive: true });
  if (!fs.existsSync(SOCIAL_PATH)) return emptySocial();
  try {
    const data = JSON.parse(fs.readFileSync(SOCIAL_PATH, "utf8"));
    return {
      ...emptySocial(),
      ...data,
      friendRequests: data.friendRequests || [],
      friendships: data.friendships || [],
      profilePosts: data.profilePosts || [],
      codComments: data.codComments || [],
      codCommentAgreements: data.codCommentAgreements || [],
      commentBans: data.commentBans || [],
      testUnbanUsed: data.testUnbanUsed || [],
    };
  } catch {
    return emptySocial();
  }
}

function writeSocialFile(data) {
  fs.mkdirSync(path.dirname(SOCIAL_PATH), { recursive: true });
  fs.writeFileSync(SOCIAL_PATH, JSON.stringify(data, null, 2));
}

export function purgeExpiredCommentBans(data) {
  const now = Date.now();
  if (!Array.isArray(data.commentBans)) {
    data.commentBans = [];
    return false;
  }
  const before = data.commentBans.length;
  data.commentBans = data.commentBans.filter((ban) => new Date(ban.until).getTime() > now);
  return data.commentBans.length !== before;
}

export function purgeDailyCodData(data) {
  const dayKey = getDayKey();
  let changed = false;

  const commentsBefore = data.codComments.length;
  data.codComments = data.codComments.filter((c) => c.dayKey === dayKey);
  if (data.codComments.length !== commentsBefore) changed = true;

  if (Array.isArray(data.codCommentAgreements)) {
    const agreementsBefore = data.codCommentAgreements.length;
    data.codCommentAgreements = data.codCommentAgreements.filter((a) => a.dayKey === dayKey);
    if (data.codCommentAgreements.length !== agreementsBefore) changed = true;
  } else {
    data.codCommentAgreements = [];
  }

  return changed;
}

/** @deprecated use purgeDailyCodData */
export function purgeOldCodComments(data) {
  return purgeDailyCodData(data);
}

/** One-time import of data/social.json into Postgres when tables are empty */
export async function migrateSocialJsonToPostgres() {
  if (!pgReady() || !fs.existsSync(SOCIAL_PATH)) return false;
  try {
    const json = JSON.parse(fs.readFileSync(SOCIAL_PATH, "utf8"));
    return pgSocial.pgImportSocialFromJson(json);
  } catch {
    return false;
  }
}

export async function loadSocial() {
  const data = pgReady() ? await pgSocial.pgLoadSocial() : readSocialFile();
  let changed = purgeDailyCodData(data);
  if (purgeExpiredCommentBans(data)) changed = true;
  if (changed) await writeSocial(data);
  return data;
}

async function writeSocial(data) {
  if (pgReady()) {
    await pgSocial.pgSaveSocial(data);
  } else {
    writeSocialFile(data);
  }
}

export async function saveSocial(mutator) {
  const data = await loadSocial();
  mutator(data);
  purgeDailyCodData(data);
  purgeExpiredCommentBans(data);
  await writeSocial(data);
  return data;
}

export function usesPostgresSocial() {
  return pgReady();
}
