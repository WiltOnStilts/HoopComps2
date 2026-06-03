import crypto from "crypto";
import {
  findUserByEmail,
  findUserById,
  createUser,
  getUserState,
  saveUserState,
  updatePasswordHash,
} from "./db.mjs";
import { mergeScannedCards, mergeCollectionByFingerprint, mergedScanFields } from "./card-fingerprint.mjs";
import { mergedEconomyFields } from "./economy-merge.mjs";

const JWT_SECRET = () =>
  process.env.JWT_SECRET || "hoopcomps-dev-secret-change-in-production";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!password || !stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const attempt = crypto.scryptSync(password, salt, 64).toString("hex");
    const hashBuf = Buffer.from(hash, "hex");
    const attemptBuf = Buffer.from(attempt, "hex");
    if (hashBuf.length !== attemptBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, attemptBuf);
  } catch {
    return false;
  }
}

function b64url(data) {
  return Buffer.from(data).toString("base64url");
}

function b64urlDecode(str) {
  return Buffer.from(str, "base64url").toString("utf8");
}

export function signToken(payload, expiresInDays = 365) {
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

export function getSessionCookieToken(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)hoopcomps_session=([^;]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function getRequestToken(req) {
  return getBearerToken(req) || getSessionCookieToken(req);
}

export function sessionCookieHeader(token) {
  const maxAge = 365 * 24 * 60 * 60;
  const secure =
    process.env.NODE_ENV === "production" || process.env.RENDER === "true" ? "; Secure" : "";
  if (!token) {
    return `hoopcomps_session=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  }
  return `hoopcomps_session=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export async function requireUser(req) {
  const token = getRequestToken(req);
  const payload = verifyToken(token);
  if (!payload?.sub) return null;
  const user = await findUserById(payload.sub);
  if (!user) return null;
  return user;
}

export async function sessionFromToken(token) {
  const payload = verifyToken(token);
  if (!payload?.sub) return null;
  const user = await findUserById(payload.sub);
  if (!user) return null;
  return {
    token,
    user: { id: user.id, email: user.email, displayName: user.display_name },
  };
}

export async function registerUser({ email, password, displayName }) {
  const normalized = email?.toLowerCase()?.trim();
  if (!normalized || !normalized.includes("@")) {
    throw new Error("Valid email required");
  }
  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }
  if (await findUserByEmail(normalized)) {
    throw new Error("Email already registered — try signing in");
  }

  const id = crypto.randomUUID();
  await createUser({
    id,
    email: normalized,
    passwordHash: hashPassword(password),
    displayName: displayName?.trim() || normalized.split("@")[0],
  });

  const token = signToken({ sub: id, email: normalized });
  const data = await getUserState(id);
  return {
    token,
    user: { id, email: normalized, displayName: data.state.profile?.displayName || "Scout" },
    state: data?.state,
  };
}

export async function loginUser({ email, password }) {
  const normalized = email?.toLowerCase()?.trim();
  const row = await findUserByEmail(normalized);
  if (!row) {
    throw new Error("No account found for that email — create one instead");
  }
  if (!verifyPassword(password, row.password_hash)) {
    throw new Error("Incorrect password — try again or use Forgot password");
  }
  const token = signToken({ sub: row.id, email: row.email });
  const data = await getUserState(row.id);
  return {
    token,
    user: { id: row.id, email: row.email, displayName: row.display_name },
    state: data?.state,
    publicLeaderboard: data?.publicLeaderboard,
  };
}

export async function resetPassword({ email, newPassword, displayName }) {
  const normalized = email?.toLowerCase()?.trim();
  if (!normalized || !normalized.includes("@")) {
    throw new Error("Valid email required");
  }
  if (!newPassword || newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }
  const row = await findUserByEmail(normalized);
  if (row) {
    await updatePasswordHash(row.id, hashPassword(newPassword));
    return loginUser({ email: normalized, password: newPassword });
  }
  return registerUser({
    email: normalized,
    password: newPassword,
    displayName: displayName?.trim() || normalized.split("@")[0],
  });
}

export function mergeGuestIntoCloud(guestState, cloudState) {
  const mergedProfile = {
    ...(cloudState?.profile || {}),
    ...(guestState?.profile || {}),
  };

  const scan = mergedScanFields(cloudState, guestState);
  const economy = mergedEconomyFields(cloudState, guestState);
  const collection = mergeCollectionByFingerprint([
    ...(cloudState?.collection || []),
    ...(guestState?.collection || []),
  ]);

  const guestTs = guestState?.stateUpdatedAt
    ? new Date(guestState.stateUpdatedAt).getTime()
    : 0;
  const cloudTs = cloudState?.stateUpdatedAt
    ? new Date(cloudState.stateUpdatedAt).getTime()
    : 0;
  const base = guestTs >= cloudTs ? { ...cloudState, ...guestState } : { ...guestState, ...cloudState };

  return {
    ...base,
    ...economy,
    ...scan,
    profile: mergedProfile,
    collection,
    lastScout: guestState?.lastScout || cloudState?.lastScout,
    scoutResultCache: {
      ...(cloudState?.scoutResultCache || {}),
      ...(guestState?.scoutResultCache || {}),
    },
    stateUpdatedAt:
      guestTs >= cloudTs
        ? guestState?.stateUpdatedAt || cloudState?.stateUpdatedAt
        : cloudState?.stateUpdatedAt || guestState?.stateUpdatedAt,
  };
}

export async function alignStateWithAccountDisplayName(userId, state) {
  const account = await findUserById(userId);
  const name = account?.display_name?.trim();
  if (!name || !state) return state;
  return {
    ...state,
    profile: { ...state.profile, displayName: name },
  };
}

export { getUserState, saveUserState };
