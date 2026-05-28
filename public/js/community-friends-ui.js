/** Community friends — live search and friend requests */

import { formatUsd, escapeHtml } from "./scout-ui.js";
import { isLoggedIn } from "./auth.js";
import {
  fetchSocialOverview,
  searchFriendCandidates,
  sendFriendRequest,
  respondFriendRequest,
  unfriend,
} from "./social.js";

function $(id) {
  return document.getElementById(id);
}

function renderFriendRow(f) {
  return `
    <div class="friend-row">
      <div class="friend-row-main">
        <strong>${escapeHtml(f.displayName)}</strong>
        <span>${f.cardCount} cards · ${f.collectionValue > 0 ? formatUsd(f.collectionValue) : "—"}</span>
      </div>
      <div class="friend-actions">
        <button type="button" class="btn-ghost btn-xs" data-view-friend="${escapeHtml(f.id)}">View</button>
        <button type="button" class="btn-ghost btn-xs danger" data-unfriend="${escapeHtml(f.id)}">Remove</button>
      </div>
    </div>`;
}

function renderIncomingRequest(r) {
  return `
    <div class="request-row">
      <div class="request-row-main">
        <strong>${escapeHtml(r.from.displayName)}</strong>
        <span>Sent you a friend request</span>
      </div>
      <div class="request-actions">
        <button type="button" class="btn-secondary btn-xs" data-accept-request="${escapeHtml(r.id)}">Accept</button>
        <button type="button" class="btn-ghost btn-xs" data-decline-request="${escapeHtml(r.id)}">Decline</button>
      </div>
    </div>`;
}

function renderOutgoingRequest(r) {
  return `
    <div class="request-row">
      <div class="request-row-main">
        <strong>${escapeHtml(r.to.displayName)}</strong>
        <span>Request pending</span>
      </div>
    </div>`;
}

function renderSearchMenu(data) {
  const menu = $("communityFriendSearchMenu");
  const input = $("communityFriendSearch");
  if (!menu || !input) return;

  const query = data?.query || input.value.trim();
  if (!query) {
    menu.classList.add("hidden");
    menu.innerHTML = "";
    input.setAttribute("aria-expanded", "false");
    return;
  }

  const count = data?.count || 0;
  const results = data?.results || [];

  if (!count) {
    menu.innerHTML = `<div class="friend-search-empty">No collectors match "${escapeHtml(query)}"</div>`;
    menu.classList.remove("hidden");
    input.setAttribute("aria-expanded", "true");
    return;
  }

  if (count > 1) {
    menu.innerHTML = `
      <div class="friend-search-summary">
        <strong>${count} collectors match</strong>
        <span>Keep typing to narrow down to one person.</span>
      </div>
      <ul class="friend-search-preview">
        ${results
          .slice(0, 5)
          .map(
            (user) => `
          <li>
            <span>${escapeHtml(user.displayName)}</span>
            ${user.username ? `<span class="muted-text">@${escapeHtml(user.username)}</span>` : ""}
          </li>`
          )
          .join("")}
      </ul>`;
    menu.classList.remove("hidden");
    input.setAttribute("aria-expanded", "true");
    return;
  }

  const user = results[0];
  const subtitle = user.username ? `@${user.username}` : user.hasPhone ? "Phone on file" : "Collector";
  menu.innerHTML = `
    <button type="button" class="friend-search-result${user.pending ? " is-pending" : ""}" data-send-request="${escapeHtml(user.id)}" data-pending="${user.pending ? "1" : "0"}" role="option"${user.pending ? " disabled" : ""}>
      <strong>${escapeHtml(user.displayName)}</strong>
      <span class="muted-text">${escapeHtml(subtitle)}</span>
      <span class="friend-search-action">${user.pending ? "Request pending" : "Send friend request"}</span>
    </button>`;
  menu.classList.remove("hidden");
  input.setAttribute("aria-expanded", "true");
}

let searchTimer = null;
let searchSeq = 0;
let communityFriendsBound = false;

export async function renderCommunityFriends() {
  const guestPanel = $("communityFriendsGuest");
  const signedInPanel = $("communityFriendsSignedIn");
  const friendsEl = $("communityFriendsList");
  const requestsEl = $("communityFriendRequestsList");

  if (!friendsEl || !requestsEl) return;

  if (!isLoggedIn()) {
    guestPanel?.classList.remove("hidden");
    signedInPanel?.classList.add("hidden");
    return;
  }

  guestPanel?.classList.add("hidden");
  signedInPanel?.classList.remove("hidden");

  try {
    const overview = await fetchSocialOverview();
    const friends = overview.friends || [];
    friendsEl.innerHTML = friends.length
      ? friends.map(renderFriendRow).join("")
      : `<div class="social-empty">No friends yet — search above to add someone.</div>`;

    const incoming = overview.requests?.incoming || [];
    const outgoing = overview.requests?.outgoing || [];
    const requestRows = [...incoming.map(renderIncomingRequest), ...outgoing.map(renderOutgoingRequest)];
    requestsEl.innerHTML = requestRows.length
      ? requestRows.join("")
      : `<div class="social-empty">No pending friend requests.</div>`;
  } catch (err) {
    friendsEl.innerHTML = `<div class="social-empty">${escapeHtml(err.message)}</div>`;
    requestsEl.innerHTML = "";
  }
}

async function runFriendSearch(query) {
  const seq = ++searchSeq;
  try {
    const data = await searchFriendCandidates(query);
    if (seq !== searchSeq) return;
    renderSearchMenu(data);
  } catch (err) {
    if (seq !== searchSeq) return;
    const menu = $("communityFriendSearchMenu");
    if (menu) {
      menu.innerHTML = `<div class="friend-search-empty">${escapeHtml(err.message)}</div>`;
      menu.classList.remove("hidden");
    }
  }
}

export function initCommunityFriendsUI({ openFriendModal, openAuthModal, refreshFriends }) {
  if (communityFriendsBound) return;
  communityFriendsBound = true;

  const input = $("communityFriendSearch");
  input?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const query = input.value.trim();
    if (!query) {
      searchSeq += 1;
      renderSearchMenu(null);
      return;
    }
    searchTimer = setTimeout(() => runFriendSearch(query), 220);
  });

  input?.addEventListener("focus", () => {
    const query = input.value.trim();
    if (query) void runFriendSearch(query);
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest(".friend-search-wrap")) return;
    renderSearchMenu(null);
    $("communityFriendSearch")?.setAttribute("aria-expanded", "false");
  });

  $("communityFriendSearchMenu")?.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-send-request]");
    if (!btn || btn.dataset.pending === "1") return;
    if (!isLoggedIn()) {
      openAuthModal?.("login");
      return;
    }
    const targetUserId = btn.dataset.sendRequest;
    try {
      await sendFriendRequest({ targetUserId });
      $("communityFriendSearch").value = "";
      renderSearchMenu(null);
      await refreshFriends?.();
    } catch (err) {
      alert(err.message);
    }
  });

  $("communityFriendsList")?.addEventListener("click", async (event) => {
    const viewId = event.target.closest("[data-view-friend]")?.dataset.viewFriend;
    const unfriendId = event.target.closest("[data-unfriend]")?.dataset.unfriend;
    if (viewId) {
      openFriendModal?.(viewId);
      return;
    }
    if (unfriendId && confirm("Remove this friend?")) {
      try {
        await unfriend(unfriendId);
        await refreshFriends?.();
      } catch (err) {
        alert(err.message);
      }
    }
  });

  $("communityFriendRequestsList")?.addEventListener("click", async (event) => {
    const acceptId = event.target.closest("[data-accept-request]")?.dataset.acceptRequest;
    const declineId = event.target.closest("[data-decline-request]")?.dataset.declineRequest;
    if (!acceptId && !declineId) return;
    try {
      await respondFriendRequest(acceptId || declineId, acceptId ? "accept" : "decline");
      await refreshFriends?.();
    } catch (err) {
      alert(err.message);
    }
  });
}
