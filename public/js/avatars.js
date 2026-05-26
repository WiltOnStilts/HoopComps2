/** Customizable profile avatars — mount helpers + 2D fallback */

import { mountAvatar3D, disposeAvatar3D, refreshAvatar3D } from "./avatar-3d.js";
import {
  AVATAR_CATALOG,
  AVATAR_SHOP_GROUPS,
  AVATAR_PART_KEYS,
  findAvatarItem,
  avatarSelection,
  skinHex,
  isFreeAvatarCategory,
  migrateAvatarFormat,
  defaultAvatarSelection,
  defaultOwnedAvatarParts,
  previewAvatarProfile,
} from "./avatar-catalog.js";

export {
  mountAvatar3D,
  disposeAvatar3D,
  refreshAvatar3D,
  AVATAR_CATALOG,
  AVATAR_SHOP_GROUPS,
  AVATAR_PART_KEYS,
  findAvatarItem,
  avatarSelection,
  skinHex,
  isFreeAvatarCategory,
  migrateAvatarFormat,
  defaultAvatarSelection,
  defaultOwnedAvatarParts,
  previewAvatarProfile,
};

export function renderAvatarInto(container, profile, options = {}) {
  if (!container) return;
  container.innerHTML = "";
  container.classList.add("avatar-3d-mount");
  const ok = mountAvatar3D(container, profile, options);
  if (!ok) {
    container.innerHTML = renderAvatarHtml(profile, options);
    container.classList.remove("avatar-3d-mount");
  }
}

export function renderAvatarHtml(profile, { size = "md", className = "" } = {}) {
  const sel = avatarSelection(profile);
  const costume = findAvatarItem("costume", sel.costume);
  const eyes = findAvatarItem("eyes", sel.eyes);
  const mouth = findAvatarItem("mouth", sel.mouth);
  const tint = costume.tint || "#e85d04";
  const skin = skinHex(profile);

  return `
    <div class="avatar-compose avatar-compose--${size} ${className}" style="--avatar-tint:${tint};--avatar-skin:${skin}" aria-hidden="true">
      <span class="avatar-layer avatar-clothes">${costume.emoji || "👕"}</span>
      <span class="avatar-layer avatar-face">${mouth.emoji || "🙂"}</span>
      <span class="avatar-layer avatar-hair">${eyes.emoji || "👀"}</span>
    </div>
  `;
}
