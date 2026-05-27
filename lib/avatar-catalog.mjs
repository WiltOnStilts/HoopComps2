/** Avatar defaults + legacy migration (server) */

export const AVATAR_FORMAT_VERSION = 2;

export const AVATAR_PART_KEYS = [
  "skin",
  "eyeColor",
  "eyes",
  "eyebrowColor",
  "eyebrows",
  "hair",
  "mouth",
  "nose",
  "build",
  "costume",
];

export const SKIN_IDS = ["fair", "light", "medium", "tan", "brown", "deep", "ebony"];
export const EYE_COLOR_IDS = ["brown", "black", "tan"];
export const EYEBROW_COLOR_IDS = ["brown", "black", "tan"];

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

const LEGACY_HAIR_TO_HAIR = {
  buzz: "buzzcut",
  curly: "curly",
  wave: "wavy",
  cap: "crew",
  headband: "sidepart",
  fro: "afro",
  crown: "fluffy",
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
    eyeColor: "brown",
    eyes: "round",
    eyebrowColor: "brown",
    eyebrows: "natural",
    hair: "bald",
    mouth: "smile",
    nose: "classic",
    build: "average",
    costume: "garbage",
  };
}

export function defaultOwnedAvatarParts() {
  return {
    skin: [...SKIN_IDS],
    eyeColor: [...EYE_COLOR_IDS],
    eyes: ["round"],
    eyebrowColor: [...EYEBROW_COLOR_IDS],
    eyebrows: ["natural"],
    hair: ["bald"],
    mouth: ["smile"],
    nose: ["classic"],
    build: ["average"],
    costume: ["garbage"],
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
    nextSel.hair = LEGACY_HAIR_TO_HAIR[oldSel.hair] || nextSel.hair;
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
    const hairId = LEGACY_HAIR_TO_HAIR[id];
    if (hairId && !nextOwned.hair.includes(hairId)) nextOwned.hair.push(hairId);
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
  state.avatarFormatVersion = AVATAR_FORMAT_VERSION;
  normalizeAvatarPartIds(state);
  return state;
}

export function normalizeAvatarState(state) {
  migrateAvatarFormat(state);
  normalizeAvatarPartIds(state);

  if (!state.profile) state.profile = {};
  if (!state.profile.avatar || typeof state.profile.avatar !== "object") {
    state.profile.avatar = defaultAvatarSelection();
  }
  if (!state.ownedAvatarParts || typeof state.ownedAvatarParts !== "object") {
    state.ownedAvatarParts = defaultOwnedAvatarParts();
  }

  for (const key of AVATAR_PART_KEYS) {
    if (!Array.isArray(state.ownedAvatarParts[key])) {
      state.ownedAvatarParts[key] = defaultOwnedAvatarParts()[key];
    }
    if (key === "skin") {
      state.ownedAvatarParts.skin = [...SKIN_IDS];
      continue;
    }
    if (key === "eyeColor") {
      state.ownedAvatarParts.eyeColor = [...EYE_COLOR_IDS];
      continue;
    }
    if (key === "eyebrowColor") {
      state.ownedAvatarParts.eyebrowColor = [...EYEBROW_COLOR_IDS];
      continue;
    }
    const freeId = defaultAvatarSelection()[key];
    if (freeId && !state.ownedAvatarParts[key].includes(freeId)) {
      state.ownedAvatarParts[key].unshift(freeId);
    }
  }

  const sel = state.profile.avatar;
  const defaults = defaultAvatarSelection();
  for (const key of AVATAR_PART_KEYS) {
    if (!sel[key]) sel[key] = defaults[key];
  }
  sel.costume = normalizeCostumeId(sel.costume);

  return state;
}
