const TOKEN_KEY = "dynasty_token";
const USER_KEY = "dynasty_user";
const GUEST_SEED_KEY = "dynasty_guest_seed";
const SESSION_COOKIE = "dynasty_session";

let currentUser = null;
let authToken = null;
let onAuthChange = null;

function readSessionCookie() {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function writeSessionCookie(token) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const maxAge = 3650 * 24 * 60 * 60;
  if (!token) {
    document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    return;
  }
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function decodeJwtPayload(token) {
  try {
    const body = token.split(".")[1];
    if (!body) return null;
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isTokenValid(token) {
  const payload = decodeJwtPayload(token);
  if (!payload?.sub) return false;
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return false;
  return true;
}

function userFromToken(token) {
  const payload = decodeJwtPayload(token);
  if (!payload?.sub) return null;
  const email = payload.email || "";
  const username = payload.username || email.split("@")[0] || "player";
  return {
    id: payload.sub,
    email,
    username,
    displayName: payload.displayName || username,
  };
}

function persistSession(token, user) {
  authToken = token;
  currentUser = user;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    writeSessionCookie(token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    writeSessionCookie(null);
  }
  onAuthChange?.(currentUser);
}

export function getAuthToken() {
  return authToken || localStorage.getItem(TOKEN_KEY) || readSessionCookie();
}

export function loadStoredSession() {
  const token = localStorage.getItem(TOKEN_KEY) || readSessionCookie();
  authToken = token && isTokenValid(token) ? token : null;

  if (!authToken) {
    currentUser = null;
    return;
  }

  const raw = localStorage.getItem(USER_KEY);
  if (raw) {
    try {
      currentUser = JSON.parse(raw);
    } catch {
      currentUser = null;
    }
  }

  if (!currentUser) {
    currentUser = userFromToken(authToken);
    if (currentUser) {
      localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
    }
  }

  writeSessionCookie(authToken);
}

export function getCurrentUser() {
  if (currentUser) return currentUser;
  const token = getAuthToken();
  if (!token || !isTokenValid(token)) return null;
  currentUser = userFromToken(token);
  return currentUser;
}

export async function restoreSessionFromServer() {
  loadStoredSession();

  async function fetchSession({ useBearer = true } = {}) {
    const headers = {};
    const token = getAuthToken();
    if (useBearer && token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch("/api/auth/session", { credentials: "include", headers });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  try {
    let { ok, data } = await fetchSession({ useBearer: true });

    // Stale Bearer in localStorage can shadow a valid HttpOnly cookie.
    if ((!ok || !data.user) && getAuthToken()) {
      const retry = await fetchSession({ useBearer: false });
      if (retry.ok && retry.data.user) {
        ok = retry.ok;
        data = retry.data;
      }
    }

    if (ok && data.user) {
      persistSession(data.token || getAuthToken(), data.user);
      return data.user;
    }
  } catch {
    /* offline or server unavailable — keep local session */
  }

  const local = getCurrentUser();
  if (local) return local;
  return null;
}

export function isLoggedIn() {
  const token = getAuthToken();
  return Boolean(token && isTokenValid(token));
}

export function setAuthChangeHandler(fn) {
  onAuthChange = fn;
}

export function getChallengeSeed() {
  if (currentUser?.id) return currentUser.id;
  let seed = localStorage.getItem(GUEST_SEED_KEY);
  if (!seed) {
    seed = crypto.randomUUID();
    localStorage.setItem(GUEST_SEED_KEY, seed);
  }
  return seed;
}

export async function authFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const isAuthAction = path.startsWith("/api/auth/login") || path.startsWith("/api/auth/register");
  const token = getAuthToken();
  if (token && !isAuthAction) headers.Authorization = `Bearer ${token}`;
  if (path.startsWith("/api/dynasty/")) headers["X-Dynasty-Seed"] = getChallengeSeed();

  const res = await fetch(path, { ...options, headers, credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export async function register({ email, password, username }) {
  const data = await authFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: normalizeEmail(email),
      password: String(password ?? ""),
      username: String(username || "").trim(),
    }),
  });
  persistSession(data.token, data.user);
  return data;
}

export async function login({ email, password }) {
  const data = await authFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: normalizeEmail(email),
      password: String(password ?? ""),
    }),
  });
  persistSession(data.token, data.user);
  return data;
}

export async function logout() {
  try {
    await authFetch("/api/auth/logout", { method: "POST", body: "{}" });
  } catch {
    /* ignore */
  }
  persistSession(null, null);
}
