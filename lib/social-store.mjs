import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDayKey } from "./day-key.mjs";

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

function readSocial() {
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

function writeSocial(data) {
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

export function loadSocial() {
  const data = readSocial();
  let changed = purgeDailyCodData(data);
  if (purgeExpiredCommentBans(data)) changed = true;
  if (changed) writeSocial(data);
  return data;
}

export function saveSocial(mutator) {
  const data = loadSocial();
  mutator(data);
  purgeDailyCodData(data);
  purgeExpiredCommentBans(data);
  writeSocial(data);
  return data;
}
