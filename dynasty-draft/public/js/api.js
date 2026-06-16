import { authFetch, isLoggedIn } from "./auth.js";

export async function fetchDynastyToday() {
  return authFetch("/api/dynasty/today");
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
  return authFetch(`/api/dynasty/players?${params}`);
}

export async function submitDynastyLineup(lineup) {
  return authFetch("/api/dynasty/submit", {
    method: "POST",
    body: JSON.stringify({ lineup }),
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
