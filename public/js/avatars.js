/** Customizable profile avatars — mount helpers + 2D fallback */

import { mountAvatar3D, disposeAvatar3D, refreshAvatar3D } from "./avatar-3d.js";
import { AVATAR_CATALOG, findAvatarItem, avatarSelection } from "./avatar-catalog.js";

export { mountAvatar3D, disposeAvatar3D, refreshAvatar3D, AVATAR_CATALOG, findAvatarItem, avatarSelection };

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
  const face = findAvatarItem("face", sel.face);
  const hair = findAvatarItem("hair", sel.hair);
  const clothes = findAvatarItem("clothes", sel.clothes);
  const tint = clothes.tint || "#e85d04";

  return `
    <div class="avatar-compose avatar-compose--${size} ${className}" style="--avatar-tint:${tint}" aria-hidden="true">
      <span class="avatar-layer avatar-clothes">${clothes.emoji}</span>
      <span class="avatar-layer avatar-face">${face.emoji}</span>
      <span class="avatar-layer avatar-hair">${hair.emoji}</span>
    </div>
  `;
}
