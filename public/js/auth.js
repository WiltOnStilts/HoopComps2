const TOKEN_KEY = "hoopcomps_token";
const USER_KEY = "hoopcomps_user";

let currentUser = null;
let authToken = null;
let syncTimer = null;
let onAuthChange = null;

export function setAuthChangeHandler(fn) {
  onAuthChange = fn;
}

export function getAuthToken() {
  return authToken || localStorage.getItem(TOKEN_KEY);
}

export function getCurrentUser() {
  return currentUser;
}

export function isLoggedIn() {
  return Boolean(getAuthToken());
}

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
}

export function loadStoredSession() {
  let token = localStorage.getItem(TOKEN_KEY) || localStorage.getItem("compscourt_token");
  let userRaw = localStorage.getItem(USER_KEY) || localStorage.getItem("compscourt_user");
  if (token && userRaw) {
    authToken = token;
    if (token !== localStorage.getItem(TOKEN_KEY)) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, userRaw);
    }
    try {
      currentUser = JSON.parse(userRaw);
    } catch {
      currentUser = null;
    }
  }
  return { token: authToken, user: currentUser };
}

export async function authFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export async function register({ email, password, displayName, guestState }) {
  const data = await authFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName, guestState }),
  });
  persistSession(data.token, data.user);
  onAuthChange?.({ user: data.user, state: data.state, mode: "register" });
  return data;
}

export async function login({ email, password, guestState }) {
  const data = await authFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, guestState }),
  });
  persistSession(data.token, data.user);
  onAuthChange?.({ user: data.user, state: data.state, mode: "login", publicLeaderboard: data.publicLeaderboard });
  return data;
}

export function logout() {
  persistSession(null, null);
  onAuthChange?.({ user: null, mode: "logout" });
}

export async function fetchCloudState() {
  if (!isLoggedIn()) return null;
  try {
    return await authFetch("/api/user/state");
  } catch {
    logout();
    return null;
  }
}

export function scheduleCloudSync(state, { publicLeaderboard } = {}) {
  if (!isLoggedIn()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      await authFetch("/api/user/state", {
        method: "PUT",
        body: JSON.stringify({ state, publicLeaderboard }),
      });
    } catch {
      /* silent — will retry on next save */
    }
  }, 800);
}

export async function fetchLeaderboard() {
  try {
    const data = await authFetch("/api/leaderboard");
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
