import { authFetch, isLoggedIn } from "./auth.js";

export async function fetchSocialOverview() {
  if (!isLoggedIn()) return { friends: [], requests: { incoming: [], outgoing: [] } };
  return authFetch("/api/social/friends");
}

export async function searchFriendCandidates(query) {
  const q = encodeURIComponent(String(query || "").trim());
  if (!q) return { count: 0, results: [], query: "", ready: false };
  return authFetch(`/api/social/friends/search?q=${q}`);
}

export async function sendFriendRequest({ lookup, targetUserId } = {}) {
  return authFetch("/api/social/friends/request", {
    method: "POST",
    body: JSON.stringify(targetUserId ? { targetUserId } : { lookup }),
  });
}

export async function respondFriendRequest(requestId, action) {
  return authFetch("/api/social/friends/respond", {
    method: "POST",
    body: JSON.stringify({ requestId, action }),
  });
}

export async function unfriend(userId) {
  return authFetch(`/api/social/friends/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

export async function fetchFriendAccount(userId) {
  return authFetch(`/api/social/users/${encodeURIComponent(userId)}`);
}

export async function fetchProfilePosts(userId) {
  const q = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return authFetch(`/api/social/profile-posts${q}`);
}

export async function createProfilePost(body) {
  return authFetch("/api/social/profile-posts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchCodComments() {
  if (isLoggedIn()) {
    return authFetch("/api/card-of-day/comments");
  }
  const res = await fetch("/api/card-of-day/comments");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not load comments");
  return data;
}

export async function oneTimeTestUnbanComments() {
  return authFetch("/api/social/test-unban-comments", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function acceptCodCommentAgreement() {
  return authFetch("/api/card-of-day/comments/agree", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function castCodVote(vote) {
  return authFetch("/api/card-of-day/poll", {
    method: "POST",
    body: JSON.stringify({ vote }),
  });
}

export async function postCodComment(text) {
  return authFetch("/api/card-of-day/comments", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function fetchHubMessages({ audience = "everyone", username = "" } = {}) {
  const params = new URLSearchParams({ audience });
  if (username) params.set("username", username);
  if (isLoggedIn()) {
    return authFetch(`/api/social/hub/messages?${params}`);
  }
  const res = await fetch(`/api/social/hub/messages?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not load chat");
  return data;
}

export async function postHubMessage({ text, audience, targetUsername }) {
  return authFetch("/api/social/hub/messages", {
    method: "POST",
    body: JSON.stringify({ text, audience, targetUsername }),
  });
}
