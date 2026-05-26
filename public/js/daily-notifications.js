/** First-login-of-the-day pop-up notifications */

import { escapeHtml } from "./scout-ui.js";

let queue = Promise.resolve();

function ensureModal() {
  let modal = document.getElementById("dailyNotifyModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "dailyNotifyModal";
  modal.className = "listing-modal daily-notify-modal hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-panel daily-notify-panel">
      <button type="button" class="modal-close" id="dailyNotifyClose" aria-label="Close">×</button>
      <div class="daily-notify-icon" id="dailyNotifyIcon" aria-hidden="true">🪙</div>
      <h2 id="dailyNotifyTitle">Daily update</h2>
      <p id="dailyNotifyBody"></p>
      <button type="button" class="btn-scout full-width" id="dailyNotifyOk">Got it</button>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector(".modal-backdrop")?.addEventListener("click", () => closeDailyNotifyModal());
  modal.querySelector("#dailyNotifyClose")?.addEventListener("click", () => closeDailyNotifyModal());
  modal.querySelector("#dailyNotifyOk")?.addEventListener("click", () => closeDailyNotifyModal());

  return modal;
}

function closeDailyNotifyModal() {
  const modal = document.getElementById("dailyNotifyModal");
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function showOneNotification(event) {
  return new Promise((resolve) => {
    const modal = ensureModal();
    const icon = modal.querySelector("#dailyNotifyIcon");
    const title = modal.querySelector("#dailyNotifyTitle");
    const body = modal.querySelector("#dailyNotifyBody");
    const okBtn = modal.querySelector("#dailyNotifyOk");

    let iconChar = "🪙";
    let titleText = "Daily update";
    let bodyHtml = "";

    switch (event.type) {
      case "coins":
        iconChar = "🪙";
        titleText = "Daily coins";
        bodyHtml = `You received <strong>${event.amount} coins</strong> for logging in today. Scout unique cards or visit the Shop to spend them.`;
        break;
      case "freeze_used":
        iconChar = "🧊";
        titleText = "Streak freeze used";
        bodyHtml = `You missed a day scouting, but a streak freeze kept your <strong>${event.streak} day</strong> streak alive. You have <strong>${event.freezesLeft}</strong> freeze${event.freezesLeft === 1 ? "" : "s"} left.`;
        break;
      case "streak_broken":
        iconChar = "💔";
        titleText = "Streak broken";
        bodyHtml = `You missed scouting and your <strong>${event.previousStreak} day</strong> streak ended. Scout a card today to start building a new streak.`;
        break;
      default:
        bodyHtml = escapeHtml(event.message || "Something happened.");
    }

    if (icon) icon.textContent = iconChar;
    if (title) title.textContent = titleText;
    if (body) body.innerHTML = bodyHtml;

    const done = () => {
      okBtn?.removeEventListener("click", done);
      closeDailyNotifyModal();
      resolve();
    };

    okBtn?.addEventListener("click", done, { once: true });
    document.body.classList.add("modal-open");
    modal.classList.remove("hidden");
  });
}

export function showDailyNotificationQueue(events = []) {
  if (!events.length) return Promise.resolve();

  queue = queue.then(async () => {
    for (const event of events) {
      await showOneNotification(event);
    }
  });

  return queue;
}
