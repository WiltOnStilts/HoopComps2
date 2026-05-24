import crypto from "crypto";
import { findUserByEmail, findUserById, createUser, getUserState, saveUserState } from "./db.mjs";

const JWT_SECRET = () =>
  process.env.JWT_SECRET || "hoopcomps-dev-secret-change-in-production";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const attempt = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(attempt, "hex"));
}

function b64url(data) {
  return Buffer.from(data).toString("base64url");
}

function b64urlDecode(str) {
  return Buffer.from(str, "base64url").toString("utf8");
}

export function signToken(payload, expiresInDays = 30) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 86400;
  const body = b64url(JSON.stringify({ ...payload, exp }));
  const sig = crypto
    .createHmac("sha256", JWT_SECRET())
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto
    .createHmac("sha256", JWT_SECRET())
    .update(`${header}.${body}`)
    .digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getBearerToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

export function requireUser(req) {
  const token = getBearerToken(req);
  const payload = verifyToken(token);
  if (!payload?.sub) return null;
  const user = findUserById(payload.sub);
  if (!user) return null;
  return user;
}

export function registerUser({ email, password, displayName }) {
  const normalized = email?.toLowerCase()?.trim();
  if (!normalized || !normalized.includes("@")) {
    throw new Error("Valid email required");
  }
  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }
  if (findUserByEmail(normalized)) {
    throw new Error("Email already registered — try signing in");
  }

  const id = crypto.randomUUID();
  createUser({
    id,
    email: normalized,
    passwordHash: hashPassword(password),
    displayName: displayName?.trim() || normalized.split("@")[0],
  });

  const token = signToken({ sub: id, email: normalized });
  const { state } = getUserState(id);
  return {
    token,
    user: { id, email: normalized, displayName: state.profile?.displayName || "Scout" },
    state,
  };
}

export function loginUser({ email, password }) {
  const normalized = email?.toLowerCase()?.trim();
  const row = findUserByEmail(normalized);
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new Error("Invalid email or password");
  }
  const token = signToken({ sub: row.id, email: row.email });
  const data = getUserState(row.id);
  return {
    token,
    user: { id: row.id, email: row.email, displayName: row.display_name },
    state: data?.state,
    publicLeaderboard: data?.publicLeaderboard,
  };
}

export function mergeGuestIntoCloud(guestState, cloudState) {
  const mergedProfile = {
    ...(guestState?.profile || {}),
    ...(cloudState?.profile || {}),
  };

  if (!guestState?.collection?.length) {
    return { ...cloudState, ...guestState, profile: mergedProfile };
  }
  if (!cloudState?.collection?.length) {
    return { ...cloudState, ...guestState, profile: mergedProfile };
  }

  const cloudIds = new Set(cloudState.collection.map((c) => c.id));
  const merged = [...cloudState.collection];
  for (const item of guestState.collection) {
    if (!cloudIds.has(item.id)) merged.unshift(item);
  }

  return {
    ...cloudState,
    xp: Math.max(cloudState.xp || 0, guestState.xp || 0),
    level: Math.max(cloudState.level || 1, guestState.level || 1),
    streak: Math.max(cloudState.streak || 0, guestState.streak || 0),
    scoutCount: Math.max(cloudState.scoutCount || 0, guestState.scoutCount || 0),
    profile: mergedProfile,
    collection: merged,
    lastScout: guestState.lastScout || cloudState.lastScout,
  };
}

/** Keep profile display name aligned with the signed-in account record */
export function alignStateWithAccountDisplayName(userId, state) {
  const account = findUserById(userId);
  const name = account?.display_name?.trim();
  if (!name || !state) return state;
  return {
    ...state,
    profile: { ...state.profile, displayName: name },
  };
}

export { getUserState, saveUserState };
