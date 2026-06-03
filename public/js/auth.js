const TOKEN_KEY = "hoopcomps_token";
const USER_KEY = "hoopcomps_user";
const SESSION_COOKIE = "hoopcomps_session";

let currentUser = null;
let authToken = null;
let syncTimer = null;
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
  if (!token) {
    document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    return;
  }
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${31536000}; SameSite=Lax${secure}`;
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

function userFromToken(token) {
  const payload = decodeJwtPayload(token);
  if (!payload?.sub) return null;
  const email = payload.email || "";
  return {
    id: payload.sub,
    email,
    displayName: email.split("@")[0] || "Scout",
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
}

export function setAuthChangeHandler(fn) {
  onAuthChange = fn;
}

export function getAuthToken() {
  return authToken || localStorage.getItem(TOKEN_KEY);
}

export function getCurrentUser() {
  if (currentUser) return currentUser;
  const token = getAuthToken();
  if (!token) return null;
  const user = userFromToken(token);
  if (user) currentUser = user;
  return currentUser;
}

export function isLoggedIn() {
  return Boolean(getAuthToken());
}

export function loadStoredSession() {
  let token =
    localStorage.getItem(TOKEN_KEY) ||
    localStorage.getItem("compscourt_token") ||
    readSessionCookie();
  let userRaw = localStorage.getItem(USER_KEY) || localStorage.getItem("compscourt_user");

  if (token && token !== localStorage.getItem(TOKEN_KEY)) {
    localStorage.setItem(TOKEN_KEY, token);
    if (userRaw) localStorage.setItem(USER_KEY, userRaw);
  }

  if (!token) {
    authToken = null;
    currentUser = null;
    return { token: null, user: null };
  }

  authToken = token;

  if (userRaw) {
    try {
      currentUser = JSON.parse(userRaw);
    } catch {
      currentUser = null;
    }
  }

  if (!currentUser) {
    currentUser = userFromToken(token);
    if (currentUser) {
      localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
    }
  }

  if (token) writeSessionCookie(token);

  return { token: authToken, user: currentUser };
}

export async function restoreSessionFromServer() {
  loadStoredSession();
  if (isLoggedIn()) {
    try {
      const res = await fetch("/api/auth/session", {
        credentials: "same-origin",
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token && data.user) {
          persistSession(data.token, data.user);
        }
      }
    } catch {
      /* offline */
    }
    return { token: authToken, user: currentUser };
  }

  try {
    const res = await fetch("/api/auth/session", { credentials: "same-origin" });
    if (!res.ok) return loadStoredSession();
    const data = await res.json();
    if (data.token && data.user) {
      persistSession(data.token, data.user);
      return { token: data.token, user: data.user };
    }
  } catch {
    /* offline or server unavailable */
  }

  return loadStoredSession();
}

export async function authFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function resetPassword({ email, newPassword, confirmPassword, guestState }) {
  const res = await fetch("/api/auth/reset-password", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, newPassword, confirmPassword, guestState }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    err.status = res.status;
    throw err;
  }
  persistSession(data.token, data.user);
  onAuthChange?.({
    user: data.user,
    state: data.state,
    mode: "reset",
    publicLeaderboard: data.publicLeaderboard,
  });
  return data;
}

export async function register({ email, password, displayName, guestState }) {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName, guestState }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    err.status = res.status;
    throw err;
  }
  persistSession(data.token, data.user);
  onAuthChange?.({ user: data.user, state: data.state, mode: "register" });
  return data;
}

export async function login({ email, password, guestState }) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, guestState }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    err.status = res.status;
    throw err;
  }
  persistSession(data.token, data.user);
  onAuthChange?.({
    user: data.user,
    state: data.state,
    mode: "login",
    publicLeaderboard: data.publicLeaderboard,
  });
  return data;
}

export function logout() {
  persistSession(null, null);
  void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
  onAuthChange?.({ user: null, mode: "logout" });
}

export async function fetchCloudState() {
  if (!isLoggedIn()) return { state: null, unauthorized: false };
  try {
    const data = await authFetch("/api/user/state");
    return {
      state: data.state ?? null,
      publicLeaderboard: data.publicLeaderboard,
      unauthorized: false,
    };
  } catch (err) {
    if (err.status === 401) {
      return { state: null, unauthorized: true };
    }
    return { state: null, unauthorized: false };
  }
}

export async function refreshCloudState() {
  const data = await fetchCloudState();
  return data?.state ?? null;
}

export function scheduleCloudSync(state, { publicLeaderboard } = {}) {
  if (!isLoggedIn()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      await pushCloudState(state, { publicLeaderboard });
    } catch {
      /* local copy stays saved; will retry later */
    }
  }, 1500);
}

export async function flushCloudSync(state, { publicLeaderboard } = {}) {
  if (!isLoggedIn()) return null;
  clearTimeout(syncTimer);
  syncTimer = null;
  try {
    return await pushCloudState(state, { publicLeaderboard });
  } catch {
    return null;
  }
}

export async function pushCloudState(state, { publicLeaderboard } = {}) {
  if (!isLoggedIn()) return null;
  return authFetch("/api/user/state", {
    method: "PUT",
    body: JSON.stringify({ state, publicLeaderboard }),
  });
}

export async function fetchLeaderboard() {
  try {
    const res = await fetch("/api/leaderboard");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return [];
    return data.entries || [];
  } catch {
    return [];
  }
}

export async function checkAuthAvailable() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    return data.multiUserEnabled;
  } catch {
    return false;
  }
}

export function authHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
