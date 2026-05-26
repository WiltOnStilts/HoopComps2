/** Avatar shop catalog — Face + Torso part categories */

export const AVATAR_FORMAT_VERSION = 2;

export const AVATAR_PART_KEYS = ["skin", "eyes", "mouth", "nose", "eyebrows", "build", "costume"];

export const AVATAR_SHOP_GROUPS = [
  {
    id: "face",
    label: "Face",
    hint: "Ears are included automatically on every avatar.",
    categories: [
      { key: "skin", label: "Skin tone", free: true },
      { key: "eyes", label: "Eyes" },
      { key: "mouth", label: "Mouth" },
      { key: "nose", label: "Nose" },
      { key: "eyebrows", label: "Eyebrows" },
    ],
  },
  {
    id: "torso",
    label: "Torso",
    hint: "Arms match your build type automatically. Costumes climb from garbage truck worker to NBA star.",
    categories: [
      { key: "build", label: "Build" },
      { key: "costume", label: "Costume · career ladder" },
    ],
  },
];

export const AVATAR_CATALOG = {
  skin: [
    { id: "fair", label: "Fair", hex: "#ffdbac", price: 0 },
    { id: "light", label: "Light", hex: "#f1c27d", price: 0 },
    { id: "medium", label: "Medium", hex: "#c68642", price: 0 },
    { id: "tan", label: "Tan", hex: "#a47148", price: 0 },
    { id: "brown", label: "Brown", hex: "#8d5524", price: 0 },
    { id: "deep", label: "Deep", hex: "#6b4423", price: 0 },
    { id: "ebony", label: "Ebony", hex: "#4a3728", price: 0 },
  ],
  eyes: [
    { id: "round", label: "Round", emoji: "👀", price: 0 },
    { id: "narrow", label: "Narrow", emoji: "😑", price: 200 },
    { id: "wide", label: "Wide", emoji: "😳", price: 350 },
    { id: "intense", label: "Intense", emoji: "🧐", price: 500 },
    { id: "sleepy", label: "Sleepy", emoji: "😴", price: 450 },
    { id: "star", label: "Star", emoji: "🤩", price: 750 },
    { id: "shade", label: "Shaded", emoji: "😎", price: 900 },
  ],
  mouth: [
    { id: "smile", label: "Smile", emoji: "🙂", price: 0 },
    { id: "grin", label: "Grin", emoji: "😁", price: 250 },
    { id: "smirk", label: "Smirk", emoji: "😏", price: 400 },
    { id: "flat", label: "Flat", emoji: "😐", price: 200 },
    { id: "open", label: "Open", emoji: "😮", price: 350 },
    { id: "laugh", label: "Laugh", emoji: "😆", price: 550 },
    { id: "tough", label: "Tough", emoji: "😤", price: 650 },
  ],
  nose: [
    { id: "classic", label: "Classic", emoji: "👃", price: 0 },
    { id: "button", label: "Button", emoji: "•", price: 200 },
    { id: "straight", label: "Straight", emoji: "|", price: 350 },
    { id: "wide", label: "Wide", emoji: "▭", price: 400 },
    { id: "sharp", label: "Sharp", emoji: "▲", price: 550 },
  ],
  eyebrows: [
    { id: "natural", label: "Natural", emoji: "〰", price: 0 },
    { id: "thick", label: "Thick", emoji: "━", price: 250 },
    { id: "arched", label: "Arched", emoji: "⌒", price: 400 },
    { id: "flat", label: "Flat", emoji: "—", price: 300 },
    { id: "bushy", label: "Bushy", emoji: "≡", price: 500 },
    { id: "raised", label: "Raised", emoji: "╱", price: 650 },
  ],
  build: [
    { id: "average", label: "Average", emoji: "🧍", price: 0 },
    { id: "slim", label: "Slim", emoji: "🪶", price: 300 },
    { id: "athletic", label: "Athletic", emoji: "🏃", price: 500 },
    { id: "strong", label: "Strong", emoji: "💪", price: 750 },
    { id: "powerhouse", label: "Powerhouse", emoji: "🏋", price: 1000 },
  ],
  costume: [
    { id: "garbage", label: "Garbage truck worker", emoji: "🗑", price: 0, tint: "#ffc300" },
    { id: "fastfood", label: "Fast food crew", emoji: "🍔", price: 150, tint: "#e63946" },
    { id: "retail", label: "Retail clerk", emoji: "🛍", price: 250, tint: "#457b9d" },
    { id: "intern", label: "Office intern", emoji: "💼", price: 350, tint: "#6c757d" },
    { id: "teacher", label: "Teacher", emoji: "📚", price: 450, tint: "#2a9d8f" },
    { id: "coach_hs", label: "HS coach", emoji: "📋", price: 550, tint: "#264653" },
    { id: "trainer", label: "Trainer", emoji: "🎽", price: 650, tint: "#1d3557" },
    { id: "scout", label: "Scout", emoji: "🔍", price: 750, tint: "#5c4d7d" },
    { id: "analyst", label: "Front office", emoji: "📊", price: 850, tint: "#1b1b1e" },
    { id: "broadcaster", label: "Broadcaster", emoji: "🎙", price: 950, tint: "#212529" },
    { id: "gleague", label: "G League", emoji: "🏟", price: 1100, tint: "#495057" },
    { id: "rookie", label: "NBA rookie", emoji: "🆕", price: 1300, tint: "#0077b6" },
    { id: "allstar", label: "All-Star", emoji: "⭐", price: 1500, tint: "#ffd166" },
    { id: "nba_star", label: "NBA star", emoji: "🏀", price: 1800, tint: "#e85d04" },
  ],
};

const LEGACY_FACE_TO_MOUTH = {
  classic: "smile",
  grin: "grin",
  cool: "smirk",
  star: "smile",
  focus: "flat",
  fire: "tough",
  goat: "laugh",
};

const LEGACY_FACE_TO_EYES = {
  star: "star",
  focus: "intense",
  cool: "shade",
};

const LEGACY_HAIR_TO_EYEBROWS = {
  buzz: "natural",
  curly: "arched",
  wave: "natural",
  cap: "flat",
  headband: "raised",
  fro: "bushy",
  crown: "thick",
};

const LEGACY_CLOTHES_TO_COSTUME = {
  jersey: "garbage",
  tee: "retail",
  garbage: "garbage",
  hoodie: "intern",
  warmup: "trainer",
  suit: "analyst",
  referee: "broadcaster",
  coach: "coach_hs",
  allstar: "allstar",
  champ: "nba_star",
  championship: "nba_star",
};

/** Remap retired costume ids after career-ladder update */
export const COSTUME_ID_ALIASES = {
  jersey: "garbage",
  tee: "retail",
  hoodie: "intern",
  warmup: "trainer",
  suit: "analyst",
  referee: "broadcaster",
  coach: "coach_hs",
  championship: "nba_star",
  champ: "nba_star",
};

export function normalizeCostumeId(id) {
  return COSTUME_ID_ALIASES[id] || id;
}

export function defaultAvatarSelection() {
  return {
    skin: "medium",
    eyes: "round",
    mouth: "smile",
    nose: "classic",
    eyebrows: "natural",
    build: "average",
    costume: "garbage",
  };
}

export function defaultOwnedAvatarParts() {
  const owned = {};
  for (const key of AVATAR_PART_KEYS) {
    if (key === "skin") {
      owned.skin = AVATAR_CATALOG.skin.map((item) => item.id);
      continue;
    }
    const free = AVATAR_CATALOG[key]?.find((item) => item.price === 0);
    owned[key] = free ? [free.id] : [];
  }
  return owned;
}

export function findAvatarItem(category, id) {
  return AVATAR_CATALOG[category]?.find((item) => item.id === id) || AVATAR_CATALOG[category]?.[0];
}

export function avatarSelection(profile = {}) {
  const sel = profile.avatar || {};
  const defaults = defaultAvatarSelection();
  const out = {};
  for (const key of AVATAR_PART_KEYS) {
    out[key] = sel[key] || defaults[key];
  }
  out.costume = normalizeCostumeId(out.costume);
  return out;
}

export function previewAvatarProfile(profile = {}, category, itemId) {
  const base = profile && typeof profile === "object" ? profile : {};
  return {
    ...base,
    avatar: { ...avatarSelection(base), [category]: itemId },
  };
}

function remapOwnedCostumes(owned = []) {
  return [...new Set(owned.map((id) => normalizeCostumeId(id)))];
}

export function normalizeAvatarPartIds(state) {
  if (!state?.profile?.avatar) return state;
  state.profile.avatar.costume = normalizeCostumeId(state.profile.avatar.costume);
  if (Array.isArray(state.ownedAvatarParts?.costume)) {
    state.ownedAvatarParts.costume = remapOwnedCostumes(state.ownedAvatarParts.costume);
  }
  return state;
}

export function skinHex(profile = {}) {
  const sel = avatarSelection(profile);
  return findAvatarItem("skin", sel.skin)?.hex || "#c68642";
}

export function isFreeAvatarCategory(category) {
  return category === "skin";
}

export function migrateAvatarFormat(state) {
  if (!state || typeof state !== "object") return state;
  if ((state.avatarFormatVersion || 0) >= AVATAR_FORMAT_VERSION) {
    normalizeAvatarPartIds(state);
    return state;
  }

  const oldSel = state.profile?.avatar || {};
  const oldOwned = state.ownedAvatarParts || {};
  const nextSel = defaultAvatarSelection();
  const nextOwned = defaultOwnedAvatarParts();

  if (oldSel.face) {
    nextSel.mouth = LEGACY_FACE_TO_MOUTH[oldSel.face] || nextSel.mouth;
    if (LEGACY_FACE_TO_EYES[oldSel.face]) {
      nextSel.eyes = LEGACY_FACE_TO_EYES[oldSel.face];
    }
  }
  if (oldSel.hair) {
    nextSel.eyebrows = LEGACY_HAIR_TO_EYEBROWS[oldSel.hair] || nextSel.eyebrows;
  }
  if (oldSel.clothes) {
    nextSel.costume = LEGACY_CLOTHES_TO_COSTUME[oldSel.clothes] || nextSel.costume;
  } else if (oldSel.costume) {
    nextSel.costume = normalizeCostumeId(oldSel.costume);
  }

  for (const id of oldOwned.face || []) {
    const mouth = LEGACY_FACE_TO_MOUTH[id];
    if (mouth && !nextOwned.mouth.includes(mouth)) nextOwned.mouth.push(mouth);
    const eyes = LEGACY_FACE_TO_EYES[id];
    if (eyes && !nextOwned.eyes.includes(eyes)) nextOwned.eyes.push(eyes);
  }
  for (const id of oldOwned.hair || []) {
    const brows = LEGACY_HAIR_TO_EYEBROWS[id];
    if (brows && !nextOwned.eyebrows.includes(brows)) nextOwned.eyebrows.push(brows);
  }
  for (const id of oldOwned.clothes || []) {
    const costume = LEGACY_CLOTHES_TO_COSTUME[id];
    if (costume && !nextOwned.costume.includes(costume)) nextOwned.costume.push(costume);
  }
  for (const id of oldOwned.costume || []) {
    const costume = normalizeCostumeId(id);
    if (costume && !nextOwned.costume.includes(costume)) nextOwned.costume.push(costume);
  }

  state.profile = state.profile || {};
  state.profile.avatar = nextSel;
  state.ownedAvatarParts = nextOwned;
  normalizeAvatarPartIds(state);
  state.avatarFormatVersion = AVATAR_FORMAT_VERSION;
  return state;
}
