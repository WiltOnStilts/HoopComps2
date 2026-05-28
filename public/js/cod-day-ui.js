/** Card of the Day — inline conversation + hold/sell poll */

import { escapeHtml } from "./scout-ui.js";
import { isLoggedIn } from "./auth.js";
import {
  fetchCodComments,
  postCodComment,
  acceptCodCommentAgreement,
  oneTimeTestUnbanComments,
  castCodVote,
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

function renderPollStats(poll) {
  const el = $("cowPollStats");
  if (!el || !poll) return;

  if (!poll.total) {
    el.innerHTML = `<span class="muted-text">No votes yet — be the first to weigh in.</span>`;
    return;
  }

  el.innerHTML = `
    <div class="cow-poll-bar" role="img" aria-label="Hold ${poll.holdPercent}%, Sell ${poll.sellPercent}%">
      <span class="cow-poll-bar-hold" style="width:${poll.holdPercent}%"></span>
      <span class="cow-poll-bar-sell" style="width:${poll.sellPercent}%"></span>
    </div>
    <p class="cow-poll-percentages">
      <strong>Hold ${poll.holdPercent}%</strong>
      <span class="muted-text">(${poll.hold} vote${poll.hold === 1 ? "" : "s"})</span>
      ·
      <strong>Sell ${poll.sellPercent}%</strong>
      <span class="muted-text">(${poll.sell} vote${poll.sell === 1 ? "" : "s"})</span>
    </p>
  `;
}

function syncPollButtons(poll) {
  const holdBtn = $("cowHoldBtn");
  const sellBtn = $("cowSellBtn");
  if (!holdBtn || !sellBtn) return;

  const voted = Boolean(poll?.userVote);
  holdBtn.disabled = voted;
  sellBtn.disabled = voted;
  holdBtn.classList.toggle("active", poll?.userVote === "hold");
  sellBtn.classList.toggle("active", poll?.userVote === "sell");

  if (!isLoggedIn()) {
    holdBtn.disabled = false;
    sellBtn.disabled = false;
  }
}

function renderCodCommentControls(data) {
  const agreement = data?.communityAgreement || {};
  const signInEl = $("cowCommentSignIn");
  const agreementEl = $("cowCommentAgreement");
  const composeEl = $("cowCommentCompose");
  const agreementText = $("cowAgreementText");
  const agreementCheck = $("cowAgreementCheck");
  const agreementSubmit = $("cowAgreementSubmit");
  const banEl = $("cowCommentBan");
  const banTextEl = $("cowCommentBanText");
  const testUnbanBtn = $("cowTestUnbanBtn");

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

export async function renderCodDayEngagement({ openAuthModal } = {}) {
  const list = $("cowCommentsList");
  const summary = $("cowConversationSummary");
  if (!list) return;

  try {
    const data = await fetchCodComments();
    const comments = data.comments || [];
    list.innerHTML = comments.length
      ? comments.map(renderCommentCard).join("")
      : `<div class="social-empty">Be the first to comment on today's card.</div>`;
    list.scrollTop = list.scrollHeight;

    if (summary) {
      summary.textContent =
        comments.length === 1
          ? "Today's conversation (1 comment)"
          : `Today's conversation (${comments.length} comments)`;
    }

    renderCodCommentControls(data);
    renderPollStats(data.poll);
    syncPollButtons(data.poll);
  } catch (err) {
    list.innerHTML = `<div class="social-empty">${escapeHtml(err.message)}</div>`;
    renderCodCommentControls({});
  }

  void openAuthModal;
}

let codDayBound = false;

export function initCodDayUI({ openAuthModal, refreshEngagement }) {
  if (codDayBound) return;
  codDayBound = true;

  $("cowConversation")?.addEventListener("toggle", (event) => {
    if (event.target.open) void refreshEngagement?.();
  });

  $("cowHoldBtn")?.addEventListener("click", () => void submitCodVote("hold", { openAuthModal, refreshEngagement }));
  $("cowSellBtn")?.addEventListener("click", () => void submitCodVote("sell", { openAuthModal, refreshEngagement }));

  $("cowAgreementCheck")?.addEventListener("change", (e) => {
    const btn = $("cowAgreementSubmit");
    if (btn) btn.disabled = !e.target.checked;
  });

  $("cowAgreementSubmit")?.addEventListener("click", async () => {
    if (!isLoggedIn()) {
      openAuthModal?.("login");
      return;
    }
    if (!$("cowAgreementCheck")?.checked) return;
    const btn = $("cowAgreementSubmit");
    btn.disabled = true;
    try {
      await acceptCodCommentAgreement();
      await refreshEngagement?.();
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
    }
  });

  $("cowTestUnbanBtn")?.addEventListener("click", async () => {
    const btn = $("cowTestUnbanBtn");
    if (btn) btn.disabled = true;
    try {
      const result = await oneTimeTestUnbanComments();
      alert(result.message || "Comment ban cleared.");
      await refreshEngagement?.();
    } catch (err) {
      alert(err.message);
      if (btn) btn.disabled = false;
    }
  });

  $("cowCommentSubmit")?.addEventListener("click", async () => {
    if (!isLoggedIn()) {
      openAuthModal?.("login");
      return;
    }
    const input = $("cowCommentInput");
    const text = input?.value?.trim();
    if (!text) return;
    try {
      await postCodComment(text);
      input.value = "";
      await refreshEngagement?.();
    } catch (err) {
      alert(err.message);
      await refreshEngagement?.();
    }
  });
}

async function submitCodVote(vote, { openAuthModal, refreshEngagement }) {
  if (!isLoggedIn()) {
    openAuthModal?.("login");
    return;
  }
  try {
    const result = await castCodVote(vote);
    if (result.alreadyVoted) {
      alert("You already voted on today's card.");
    }
    renderPollStats(result.poll);
    syncPollButtons(result.poll);
    await refreshEngagement?.();
  } catch (err) {
    alert(err.message);
  }
}
