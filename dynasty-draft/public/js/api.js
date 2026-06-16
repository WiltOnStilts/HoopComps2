import { authFetch, isLoggedIn, getChallengeSeed } from "./auth.js";

async function dynastyFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-Dynasty-Seed": getChallengeSeed(),
    ...(options.headers || {}),
  };
  if (isLoggedIn()) return authFetch(path, { ...options, headers });
  const res = await fetch(path, { ...options, headers, credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function fetchDynastyToday() {
  return dynastyFetch("/api/dynasty/today");
}

export async function fetchDynastyMeta() {
  const res = await fetch("/api/dynasty/meta");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load meta");
  return data;
}

export async function fetchDynastyPlayers({ teamId, year, modifierIds, slot = "all", showStats }) {
  const mods = Array.isArray(modifierIds) ? modifierIds.join(",") : modifierIds || "standard";
  const params = new URLSearchParams({
    teamId,
    year: String(year),
    modifierIds: mods,
    slot,
    showStats: showStats ? "true" : "false",
  });
  return dynastyFetch(`/api/dynasty/players?${params}`);
}

export async function submitDynastyLineup(lineup) {
  return dynastyFetch("/api/dynasty/submit", {
    method: "POST",
    body: JSON.stringify({ lineup, challengeSeed: getChallengeSeed() }),
  });
}

export async function updateDynastySettings(settings) {
  return authFetch("/api/dynasty/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function fetchDynastyLeaderboard(dayKey) {
  const q = dayKey ? `?dayKey=${encodeURIComponent(dayKey)}` : "";
  const res = await fetch(`/api/dynasty/leaderboard${q}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Leaderboard failed");
  return data;
}

export async function fetchDynastyProfile(userId) {
  const q = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return authFetch(`/api/dynasty/profile${q}`);
}

export { isLoggedIn };
