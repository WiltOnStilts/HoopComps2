import { formatUsd, escapeHtml } from "./scout-ui.js";
import { isLoggedIn, getCurrentUser } from "./auth.js";
import {
  fetchProfilePosts,
  fetchFriendAccount,
  createProfilePost,
  acceptCodCommentAgreement,
  fetchHubMessages,
  postHubMessage,
} from "./social.js";
import { bindGuardedSubmit, createSubmitGuard, dedupeByKey } from "./submit-guard.js";

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
  const postsEl = $("profilePostsList");
  const signedInPanel = $("profileFeedSignedIn");
  const guestPanel = $("profileFeedGuest");

  if (!postsEl) return;

  if (!isLoggedIn()) {
    signedInPanel?.classList.add("hidden");
    guestPanel?.classList.remove("hidden");
    return;
  }

  signedInPanel?.classList.remove("hidden");
  guestPanel?.classList.add("hidden");

  populateRecentCardSelect(state);

  try {
    const postsData = await fetchProfilePosts(getCurrentUser()?.id);

    const posts = dedupePosts(postsData.posts || []);
    postsEl.innerHTML = posts.length
      ? posts.map(renderPostCard).join("")
      : `<div class="social-empty">Share a recent pull or what your latest card is worth.</div>`;
  } catch (err) {
    postsEl.innerHTML = `<div class="social-empty">${escapeHtml(err.message)}</div>`;
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

export async function openFriendModal(userId) {
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
      <p class="social-modal-sub">${escapeHtml(u.email)} · ${u.coins ?? 0} coins</p>
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

let chatAudience = "everyone";
let chatTargetUsername = "";
const profilePostGuard = createSubmitGuard();
const hubMessageGuard = createSubmitGuard();
const chatAgreementGuard = createSubmitGuard();
let socialUiBound = false;

function dedupeMessages(messages) {
  return dedupeByKey(messages, (message) =>
    message.id || `${message.authorName}|${message.text}|${message.createdAt}`
  );
}

function dedupePosts(posts) {
  return dedupeByKey(posts, (post) =>
    post.id || `${post.userId}|${post.authorName}|${post.text}|${post.createdAt}`
  );
}

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
    const messages = dedupeMessages(data.messages || []);
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

export function initSocialUI({ getState, openAuthModal }) {
  if (socialUiBound) return;
  socialUiBound = true;

  bindGuardedSubmit({
    button: $("publishPostBtn"),
    guard: profilePostGuard,
    handler: async () => {
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
    },
  });

  $("friendModalClose")?.addEventListener("click", closeFriendModal);
  $("friendModal")?.querySelector(".modal-backdrop")?.addEventListener("click", closeFriendModal);

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

  bindGuardedSubmit({
    button: $("communityChatAgreementBtn"),
    guard: chatAgreementGuard,
    handler: async () => {
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
    },
  });

  bindGuardedSubmit({
    button: $("communityChatSubmit"),
    guard: hubMessageGuard,
    handler: async () => {
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
    },
  });
}
