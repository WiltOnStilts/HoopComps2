/** Shop page — streak freezes, avatars, Card of the Day boost */

import { escapeHtml } from "./scout-ui.js";
import {
  STREAK_FREEZE_COST,
  COD_BOOST_COST_PER_PERCENT,
  codBoostCost,
  tomorrowUtcDayKey,
  purchaseStreakFreeze,
  purchaseCodBoost,
  purchaseAvatarPart,
  equipAvatarPart,
  COINS_HELP_TEXT,
} from "./economy.js";
import { AVATAR_CATALOG, renderAvatarInto, disposeAvatar3D } from "./avatars.js";
import { saveState } from "./storage.js";

export function renderShop(state, { onChange } = {}) {
  const root = document.getElementById("shopRoot");
  if (!root) return;

  const owned = state.ownedAvatarParts || {};
  const equipped = state.profile?.avatar || {};
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

    <div class="panel shop-section shop-avatar-hero">
      <h3>Your collector avatar</h3>
      <p class="hint">Drag to spin · Mix face, hair, and gear below</p>
      <div id="shopAvatarPreviewMount" class="avatar-3d-mount avatar-3d-mount--hero"></div>
    </div>

    ${["face", "hair", "clothes"]
      .map((category) => {
        const label = category.charAt(0).toUpperCase() + category.slice(1);
        return `
          <div class="panel shop-section">
            <h3>Avatar · ${label}</h3>
            <div class="shop-avatar-grid">
              ${AVATAR_CATALOG[category]
                .map((item) => {
                  const isOwned = (owned[category] || []).includes(item.id);
                  const isEquipped = equipped[category] === item.id;
                  return `
                    <article class="shop-avatar-item ${isEquipped ? "equipped" : ""}" data-category="${category}" data-id="${item.id}">
                      <div class="shop-avatar-swatch" style="--swatch:${item.tint || "#e85d04"}">${escapeHtml(item.label.slice(0, 1))}</div>
                      <strong>${escapeHtml(item.label)}</strong>
                      <span class="muted-text">${item.price === 0 ? "Free" : `${item.price} coins`}</span>
                      ${
                        isEquipped
                          ? `<span class="shop-tag">Equipped</span>`
                          : isOwned
                            ? `<button type="button" class="btn-secondary btn-xs" data-shop="equip" data-category="${category}" data-id="${item.id}">Equip</button>`
                            : `<button type="button" class="btn-secondary btn-xs" data-shop="buy-avatar" data-category="${category}" data-id="${item.id}" data-price="${item.price}">Buy</button>`
                      }
                    </article>
                  `;
                })
                .join("")}
            </div>
          </div>
        `;
      })
      .join("")}
  `;

  root.querySelectorAll("[data-shop]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.shop;
      let result = { ok: false, error: "Unknown action" };

      if (action === "streak-freeze") {
        result = purchaseStreakFreeze(state);
      } else if (action === "cod-boost") {
        result = purchaseCodBoost(state, Number(btn.dataset.percent));
      } else if (action === "buy-avatar") {
        result = purchaseAvatarPart(
          state,
          btn.dataset.category,
          btn.dataset.id,
          Number(btn.dataset.price)
        );
        if (result.ok) equipAvatarPart(state, btn.dataset.category, btn.dataset.id);
      } else if (action === "equip") {
        result = equipAvatarPart(state, btn.dataset.category, btn.dataset.id);
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

  const preview = document.getElementById("shopAvatarPreviewMount");
  if (preview) {
    renderAvatarInto(preview, state.profile, {
      size: "hero",
      autoRotate: true,
      interactive: true,
    });
  }
}

export function updateProfileAvatarMount(state) {
  const mount = document.getElementById("profileAvatarMount");
  if (!mount) return;
  renderAvatarInto(mount, state.profile, { size: "lg", autoRotate: true, interactive: true });
}

export function disposeShopAvatarPreview() {
  const preview = document.getElementById("shopAvatarPreviewMount");
  if (preview) disposeAvatar3D(preview);
}
