/** Position parsing, normalization, and lineup eligibility rules */

export const LINEUP_POSITIONS = ["PG", "SG", "SF", "PF", "C"];

const POSITION_INDEX = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };

const EXPLICIT_COMBOS = {
  "G-F": ["SG", "SF"],
  "F-G": ["SF", "SG"],
  "F-C": ["PF", "C"],
  "C-F": ["C", "PF"],
  "G": null,
  F: null,
  C: ["C"],
  PG: ["PG"],
  SG: ["SG"],
  SF: ["SF"],
  PF: ["PF"],
};

const ADJACENCY = {
  PG: ["SG"],
  SG: ["PG", "SF"],
  SF: ["SG", "PF"],
  PF: ["SF", "C"],
  C: ["PF"],
};

const FIT_MULTIPLIERS = {
  PG: { SG: 0.85 },
  SG: { PG: 0.82, SF: 0.88 },
  SF: { SG: 0.86, PF: 0.88 },
  PF: { SF: 0.86, C: 0.82 },
  C: { PF: 0.84 },
};

function isGuard(pos) {
  return pos === "PG" || pos === "SG";
}

function isBig(pos) {
  return pos === "PF" || pos === "C";
}

function uniquePositions(list) {
  const out = [];
  for (const pos of list || []) {
    if (LINEUP_POSITIONS.includes(pos) && !out.includes(pos)) out.push(pos);
  }
  return out;
}

/** Parse "6-11", 81 (inches), or numeric strings into inches */
export function parseHeight(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  const text = String(raw).trim();
  const feetInches = text.match(/^(\d+)\s*[-']\s*(\d+)/);
  if (feetInches) return Number(feetInches[1]) * 12 + Number(feetInches[2]);
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Parse roster position labels — vague G/F are resolved later via height/stats */
export function parsePositionLabel(raw) {
  const label = String(raw || "F")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  if (label in EXPLICIT_COMBOS) {
    const mapped = EXPLICIT_COMBOS[label];
    if (mapped) return [...mapped];
    return label === "G" ? ["PG", "SG"] : ["SF", "PF"];
  }

  const out = [];
  const add = (pos) => {
    if (LINEUP_POSITIONS.includes(pos) && !out.includes(pos)) out.push(pos);
  };

  if (label.includes("PG")) add("PG");
  if (label.includes("SG")) add("SG");
  if (label.includes("SF")) add("SF");
  if (label.includes("PF")) add("PF");
  if (label.includes("C")) add("C");

  if (!out.length) {
    for (const ch of label.replace(/-/g, "")) {
      if (ch === "G") {
        add("PG");
        add("SG");
      } else if (ch === "F") {
        add("SF");
        add("PF");
      } else if (ch === "C") {
        add("C");
      }
    }
  }

  return out.length ? out : ["SF"];
}

function isVagueForwardPair(positions) {
  return positions.length === 2 && positions.includes("SF") && positions.includes("PF");
}

function isVagueGuardPair(positions) {
  return positions.length === 2 && positions.includes("PG") && positions.includes("SG");
}

/** Use height + ratings to collapse vague F/G labels */
export function refinePositions(positions, { height = null, ratings = null } = {}) {
  let out = uniquePositions(positions);
  const reb = ratings?.rebounding ?? 62;
  const pm = ratings?.playmaking ?? 62;

  if (isVagueForwardPair(out)) {
    if (height != null && height >= 84) out = ["PF", "C"];
    else if (height != null && height >= 81) out = ["PF"];
    else if (height != null && height <= 77) out = ["SF"];
    else if (reb >= 88 || (height != null && height >= 84)) out = ["PF", "C"];
    else if (reb >= 82) out = pm >= 78 ? ["SF", "PF"] : ["PF"];
    else if (reb >= 74) out = ["PF"];
    else if (pm >= 78 && reb < 65) out = ["SF"];
    else out = ["SF"];
  }

  if (isVagueGuardPair(out)) {
    if (pm >= 80) out = ["PG"];
    else if (pm <= 68) out = ["SG"];
    else out = ["PG", "SG"];
  }

  return uniquePositions(out);
}

function heightFallbackPositions(height) {
  if (height == null) return ["SF"];
  if (height >= 84) return ["PF", "C"];
  if (height >= 82) return ["PF"];
  if (height >= 80) return ["SF", "PF"];
  if (height <= 74) return ["PG", "SG"];
  if (height <= 76) return ["PG", "SG"];
  return ["SF"];
}

/** Remove unrealistic positions based on height */
export function applyHeightCaps(positions, height) {
  if (height == null) return uniquePositions(positions);
  let out = uniquePositions(positions);

  if (height >= 84) out = out.filter((pos) => !isGuard(pos) && pos !== "SF");
  else if (height >= 82) out = out.filter((pos) => !isGuard(pos));
  else if (height >= 80) {
    const keepPg = out.includes("PG") && out.some((p) => p === "SF" || p === "PF");
    out = out.filter((pos) => pos !== "PG" || keepPg);
  }

  if (height <= 72) out = out.filter((pos) => pos !== "C");
  if (height <= 74) out = out.filter((pos) => !isBig(pos));

  if (!out.length) {
    return heightFallbackPositions(height);
  }
  return out;
}

function listedPositions(player) {
  const set = new Set(player.positions || []);
  if (player.primaryPosition) set.add(player.primaryPosition);
  return [...set];
}

function hasExplicitCrossover(positions) {
  return isGuard(positions[0]) && positions.some(isBig);
}

function crossesGuardBigBarrier(playerPositions, slot) {
  const explicit = listedPositions(playerPositions);
  if (explicit.includes(slot)) return false;
  if (hasExplicitCrossover(explicit)) return false;

  const playerHasBig = explicit.some(isBig);
  const playerHasGuard = explicit.some(isGuard);
  const slotIsGuard = isGuard(slot);
  const slotIsBig = isBig(slot);

  if (playerHasBig && !playerHasGuard && slotIsGuard) return true;
  if (playerHasGuard && !playerHasBig && slotIsBig) return true;
  return false;
}

function heightBlocksSlot(height, slot) {
  if (height == null) return false;
  if (height >= 84 && isGuard(slot)) return true;
  if (height >= 82 && slot === "PG") return true;
  if (height <= 72 && slot === "C") return true;
  if (height <= 74 && isBig(slot)) return true;
  return false;
}

function blocksWingFlex(player, slot) {
  if (slot !== "SF") return false;
  const explicit = listedPositions(player);
  if (explicit.includes("SF")) return false;

  const height = parseHeight(player.height ?? player.hgt);
  if (height != null && height >= 84) return true;

  const reb = player.ratings?.rebounding ?? 0;
  const pm = player.ratings?.playmaking ?? 0;
  return explicit.every(isBig) && reb >= 84 && pm < 75;
}

/** Whether a player can be assigned to a lineup slot (server + client) */
export function canPlayPosition(player, slot) {
  if (slot === "sixth") return true;

  const height = parseHeight(player.height ?? player.hgt);
  if (heightBlocksSlot(height, slot)) return false;

  const explicit = listedPositions(player);
  if (explicit.includes(slot)) return true;
  if (crossesGuardBigBarrier(player, slot)) return false;
  if (blocksWingFlex(player, slot)) return false;

  for (const pos of explicit) {
    if (ADJACENCY[slot]?.includes(pos)) return true;
  }
  return false;
}

export function getEligiblePositions(player, slots = [...LINEUP_POSITIONS, "sixth"]) {
  return slots.filter((slot) => canPlayPosition(player, slot));
}

export function positionFitMultiplier(player, assignedPosition) {
  if (assignedPosition === "sixth") return 0.95;
  if (player.primaryPosition === assignedPosition) return 1.0;
  if (player.positions?.includes(assignedPosition)) return 0.92;
  return FIT_MULTIPLIERS[assignedPosition]?.[player.primaryPosition] || 0.75;
}

export function positionDistance(a, b) {
  if (POSITION_INDEX[a] == null || POSITION_INDEX[b] == null) return 99;
  return Math.abs(POSITION_INDEX[a] - POSITION_INDEX[b]);
}
