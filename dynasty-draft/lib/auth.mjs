import crypto from "crypto";
import {
  findUserByEmail,
  findUserById,
  createUser,
  getUserPasswordHash,
} from "./db.mjs";

const SESSION_COOKIE = "dynasty_session";

const JWT_SECRET = () =>
  process.env.JWT_SECRET || "dynasty-draft-dev-secret-change-in-production";

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

/** Long-lived session — cleared only on explicit sign out */
export function signToken(payload, expiresInDays = 3650) {
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
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function getRequestToken(req) {
  const bearer = getBearerToken(req);
  const cookie = getSessionCookieToken(req);
  if (bearer && verifyToken(bearer)) return bearer;
  if (cookie && verifyToken(cookie)) return cookie;
  return bearer || cookie;
}

export function sessionCookieHeader(token) {
  const maxAge = 3650 * 24 * 60 * 60;
  const secure =
    process.env.NODE_ENV === "production" || process.env.RENDER === "true" ? "; Secure" : "";
  if (!token) {
    return `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  }
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export async function requireUser(req) {
  const token = getRequestToken(req);
  const payload = verifyToken(token);
  if (!payload?.sub) return null;
  return findUserById(payload.sub);
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name || user.displayName,
    username: user.username,
  };
}

export async function registerUser({ email, password, username }) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalizedEmail.includes("@")) throw new Error("Valid email required");
  if (!password || String(password).length < 6) throw new Error("Password must be at least 6 characters");
  const handle = String(username || "")
    .trim()
    .replace(/^@+/, "")
    .slice(0, 24);
  if (!handle) throw new Error("Username required");
  const user = createUser({
    email: normalizedEmail,
    passwordHash: hashPassword(String(password)),
    username: handle,
  });
  const token = signToken({ sub: user.id, email: user.email });
  return { user: publicUser(user), token };
}

export async function loginUser({ email, password }) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const row = findUserByEmail(normalizedEmail);
  if (!row) throw new Error("Invalid email or password");
  const hash = getUserPasswordHash(row.id);
  if (!verifyPassword(String(password ?? ""), hash)) throw new Error("Invalid email or password");
  const token = signToken({ sub: row.id, email: row.email });
  return { user: publicUser(row), token };
}

export async function sessionFromToken(token) {
  const payload = verifyToken(token);
  if (!payload?.sub) return null;
  const user = findUserById(payload.sub);
  if (!user) return null;
  return { user: publicUser(user), token };
}

export { SESSION_COOKIE };
