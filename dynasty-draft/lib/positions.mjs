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

/** Known tall perimeter players — height alone must not strip SF */
export const TALL_PERIMETER_WING_SLUGS = new Set([
  "kevin-durant",
  "larry-bird",
  "julius-erving",
  "james-worthy",
  "toni-kukoc",
  "carmelo-anthony",
  "paul-pierce",
  "kawhi-leonard",
  "jayson-tatum",
  "paul-george",
  "brandon-ingram",
  "michael-porter-jr",
  "lauri-markkanen",
  "tracy-mcgrady",
  "scottie-pippen",
  "kevin-durant",
  "dirk-nowitzki",
]);

export const POINT_FORWARD_SLUGS = new Set([
  "lebron-james",
  "magic-johnson",
  "ben-simmons",
  "luka-doncic",
  "giannis-antetokounmpo",
  "larry-bird",
  "james-harden",
  "oscar-robertson",
  "jason-kidd",
  "draymond-green",
  "kevin-durant",
  "julius-erving",
  "toni-kukoc",
  "lamar-odom",
  "scottie-pippen",
]);

const POINT_FORWARD_APG = 6.5;

export { POINT_FORWARD_APG };

export function playerSlugFromName(name, id = null) {
  const fromName = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (fromName) return fromName;
  if (id) return String(id).replace(/-[^-]+-\d+$/, "");
  return "";
}

/** Shared context for role-based position inference (browser + server safe) */
export function buildPositionContext(player, careerHint = null) {
  const ratings = player?.ratings || {};
  const stats = player?.stats || {};
  const gp = Math.max(1, Number(stats.GP ?? stats.gp ?? 1));
  const rawAst = stats.AST ?? stats.ast ?? stats.apg;
  const rawReb = stats.REB ?? stats.trb ?? stats.reb ?? stats.rpg;
  let apg = stats.apg;
  let rpg = stats.rpg;
  if (apg == null && Number.isFinite(rawAst)) {
    const n = Number(rawAst);
    apg = n > gp * 2 ? n / gp : n;
  }
  if (rpg == null && Number.isFinite(rawReb)) {
    const n = Number(rawReb);
    rpg = n > gp * 2 ? n / gp : n;
  }
  if (apg == null && ratings.playmaking != null) apg = (ratings.playmaking - 40) / 6;
  if (rpg == null && ratings.rebounding != null) rpg = (ratings.rebounding - 40) / 5;

  const playerSlug = playerSlugFromName(player?.name, player?.id);
  const labelPositions = player?.positions?.length
    ? uniquePositions(player.positions)
    : parsePositionLabel(player?.posLabel || player?.pos || player?.position || "F");

  return {
    height: parseHeight(player?.height ?? player?.hgt),
    apg,
    rpg,
    rebRating: ratings.rebounding ?? null,
    scoring: ratings.scoring ?? null,
    shooting: ratings.shooting ?? null,
    playmaking: ratings.playmaking ?? null,
    playerSlug,
    careerHint,
    labelPositions,
  };
}

export function isPointForwardProfile(ctx) {
  if (POINT_FORWARD_SLUGS.has(ctx.playerSlug)) return true;
  if (ctx.careerHint?.positions?.includes("PG") && ctx.careerHint?.positions?.some((p) => p === "SF" || p === "PF")) {
    return true;
  }
  return (
    ctx.height != null &&
    ctx.height >= 78 &&
    ctx.apg != null &&
    ctx.apg >= POINT_FORWARD_APG &&
    (ctx.labelPositions?.includes("SF") || ctx.labelPositions?.includes("PF"))
  );
}

export function isPerimeterWingProfile(ctx) {
  if (isReboundingBigProfile(ctx)) return false;
  if (TALL_PERIMETER_WING_SLUGS.has(ctx.playerSlug)) return true;
  if (ctx.careerHint?.primaryPosition === "SF") return true;
  if (ctx.careerHint?.positions?.includes("SF")) return true;
  if (ctx.labelPositions?.includes("SF")) return true;

  const { shooting, scoring, rebRating, rpg, apg } = ctx;
  if (shooting != null && shooting >= 78 && scoring != null && scoring >= 82) {
    if ((rebRating == null || rebRating < 82) && (rpg == null || rpg < 8.5)) return true;
  }
  if (apg != null && apg >= 4.5 && shooting != null && shooting >= 76 && (rebRating == null || rebRating < 80)) {
    return true;
  }
  return false;
}

export function isReboundingBigProfile(ctx) {
  const { height, rpg, rebRating, shooting, playmaking, playerSlug } = ctx;
  if (height == null || height < 80) return false;
  if (TALL_PERIMETER_WING_SLUGS.has(playerSlug)) return false;
  if (ctx.careerHint?.primaryPosition === "SF" || ctx.careerHint?.positions?.includes("SF")) return false;
  if (
    shooting != null &&
    shooting >= 78 &&
    ctx.scoring != null &&
    ctx.scoring >= 82 &&
    (rebRating == null || rebRating < 82) &&
    (rpg == null || rpg < 8.5)
  ) {
    return false;
  }

  const postSkilled =
    (shooting != null && shooting < 72) || (playmaking != null && playmaking < 62);
  const strongRebounder =
    (rpg != null && rpg >= 8) || (rebRating != null && rebRating >= 88);
  const moderateRebounder =
    rpg != null && rpg >= 6.5 && rebRating != null && rebRating >= 82;

  if (strongRebounder && (rebRating == null || rebRating >= 78 || postSkilled)) return true;
  if (height >= 82 && rpg != null && rpg >= 7 && postSkilled) return true;
  if (moderateRebounder && height >= 81 && postSkilled) return true;
  return false;
}

/** Hard physical limits only — never strip SF just for being tall */
export function applyPhysicalPositionLimits(positions, ctx) {
  const { height } = ctx;
  if (height == null) return uniquePositions(positions);
  let out = uniquePositions(positions);

  const pointForward = isPointForwardProfile(ctx);
  if (height >= 84) out = out.filter((pos) => pos !== "PG" || pointForward);
  if (height >= 82) out = out.filter((pos) => pos !== "PG" || pointForward);
  if (height >= 84 && !pointForward) out = out.filter((pos) => !isGuard(pos));

  if (height <= 72) out = out.filter((pos) => pos !== "C");
  if (height <= 74) out = out.filter((pos) => !isBig(pos));

  return out;
}

/** Adjust positions from real-life role (rebounding big vs perimeter wing) */
export function applyRolePositionAdjustments(positions, ctx) {
  let out = uniquePositions(positions);
  if (!out.length) return out;

  if (isReboundingBigProfile(ctx)) {
    out = out.filter((pos) => !isGuard(pos) && pos !== "SF");
    if (!out.includes("PF")) out.unshift("PF");
    const { height, rpg, rebRating } = ctx;
    if (height >= 81 || (rpg != null && rpg >= 9) || (rebRating != null && rebRating >= 90)) {
      if (!out.includes("C")) out.push("C");
    }
    if (!out.length) out = height != null && height >= 84 ? ["PF", "C"] : ["PF"];
    return uniquePositions(out);
  }

  if (isPerimeterWingProfile(ctx)) {
    if (!out.includes("SF") && (out.includes("PF") || out.includes("SG"))) out.unshift("SF");
    if (ctx.height != null && ctx.height >= 80 && !out.includes("PF")) out.push("PF");
    return uniquePositions(out);
  }

  return out;
}

export function pickPrimaryPositionFromRole(positions, ctx) {
  const list = uniquePositions(positions);
  if (!list.length) return "SF";
  if (ctx.careerHint?.primaryPosition && list.includes(ctx.careerHint.primaryPosition)) {
    return ctx.careerHint.primaryPosition;
  }
  if (isPerimeterWingProfile(ctx) && list.includes("SF")) return "SF";
  if (isReboundingBigProfile(ctx) && list.includes("PF")) return "PF";
  if (ctx.height != null && ctx.height >= 84 && list.includes("C") && !list.includes("SF")) return "C";
  if (ctx.height != null && ctx.height >= 82 && list.includes("PF") && !list.includes("SF")) return "PF";
  return list[0];
}

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

/** Use role signals to collapse vague F/G labels */
export function refinePositions(positions, options = {}) {
  let out = uniquePositions(positions);
  const ratings = options.ratings || null;
  const reb = ratings?.rebounding ?? 62;
  const pm = ratings?.playmaking ?? 62;
  const shooting = ratings?.shooting ?? 62;
  const ctx = buildPositionContext(
    {
      height: options.height ?? null,
      ratings,
      stats: options.stats || null,
      positions: out,
      name: options.name,
      id: options.id,
    },
    options.careerHint || null
  );

  if (isVagueForwardPair(out)) {
    if (isReboundingBigProfile(ctx)) out = ["PF", "C"];
    else if (isPerimeterWingProfile(ctx)) out = ["SF", "PF"];
    else if (reb >= 88 && shooting < 72) out = ["PF", "C"];
    else if (reb >= 82) out = pm >= 78 || shooting >= 78 ? ["SF", "PF"] : ["PF"];
    else if (reb >= 74) out = ["PF"];
    else if (pm >= 78 && reb < 65) out = ["SF"];
    else out = ["SF", "PF"];
  }

  if (isVagueGuardPair(out)) {
    if (pm >= 80) out = ["PG"];
    else if (pm <= 68) out = ["SG"];
    else out = ["PG", "SG"];
  }

  return uniquePositions(out);
}

function roleAwareFallback(ctx) {
  if (isPerimeterWingProfile(ctx)) return ["SF", "PF"];
  if (isReboundingBigProfile(ctx)) {
    return ctx.height != null && ctx.height >= 81 ? ["PF", "C"] : ["PF"];
  }
  if (ctx.height == null) return ["SF"];
  if (ctx.height >= 84) return ["PF", "C"];
  if (ctx.height >= 82) return ["PF"];
  if (ctx.height >= 80) return ["SF", "PF"];
  if (ctx.height <= 74) return ["PG", "SG"];
  if (ctx.height <= 76) return ["PG", "SG"];
  return ["SF"];
}

/** Apply physical limits + real-life role adjustments */
export function applyHeightCaps(positions, height, extra = {}) {
  const ctx = buildPositionContext(
    {
      height: typeof height === "number" ? height : extra.height ?? null,
      ratings: extra.ratings || null,
      stats: extra.stats || null,
      positions,
      name: extra.name,
      id: extra.id,
    },
    extra.careerHint || null
  );
  let out = applyPhysicalPositionLimits(positions, ctx);
  out = applyRolePositionAdjustments(out, ctx);
  if (!out.length) out = roleAwareFallback(ctx);
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

  const ctx = buildPositionContext(player);
  return isReboundingBigProfile(ctx) && explicit.every(isBig);
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
