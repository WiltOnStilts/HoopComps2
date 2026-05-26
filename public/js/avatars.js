/** Customizable profile avatars — catalog + render */

export const AVATAR_CATALOG = {
  face: [
    { id: "classic", label: "Classic", emoji: "🙂", price: 0 },
    { id: "grin", label: "Big grin", emoji: "😁", price: 250 },
    { id: "cool", label: "Cool", emoji: "😎", price: 450 },
    { id: "star", label: "Star eyes", emoji: "🤩", price: 650 },
    { id: "focus", label: "Focused", emoji: "🧐", price: 800 },
    { id: "fire", label: "On fire", emoji: "🔥", price: 1200 },
    { id: "goat", label: "GOAT", emoji: "🐐", price: 1500 },
  ],
  hair: [
    { id: "buzz", label: "Buzz cut", emoji: "💈", price: 0 },
    { id: "curly", label: "Curly", emoji: "🌀", price: 200 },
    { id: "wave", label: "Waves", emoji: "🌊", price: 350 },
    { id: "cap", label: "Cap", emoji: "🧢", price: 500 },
    { id: "headband", label: "Headband", emoji: "🎽", price: 650 },
    { id: "fro", label: "Afro", emoji: "👨‍🦱", price: 900 },
    { id: "crown", label: "Crown", emoji: "👑", price: 1400 },
  ],
  clothes: [
    { id: "jersey", label: "Jersey", emoji: "👕", price: 0, tint: "#e85d04" },
    { id: "warmup", label: "Warmup", emoji: "🧥", price: 300, tint: "#457b9d" },
    { id: "retro", label: "Retro tee", emoji: "👔", price: 450, tint: "#6a4c93" },
    { id: "throwback", label: "Throwback", emoji: "🎽", price: 600, tint: "#2a9d8f" },
    { id: "city", label: "City edition", emoji: "🦺", price: 850, tint: "#f4a261" },
    { id: "finals", label: "Finals fit", emoji: "🤵", price: 1100, tint: "#ffd166" },
    { id: "champ", label: "Championship", emoji: "🏆", price: 1500, tint: "#ffb703" },
  ],
};

export function findAvatarItem(category, id) {
  return AVATAR_CATALOG[category]?.find((item) => item.id === id) || AVATAR_CATALOG[category]?.[0];
}

export function avatarSelection(profile = {}) {
  const sel = profile.avatar || {};
  return {
    face: sel.face || "classic",
    hair: sel.hair || "buzz",
    clothes: sel.clothes || "jersey",
  };
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
