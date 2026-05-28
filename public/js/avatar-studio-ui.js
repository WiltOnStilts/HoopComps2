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
let mountedThumbnailCategory = null;
let studioState = null;
let studioOnChange = null;

const HERO_OPTS = { size: "hero", autoRotate: true, interactive: true };

function heroProfile(state) {
  if (studioPreview) {
    return previewAvatarProfile(state.profile, studioPreview.category, studioPreview.id);
  }
  return state.profile;
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
    renderAvatarInto(mount, profile, HERO_OPTS);
  } else {
    refreshAvatar3D(mount, profile, HERO_OPTS);
  }
}

function heroFooterHtml() {
  if (studioPreview) {
    return `
      <p class="avatar-studio-preview-note">Previewing — not saved yet</p>
      <button type="button" class="avatar-studio-action-btn avatar-studio-action-btn--preview avatar-studio-stop-preview" data-studio="stop-preview">Stop previewing</button>
    `;
  }
  return `<p class="hint avatar-studio-drag-hint">Drag to spin your avatar</p>`;
}

function syncHeroFooter() {
  const mount = document.getElementById("avatarStudioHeroMount");
  const panel = mount?.closest(".avatar-studio-hero-panel");
  if (!mount || !panel) return;

  let sibling = mount.nextElementSibling;
  while (sibling) {
    const next = sibling.nextElementSibling;
    sibling.remove();
    sibling = next;
  }
  panel.insertAdjacentHTML("beforeend", heroFooterHtml());
}

function syncPreviewUi(state) {
  document.querySelector(".avatar-studio-main")?.classList.toggle(
    "avatar-studio-main--preview-active",
    Boolean(studioPreview)
  );
  syncHeroFooter();
  document.querySelectorAll(".avatar-studio-item").forEach((el) => {
    const previewing =
      studioPreview?.category === el.dataset.category && studioPreview?.id === el.dataset.id;
    el.classList.toggle("previewing", previewing);
  });
  refreshHero(state, false);
}

function handleStudioAction(action, state, { onChange, category, id, price } = {}) {
  if (action === "category") {
    activeCategory = category;
    pendingConfirm = null;
    mountedThumbnailCategory = null;
    renderAvatarStudio(state, { onChange });
    return;
  }

  if (action === "preview") {
    studioPreview = { category, id };
    syncPreviewUi(state);
    return;
  }

  if (action === "stop-preview") {
    studioPreview = null;
    syncPreviewUi(state);
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
}

function bindStudioActions(root, state, onChange) {
  studioState = state;
  studioOnChange = onChange;
  if (root.dataset.studioBound) return;
  root.dataset.studioBound = "1";
  root.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-studio]");
    if (!btn) return;
    handleStudioAction(btn.dataset.studio, studioState, {
      onChange: studioOnChange,
      category: btn.dataset.category,
      id: btn.dataset.id,
      price: Number(btn.dataset.price) || 0,
    });
  });
}

export function renderAvatarStudio(state, { onChange } = {}) {
  const root = document.getElementById("avatarStudioRoot");
  if (!root) return;

  const prevHero = document.getElementById("avatarStudioHeroMount");
  if (prevHero) disposeAvatar3D(prevHero);

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
      <div class="avatar-studio-hero-slot">
        <div class="panel avatar-studio-hero-panel">
          <div id="avatarStudioHeroMount" class="avatar-3d-mount avatar-3d-mount--hero"></div>
          ${heroFooterHtml()}
        </div>
      </div>

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
    </div>
  `;

  const balance = document.getElementById("avatarStudioBalance");
  if (balance) balance.textContent = `${state.coins ?? 0} coins available`;

  bindStudioActions(root, state, onChange);

  refreshHero(state, true);
  if (mountedThumbnailCategory !== categoryMeta.key) {
    mountedThumbnailCategory = categoryMeta.key;
    mountCategoryThumbnails(root, state.profile, categoryMeta.key);
  }
}

export function disposeAvatarStudio() {
  const hero = document.getElementById("avatarStudioHeroMount");
  if (hero) disposeAvatar3D(hero);
  disposeAvatarThumbnailRenderer();
  const root = document.getElementById("avatarStudioRoot");
  if (root) delete root.dataset.studioBound;
  studioPreview = null;
  pendingConfirm = null;
  mountedThumbnailCategory = null;
  studioState = null;
  studioOnChange = null;
}

export function resetAvatarStudioUi() {
  studioPreview = null;
  pendingConfirm = null;
  activeCategory = "mouth";
  mountedThumbnailCategory = null;
}
