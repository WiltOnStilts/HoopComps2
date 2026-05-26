import { formatUsd, escapeHtml } from "./scout-ui.js";
import { isLoggedIn, getCurrentUser } from "./auth.js";
import {
  fetchSocialOverview,
  sendFriendRequest,
  respondFriendRequest,
  unfriend,
  fetchFriendAccount,
  fetchProfilePosts,
  createProfilePost,
  fetchCodComments,
  postCodComment,
  acceptCodCommentAgreement,
  oneTimeTestUnbanComments,
  fetchHubMessages,
  postHubMessage,
} from "./social.js";

function $(id) {
  return document.getElementById(id);
}

function formatWhen(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function renderPostCard(post) {
  const cardLine =
    post.cardTitle || post.estimatedValue != null
      ? `<div class="post-card-meta">🃏 ${escapeHtml(post.cardTitle || "Card")}${
          post.estimatedValue != null ? ` · ${formatUsd(post.estimatedValue)}` : ""
        }</div>`
      : "";
  return `
    <article class="post-card">
      <div class="post-card-header">
        <strong>${escapeHtml(post.authorName || "Scout")}</strong>
        <time>${escapeHtml(formatWhen(post.createdAt))}</time>
      </div>
      <p>${escapeHtml(post.text)}</p>
      ${cardLine}
    </article>
  `;
}

function renderCommentCard(comment) {
  return `
    <article class="comment-card">
      <div class="comment-card-header">
        <strong>${escapeHtml(comment.authorName || "Scout")}</strong>
        <time>${escapeHtml(formatWhen(comment.createdAt))}</time>
      </div>
      <p>${escapeHtml(comment.text)}</p>
    </article>
  `;
}

export async function renderProfileSocial(state) {
  const friendsEl = $("friendsList");
  const requestsEl = $("friendRequestsList");
  const postsEl = $("profilePostsList");
  const signedInPanel = $("profileSocialSignedIn");
  const guestPanel = $("profileSocialGuest");

  if (!friendsEl) return;

  if (!isLoggedIn()) {
    signedInPanel?.classList.add("hidden");
    guestPanel?.classList.remove("hidden");
    return;
  }

  signedInPanel?.classList.remove("hidden");
  guestPanel?.classList.add("hidden");

  populateRecentCardSelect(state);

  try {
    const [overview, postsData] = await Promise.all([
      fetchSocialOverview(),
      fetchProfilePosts(getCurrentUser()?.id),
    ]);

    const friends = overview.friends || [];
    friendsEl.innerHTML = friends.length
      ? friends
          .map(
            (f) => `
        <div class="friend-row">
          <div class="friend-row-main">
            <strong>${escapeHtml(f.displayName)}</strong>
            <span>${f.cardCount} cards · ${f.collectionValue > 0 ? formatUsd(f.collectionValue) : "—"}</span>
          </div>
          <div class="friend-actions">
            <button type="button" class="btn-ghost btn-xs" data-view-friend="${escapeHtml(f.id)}">View</button>
            <button type="button" class="btn-ghost btn-xs danger" data-unfriend="${escapeHtml(f.id)}">Remove</button>
          </div>
        </div>`
          )
          .join("")
      : `<div class="social-empty">No friends yet — add someone by their username or phone number.</div>`;

    const incoming = overview.requests?.incoming || [];
    const outgoing = overview.requests?.outgoing || [];
    const requestRows = [
      ...incoming.map(
        (r) => `
      <div class="request-row">
        <div class="request-row-main">
          <strong>${escapeHtml(r.from.displayName)}</strong>
          <span>Wants to be friends</span>
        </div>
        <div class="request-actions">
          <button type="button" class="btn-secondary btn-xs" data-accept-request="${escapeHtml(r.id)}">Accept</button>
          <button type="button" class="btn-ghost btn-xs" data-decline-request="${escapeHtml(r.id)}">Decline</button>
        </div>
      </div>`
      ),
      ...outgoing.map(
        (r) => `
      <div class="request-row">
        <div class="request-row-main">
          <strong>${escapeHtml(r.to.displayName)}</strong>
          <span>Request pending</span>
        </div>
      </div>`
      ),
    ];
    requestsEl.innerHTML = requestRows.length
      ? requestRows.join("")
      : `<div class="social-empty">No pending friend requests.</div>`;

    const posts = postsData.posts || [];
    postsEl.innerHTML = posts.length
      ? posts.map(renderPostCard).join("")
      : `<div class="social-empty">Share a recent pull or what your latest card is worth.</div>`;
  } catch (err) {
    friendsEl.innerHTML = `<div class="social-empty">${escapeHtml(err.message)}</div>`;
  }
}

function populateRecentCardSelect(state) {
  const sel = $("postRecentCard");
  if (!sel) return;
  const coll = (state?.collection || []).slice(0, 12);
  sel.innerHTML =
    `<option value="">Link a recent collection card (optional)</option>` +
    coll
      .map(
        (item) =>
          `<option value="${escapeHtml(item.id)}">${escapeHtml(item.card?.title || "Card")}${
            item.estimatedValue != null ? ` — ${formatUsd(item.estimatedValue)}` : ""
          }</option>`
      )
      .join("");
}

async function openFriendModal(userId) {
  const modal = $("friendModal");
  const body = $("friendModalBody");
  if (!modal || !body) return;
  body.innerHTML = `<p class="muted-text">Loading collector…</p>`;
  modal.classList.remove("hidden");

  try {
    const data = await fetchFriendAccount(userId);
    const u = data.user;
    const coll = data.collection || [];
    body.innerHTML = `
      <h2 id="friendModalTitle">${escapeHtml(u.displayName)}</h2>
      <p class="social-modal-sub">${escapeHtml(u.email)} · Level ${u.level}</p>
      <div class="friend-modal-stats">
        <div><span>${u.cardCount}</span> cards</div>
        <div><span>${u.collectionValue > 0 ? formatUsd(u.collectionValue) : "—"}</span> collection</div>
        <div><span>${data.stats?.scoutCount ?? 0}</span> scouts</div>
      </div>
      <p class="section-label">Collection</p>
      <div class="friend-collection-list">
        ${
          coll.length
            ? coll
                .map(
                  (item) => `
            <div class="friend-collection-item">
              <strong>${escapeHtml(item.card?.title || "Card")}</strong>
              <span>${item.estimatedValue != null ? formatUsd(item.estimatedValue) : "No estimate"} · ${escapeHtml(formatWhen(item.addedAt))}</span>
            </div>`
                )
                .join("")
            : `<div class="social-empty">No cards in their collection yet.</div>`
        }
      </div>
      <p class="section-label">Recent posts</p>
      <div class="post-list">
        ${
          (data.posts || []).length
            ? data.posts.map(renderPostCard).join("")
            : `<div class="social-empty">No posts yet.</div>`
        }
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<p class="auth-error">${escapeHtml(err.message)}</p>`;
  }
}

function closeFriendModal() {
  $("friendModal")?.classList.add("hidden");
}

function renderCodCommentControls(data) {
  const agreement = data?.communityAgreement || {};
  const signInEl = $("codCommentSignIn");
  const agreementEl = $("codCommentAgreement");
  const composeEl = $("codCommentCompose");
  const agreementText = $("codAgreementText");
  const agreementCheck = $("codAgreementCheck");
  const agreementSubmit = $("codAgreementSubmit");
  const banEl = $("codCommentBan");
  const banTextEl = $("codCommentBanText");
  const testUnbanBtn = $("codTestUnbanBtn");

  signInEl?.classList.add("hidden");
  agreementEl?.classList.add("hidden");
  composeEl?.classList.add("hidden");
  banEl?.classList.add("hidden");
  testUnbanBtn?.classList.add("hidden");

  if (agreement.commentBan) {
    if (banTextEl) {
      banTextEl.textContent = `You cannot comment until ${formatBanWhen(agreement.commentBan.until)} due to a community guidelines violation.`;
    }
    banEl?.classList.remove("hidden");
    if (testUnbanBtn && agreement.testUnbanAvailable) {
      testUnbanBtn.classList.remove("hidden");
    }
    return;
  }

  if (!agreement.signedIn) {
    signInEl?.classList.remove("hidden");
    return;
  }

  if (agreementText && agreement.text) {
    agreementText.textContent = agreement.text;
  }

  if (agreement.canComment) {
    composeEl?.classList.remove("hidden");
    return;
  }

  agreementEl?.classList.remove("hidden");
  if (agreementCheck) agreementCheck.checked = false;
  if (agreementSubmit) agreementSubmit.disabled = true;
}

function formatBanWhen(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export async function openCodCommentsModal(cardTitle) {
  const modal = $("codCommentsModal");
  const list = $("codCommentsList");
  if (!modal || !list) return;
  modal.classList.remove("hidden");
  $("codCommentsTitle").textContent = cardTitle
    ? `Talk: ${cardTitle}`
    : "Card of the Day conversation";
  list.innerHTML = `<p class="muted-text">Loading today's conversation…</p>`;

  try {
    const data = await fetchCodComments();
    const comments = data.comments || [];
    list.innerHTML = comments.length
      ? comments.map(renderCommentCard).join("")
      : `<div class="social-empty">Be the first to comment on today's card.</div>`;
    list.scrollTop = list.scrollHeight;
    renderCodCommentControls(data);
  } catch (err) {
    list.innerHTML = `<div class="social-empty">${escapeHtml(err.message)}</div>`;
    renderCodCommentControls({});
  }
}

function closeCodCommentsModal() {
  $("codCommentsModal")?.classList.add("hidden");
}

let chatAudience = "everyone";
let chatTargetUsername = "";

function chatAudienceLabel(audience, targetUser) {
  if (audience === "everyone") return "Talking to: everyone";
  if (audience === "friends") return "Talking to: friends only";
  if (audience === "user") {
    if (targetUser?.displayName) return `Talking to: ${targetUser.displayName}`;
    if (chatTargetUsername) return `Talking to: @${chatTargetUsername}`;
    return "Enter a username above";
  }
  return "";
}

function renderHubChatControls(data) {
  const signInEl = $("communityChatSignIn");
  const agreementEl = $("communityChatAgreement");
  const composeEl = $("communityChatCompose");
  const banEl = $("communityChatBan");
  const agreementText = $("communityChatAgreementText");
  const agreementCheck = $("communityChatAgreementCheck");
  const agreementBtn = $("communityChatAgreementBtn");

  signInEl?.classList.add("hidden");
  agreementEl?.classList.add("hidden");
  composeEl?.classList.add("hidden");
  banEl?.classList.add("hidden");

  if (data.needsTarget && chatAudience === "user") {
    return;
  }

  if (data.commentBan) {
    if ($("communityChatBanText")) {
      $("communityChatBanText").textContent = `You cannot chat until ${formatBanWhen(data.commentBan.until)} due to a community guidelines violation.`;
    }
    banEl?.classList.remove("hidden");
    return;
  }

  if (!data.signedIn) {
    signInEl?.classList.remove("hidden");
    return;
  }

  if (agreementText && data.agreementText) {
    agreementText.textContent = data.agreementText;
  }

  if (data.canPost) {
    composeEl?.classList.remove("hidden");
    return;
  }

  agreementEl?.classList.remove("hidden");
  if (agreementCheck) agreementCheck.checked = false;
  if (agreementBtn) agreementBtn.disabled = true;
}

export async function renderCommunityChat() {
  const list = $("communityChatList");
  const label = $("chatAudienceLabel");
  if (!list) return;

  const audience = chatAudience === "user" ? "direct" : chatAudience;
  list.innerHTML = `<p class="muted-text">Loading chat…</p>`;

  try {
    const data = await fetchHubMessages({
      audience,
      username: chatAudience === "user" ? chatTargetUsername : "",
    });
    const messages = data.messages || [];
    list.innerHTML = messages.length
      ? messages.map(renderCommentCard).join("")
      : `<div class="social-empty">${chatAudience === "user" && !chatTargetUsername ? "Enter a username to start chatting." : "No messages yet — say hi!"}</div>`;
    list.scrollTop = list.scrollHeight;
    if (label) label.textContent = chatAudienceLabel(chatAudience, data.targetUser);
    renderHubChatControls(data);
  } catch (err) {
    list.innerHTML = `<div class="social-empty">${escapeHtml(err.message)}</div>`;
    renderHubChatControls({ signedIn: isLoggedIn() });
  }
}

function setChatAudience(next) {
  chatAudience = next;
  document.querySelectorAll(".chat-audience-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.chatAudience === next);
  });
  $("chatUserTargetRow")?.classList.toggle("hidden", next !== "user");
  void renderCommunityChat();
}

export function initSocialUI({ onNavigate, getState, openAuthModal }) {
  $("addFriendBtn")?.addEventListener("click", async () => {
    if (!isLoggedIn()) {
      openAuthModal("login");
      return;
    }
    const lookup = $("friendLookupInput")?.value?.trim();
    if (!lookup) return;
    try {
      await sendFriendRequest(lookup);
      $("friendLookupInput").value = "";
      await renderProfileSocial(getState());
    } catch (err) {
      alert(err.message);
    }
  });

  $("friendsList")?.addEventListener("click", async (e) => {
    const viewId = e.target.closest("[data-view-friend]")?.dataset.viewFriend;
    const unfriendId = e.target.closest("[data-unfriend]")?.dataset.unfriend;
    if (viewId) {
      openFriendModal(viewId);
      return;
    }
    if (unfriendId && confirm("Remove this friend?")) {
      try {
        await unfriend(unfriendId);
        await renderProfileSocial(getState());
      } catch (err) {
        alert(err.message);
      }
    }
  });

  $("friendRequestsList")?.addEventListener("click", async (e) => {
    const acceptId = e.target.closest("[data-accept-request]")?.dataset.acceptRequest;
    const declineId = e.target.closest("[data-decline-request]")?.dataset.declineRequest;
    if (!acceptId && !declineId) return;
    try {
      await respondFriendRequest(acceptId || declineId, acceptId ? "accept" : "decline");
      await renderProfileSocial(getState());
    } catch (err) {
      alert(err.message);
    }
  });

  $("publishPostBtn")?.addEventListener("click", async () => {
    if (!isLoggedIn()) {
      openAuthModal("login");
      return;
    }
    const text = $("profilePostText")?.value?.trim();
    const collectionEntryId = $("postRecentCard")?.value || null;
    const cardTitle = $("postCardTitle")?.value?.trim() || null;
    const valRaw = $("postCardValue")?.value;
    const estimatedValue = valRaw !== "" && valRaw != null ? Number(valRaw) : null;

    try {
      await createProfilePost({
        text,
        cardTitle,
        estimatedValue: Number.isFinite(estimatedValue) ? estimatedValue : null,
        collectionEntryId,
      });
      $("profilePostText").value = "";
      $("postCardTitle").value = "";
      $("postCardValue").value = "";
      if ($("postRecentCard")) $("postRecentCard").value = "";
      await renderProfileSocial(getState());
    } catch (err) {
      alert(err.message);
      await renderProfileSocial(getState());
    }
  });

  $("cowCommentBtn")?.addEventListener("click", () => {
    const title = $("cowTitle")?.textContent || "";
    openCodCommentsModal(title !== "Loading spotlight…" ? title : "");
  });

  $("codAgreementCheck")?.addEventListener("change", (e) => {
    const btn = $("codAgreementSubmit");
    if (btn) btn.disabled = !e.target.checked;
  });

  $("codAgreementSubmit")?.addEventListener("click", async () => {
    if (!isLoggedIn()) {
      openAuthModal("login");
      return;
    }
    if (!$("codAgreementCheck")?.checked) return;
    const btn = $("codAgreementSubmit");
    btn.disabled = true;
    try {
      await acceptCodCommentAgreement();
      await openCodCommentsModal($("codCommentsTitle")?.textContent?.replace(/^Talk: /, "") || "");
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
    }
  });

  $("codTestUnbanBtn")?.addEventListener("click", async () => {
    const btn = $("codTestUnbanBtn");
    if (btn) btn.disabled = true;
    try {
      const result = await oneTimeTestUnbanComments();
      alert(result.message || "Comment ban cleared.");
      await openCodCommentsModal($("codCommentsTitle")?.textContent?.replace(/^Talk: /, "") || "");
    } catch (err) {
      alert(err.message);
      if (btn) btn.disabled = false;
    }
  });

  $("codCommentSubmit")?.addEventListener("click", async () => {
    if (!isLoggedIn()) {
      openAuthModal("login");
      return;
    }
    const input = $("codCommentInput");
    const text = input?.value?.trim();
    if (!text) return;
    try {
      await postCodComment(text);
      input.value = "";
      await openCodCommentsModal($("codCommentsTitle")?.textContent?.replace(/^Talk: /, "") || "");
    } catch (err) {
      alert(err.message);
      await openCodCommentsModal($("codCommentsTitle")?.textContent?.replace(/^Talk: /, "") || "");
    }
  });

  $("friendModalClose")?.addEventListener("click", closeFriendModal);
  $("friendModal")?.querySelector(".modal-backdrop")?.addEventListener("click", closeFriendModal);
  $("codCommentsClose")?.addEventListener("click", closeCodCommentsModal);
  $("codCommentsModal")?.querySelector(".modal-backdrop")?.addEventListener("click", closeCodCommentsModal);

  document.querySelectorAll(".chat-audience-tab").forEach((tab) => {
    tab.addEventListener("click", () => setChatAudience(tab.dataset.chatAudience));
  });

  $("chatLoadUserBtn")?.addEventListener("click", () => {
    chatTargetUsername = $("chatTargetUsername")?.value?.trim() || "";
    void renderCommunityChat();
  });

  $("chatTargetUsername")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      chatTargetUsername = e.target.value?.trim() || "";
      void renderCommunityChat();
    }
  });

  $("communityChatAgreementCheck")?.addEventListener("change", (e) => {
    const btn = $("communityChatAgreementBtn");
    if (btn) btn.disabled = !e.target.checked;
  });

  $("communityChatAgreementBtn")?.addEventListener("click", async () => {
    if (!isLoggedIn()) {
      openAuthModal("login");
      return;
    }
    if (!$("communityChatAgreementCheck")?.checked) return;
    try {
      await acceptCodCommentAgreement();
      await renderCommunityChat();
    } catch (err) {
      alert(err.message);
    }
  });

  $("communityChatSubmit")?.addEventListener("click", async () => {
    if (!isLoggedIn()) {
      openAuthModal("login");
      return;
    }
    const input = $("communityChatInput");
    const text = input?.value?.trim();
    if (!text) return;
    const audience = chatAudience === "user" ? "direct" : chatAudience;
    if (audience === "direct" && !chatTargetUsername) {
      alert("Enter a username first");
      return;
    }
    try {
      await postHubMessage({
        text,
        audience,
        targetUsername: chatTargetUsername,
      });
      input.value = "";
      await renderCommunityChat();
    } catch (err) {
      alert(err.message);
      await renderCommunityChat();
    }
  });
}
