/** Shop page — streak freezes, Card of the Day boost, avatar studio entry */

import { escapeHtml } from "./scout-ui.js";
import {
  STREAK_FREEZE_COST,
  COD_BOOST_COST_PER_PERCENT,
  codBoostCost,
  tomorrowUtcDayKey,
  purchaseStreakFreeze,
  purchaseCodBoost,
  COINS_HELP_TEXT,
} from "./economy.js";
import { disposeAvatar3D, renderAvatarInto } from "./avatars.js";
import { saveState } from "./storage.js";

export function renderShop(state, { onChange, onNavigate } = {}) {
  const root = document.getElementById("shopRoot");
  if (!root) return;

  disposeShopAvatarPreview();

  const tomorrow = tomorrowUtcDayKey();
  const activeBoost =
    state.codBoost?.dayKey === tomorrow ? state.codBoost.percent : 0;

  root.innerHTML = `
    <div class="shop-balance panel">
      <div>
        <p class="hero-label">Your balance</p>
        <h2 class="hero-value shop-coins-value">${state.coins ?? 0} 🪙</h2>
      </div>
      <div class="shop-balance-meta">
        <span>${state.streakFreezes ?? 0} streak freeze${(state.streakFreezes ?? 0) === 1 ? "" : "s"}</span>
        ${
          activeBoost
            ? `<span>+${activeBoost}% COD boost tomorrow</span>`
            : `<span>No COD boost queued</span>`
        }
      </div>
    </div>

    <div class="panel shop-section">
      <h3>What are coins?</h3>
      <p class="hint shop-coins-desc">${escapeHtml(COINS_HELP_TEXT)}</p>
    </div>

    <div class="panel shop-section shop-avatar-entry">
      <h3>Avatar studio</h3>
      <p class="hint">Customize face, eye color, career costume, and more — preview before you buy.</p>
      <button type="button" class="btn-primary" data-goto="avatar">Customize avatar</button>
    </div>

    <div class="panel shop-section">
      <h3>Streak freeze</h3>
      <p class="hint">Miss a day scouting? A freeze keeps your streak alive (one freeze covers one missed day).</p>
      <div class="shop-item-row">
        <div>
          <strong>🧊 Streak freeze</strong>
          <p class="muted-text">${STREAK_FREEZE_COST} coins · You have ${state.streakFreezes ?? 0}</p>
        </div>
        <button type="button" class="btn-secondary btn-sm" data-shop="streak-freeze">Buy</button>
      </div>
    </div>

    <div class="panel shop-section">
      <h3>Card of the Day boost</h3>
      <p class="hint">Increases your weighted chance to be tomorrow's featured collector. Fair for everyone — higher boost = higher weight, not a guarantee.</p>
      <div class="shop-boost-grid">
        ${[10, 20, 30]
          .map((pct) => {
            const cost = codBoostCost(pct);
            return `
              <div class="shop-boost-card">
                <strong>+${pct}%</strong>
                <span class="muted-text">${cost} coins</span>
                <button type="button" class="btn-secondary btn-sm" data-shop="cod-boost" data-percent="${pct}">Buy for tomorrow</button>
              </div>
            `;
          })
          .join("")}
      </div>
      <p class="hint shop-boost-note">Cost scales at ${COD_BOOST_COST_PER_PERCENT} coins per 1% (+10% = 1,000 · +20% = 2,000).</p>
    </div>
  `;

  root.querySelectorAll("[data-shop]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.shop;
      let result = { ok: false, error: "Unknown action" };

      if (action === "streak-freeze") {
        result = purchaseStreakFreeze(state);
      } else if (action === "cod-boost") {
        result = purchaseCodBoost(state, Number(btn.dataset.percent));
      }

      if (!result.ok) {
        alert(result.error || "Purchase failed");
        return;
      }

      saveState(state);
      onChange?.(state);
      renderShop(state, { onChange });
    });
  });

  root.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      onNavigate?.(btn.dataset.goto);
    });
  });
}

export function updateProfileAvatarMount(state) {
  const mount = document.getElementById("profileAvatarMount");
  if (!mount) return;
  const profileView = document.querySelector('[data-view="profile"]');
  if (profileView && !profileView.classList.contains("active")) return;
  renderAvatarInto(mount, state.profile, { size: "lg", autoRotate: true, interactive: true });
}

export function disposeShopAvatarPreview() {
  const preview = document.getElementById("shopAvatarPreviewMount");
  if (preview) disposeAvatar3D(preview);
}
