const TOKEN_KEY = "dynasty_token";
const USER_KEY = "dynasty_user";

let currentUser = null;
let authToken = null;
let onAuthChange = null;

function persistSession(token, user) {
  authToken = token;
  currentUser = user;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
  onAuthChange?.(currentUser);
}

export function loadStoredSession() {
  authToken = localStorage.getItem(TOKEN_KEY);
  const raw = localStorage.getItem(USER_KEY);
  if (raw) {
    try {
      currentUser = JSON.parse(raw);
    } catch {
      currentUser = null;
    }
  }
}

export async function restoreSessionFromServer() {
  const headers = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  try {
    const res = await fetch("/api/auth/session", { credentials: "include", headers });
    const data = await res.json().catch(() => ({}));
    if (data.user) {
      persistSession(data.token || authToken, data.user);
      return data.user;
    }
    // Stale token in localStorage or cookie — clear so login works cleanly
    if (authToken || currentUser) {
      persistSession(null, null);
    }
  } catch {
    // Offline: keep cached session so the app still feels signed in
    if (authToken && currentUser) return currentUser;
  }
  return null;
}

export function isLoggedIn() {
  return Boolean(currentUser && authToken);
}

export function getCurrentUser() {
  return currentUser;
}

export function setAuthChangeHandler(fn) {
  onAuthChange = fn;
}

export async function authFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const isAuthAction = path.startsWith("/api/auth/login") || path.startsWith("/api/auth/register");
  if (authToken && !isAuthAction) headers.Authorization = `Bearer ${authToken}`;

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

export async function register({ email, password, displayName, username }) {
  const data = await authFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: normalizeEmail(email),
      password: String(password ?? ""),
      displayName: String(displayName || "").trim(),
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
