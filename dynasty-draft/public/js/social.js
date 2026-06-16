import { authFetch } from "./auth.js";

export async function searchFriendCandidates(query) {
  const q = encodeURIComponent(String(query || "").trim());
  if (!q) return { count: 0, results: [] };
  return authFetch(`/api/social/friends/search?q=${q}`);
}

export async function sendFriendRequest(targetUserId) {
  return authFetch("/api/social/friends/request", {
    method: "POST",
    body: JSON.stringify({ targetUserId }),
  });
}
