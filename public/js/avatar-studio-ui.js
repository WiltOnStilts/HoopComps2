/** Avatar studio — hero preview, category dropdowns, buy / preview flow */

import { escapeHtml } from "./scout-ui.js";
import {
  purchaseAvatarPart,
  equipAvatarPart,
  unequipAvatarPart,
} from "./economy.js";
import {
  AVATAR_CATALOG,
  AVATAR_STUDIO_CATEGORIES,
  isFreeAvatarCategory,
  previewAvatarProfile,
  renderAvatarInto,
  refreshAvatar3D,
  renderAvatarThumbnailInto,
  disposeAvatar3D,
  disposeAvatarThumbnailRenderer,
} from "./avatars.js";
import { saveState } from "./storage.js";

let studioPreview = null;
let activeCategory = "mouth";
let pendingConfirm = null;

function isMobileStudio() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function shouldMountHero() {
  return !isMobileStudio() || Boolean(studioPreview);
}

function heroProfile(state) {
  if (studioPreview) {
    return previewAvatarProfile(state.profile, studioPreview.category, studioPreview.id);
  }
  return state.profile;
}

function isPreviewing(state) {
  if (!studioPreview) return false;
  const equipped = state.profile?.avatar?.[studioPreview.category];
  return equipped !== studioPreview.id;
}

function renderStudioItem({ category, item, state }) {
  const owned = state.ownedAvatarParts || {};
  const equipped = state.profile?.avatar || {};
  const freeCategory = isFreeAvatarCategory(category);
  const isOwned = freeCategory || (owned[category] || []).includes(item.id);
  const isEquipped = equipped[category] === item.id;
  const isPreviewingItem =
    studioPreview?.category === category && studioPreview?.id === item.id;
  const isPendingPurchase =
    pendingConfirm?.kind === "purchase" &&
    pendingConfirm.category === category &&
    pendingConfirm.id === item.id;
  const isPendingUnequip =
    pendingConfirm?.kind === "unequip" &&
    pendingConfirm.category === category &&
    pendingConfirm.id === item.id;

  let primaryLabel = "Buy and equip";
  let primaryAction = "equip";
  if (isEquipped) {
    primaryLabel = "Unequip";
    primaryAction = "unequip-request";
  } else if (!isOwned) {
    primaryAction = item.price === 0 ? "equip" : "buy-request";
  }

  const previewHtml = item.hex
    ? `<div class="avatar-studio-swatch" style="background:${escapeHtml(item.hex)}" aria-hidden="true"></div>`
    : `<div class="avatar-studio-item-preview" data-category="${category}" data-id="${item.id}" aria-hidden="true"></div>`;

  const priceLabel = freeCategory || item.price === 0 ? "Free" : `${item.price} coins`;

  return `
    <article class="avatar-studio-item ${isEquipped ? "equipped" : ""} ${isPreviewingItem ? "previewing" : ""}" data-category="${category}" data-id="${item.id}">
      ${previewHtml}
      <div class="avatar-studio-item-info">
        <strong>${escapeHtml(item.label)}</strong>
        <span class="muted-text">${priceLabel}</span>
        ${isEquipped ? `<span class="shop-tag">Equipped</span>` : ""}
      </div>
      <div class="avatar-studio-item-actions">
        ${
          !isPendingPurchase && !isPendingUnequip
            ? `<button type="button" class="avatar-studio-action-btn avatar-studio-action-btn--buy" data-studio="${primaryAction}" data-category="${category}" data-id="${item.id}" data-price="${item.price ?? 0}">${primaryLabel}</button>`
            : ""
        }
        <button type="button" class="avatar-studio-action-btn avatar-studio-action-btn--preview" data-studio="preview" data-category="${category}" data-id="${item.id}">Preview first</button>
      </div>
      ${
        isPendingPurchase
          ? `
        <div class="avatar-studio-confirm">
          <button type="button" class="avatar-studio-action-btn avatar-studio-action-btn--buy" data-studio="confirm-purchase" data-category="${category}" data-id="${item.id}" data-price="${item.price ?? 0}">Confirm purchase (${item.price} coins)</button>
          <button type="button" class="avatar-studio-action-btn avatar-studio-action-btn--preview" data-studio="cancel">Cancel</button>
        </div>
      `
          : ""
      }
      ${
        isPendingUnequip
          ? `
        <div class="avatar-studio-confirm">
          <button type="button" class="avatar-studio-action-btn avatar-studio-action-btn--buy" data-studio="confirm-unequip" data-category="${category}" data-id="${item.id}">Confirm unequip</button>
          <button type="button" class="avatar-studio-action-btn avatar-studio-action-btn--preview" data-studio="cancel">Cancel</button>
        </div>
      `
          : ""
      }
    </article>
  `;
}

function mountCategoryThumbnails(root, profile, category) {
  const els = [...root.querySelectorAll(`.avatar-studio-item-preview[data-category="${category}"]`)];
  void (async () => {
    for (const el of els) {
      if (!el.isConnected) return;
      const cat = el.dataset.category;
      const id = el.dataset.id;
      if (!cat || !id) continue;
      await renderAvatarThumbnailInto(el, previewAvatarProfile(profile, cat, id), { size: "thumb" });
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  })();
}

function refreshHero(state, remount = false) {
  const mount = document.getElementById("avatarStudioHeroMount");
  if (!mount) return;
  const profile = heroProfile(state);
  if (remount || !mount.querySelector("canvas")) {
    disposeAvatar3D(mount);
    renderAvatarInto(mount, profile, { size: "hero", autoRotate: true, interactive: true });
  } else {
    refreshAvatar3D(mount, profile, { size: "hero", autoRotate: true, interactive: true });
  }
}

export function renderAvatarStudio(state, { onChange } = {}) {
  const root = document.getElementById("avatarStudioRoot");
  if (!root) return;

  disposeAvatarThumbnailRenderer();

  const categoryMeta = AVATAR_STUDIO_CATEGORIES.find((c) => c.key === activeCategory) || AVATAR_STUDIO_CATEGORIES[0];
  const items = AVATAR_CATALOG[categoryMeta.key] || [];

  const categoryButtons = AVATAR_STUDIO_CATEGORIES.map((cat) => {
    return `
      <button
        type="button"
        class="avatar-cat-btn ${cat.key === activeCategory ? "active" : ""}"
        data-studio="category"
        data-category="${cat.key}"
        aria-expanded="${cat.key === activeCategory ? "true" : "false"}"
      >
        <span class="avatar-cat-label">${escapeHtml(cat.label)}</span>
      </button>
    `;
  }).join("");

  root.innerHTML = `
    <div class="avatar-studio-main ${studioPreview ? "avatar-studio-main--preview-active" : ""}">
      <div class="avatar-studio-controls">
        <div class="avatar-studio-bar panel" role="tablist" aria-label="Avatar categories">
          ${categoryButtons}
        </div>

        <div class="panel avatar-studio-dropdown" data-panel="${categoryMeta.key}">
          <h3 class="avatar-studio-panel-title">${escapeHtml(categoryMeta.label)}</h3>
          <div class="avatar-studio-item-list">
            ${items.map((item) => renderStudioItem({ category: categoryMeta.key, item, state })).join("")}
          </div>
        </div>
      </div>

      <div class="panel avatar-studio-hero-panel" aria-hidden="${isMobileStudio() && !studioPreview ? "true" : "false"}">
        <div id="avatarStudioHeroMount" class="avatar-3d-mount avatar-3d-mount--hero"></div>
        ${
          isPreviewing(state)
            ? `<p class="avatar-studio-preview-note">Previewing — not saved yet</p>`
            : `<p class="hint avatar-studio-drag-hint">Drag to spin your avatar</p>`
        }
      </div>
    </div>
  `;

  const balance = document.getElementById("avatarStudioBalance");
  if (balance) balance.textContent = `${state.coins ?? 0} coins available`;

  root.querySelectorAll("[data-studio]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.studio;
      const category = btn.dataset.category;
      const id = btn.dataset.id;
      const price = Number(btn.dataset.price) || 0;

      if (action === "category") {
        activeCategory = category;
        pendingConfirm = null;
        renderAvatarStudio(state, { onChange });
        return;
      }

      if (action === "preview") {
        studioPreview = { category, id };
        if (isMobileStudio()) {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        renderAvatarStudio(state, { onChange });
        return;
      }

      if (action === "cancel") {
        pendingConfirm = null;
        renderAvatarStudio(state, { onChange });
        return;
      }

      if (action === "buy-request") {
        pendingConfirm = { kind: "purchase", category, id, price };
        renderAvatarStudio(state, { onChange });
        return;
      }

      if (action === "unequip-request") {
        pendingConfirm = { kind: "unequip", category, id };
        renderAvatarStudio(state, { onChange });
        return;
      }

      let result = { ok: false, error: "Unknown action" };

      if (action === "confirm-purchase") {
        result = purchaseAvatarPart(state, category, id, price);
        if (result.ok) result = equipAvatarPart(state, category, id);
      } else if (action === "confirm-unequip") {
        result = unequipAvatarPart(state, category);
      } else if (action === "equip") {
        result = equipAvatarPart(state, category, id);
      }

      if (!result.ok) {
        alert(result.error || "Action failed");
        return;
      }

      studioPreview = null;
      pendingConfirm = null;
      saveState(state);
      onChange?.(state);
      renderAvatarStudio(state, { onChange });
    });
  });

  if (shouldMountHero()) {
    refreshHero(state, true);
  } else {
    const mount = document.getElementById("avatarStudioHeroMount");
    if (mount) disposeAvatar3D(mount);
  }
  mountCategoryThumbnails(root, state.profile, categoryMeta.key);
}

export function disposeAvatarStudio() {
  const hero = document.getElementById("avatarStudioHeroMount");
  if (hero) disposeAvatar3D(hero);
  disposeAvatarThumbnailRenderer();
  studioPreview = null;
  pendingConfirm = null;
}

export function resetAvatarStudioUi() {
  studioPreview = null;
  pendingConfirm = null;
  activeCategory = "mouth";
}
