/** Position inference from height, stats, career hints, and known overrides */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LINEUP_POSITIONS, parseHeight, parsePositionLabel } from "./positions.mjs";
import { normalizeStatRow } from "./ratings-from-stats.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data", "dynasty");

/** Point-forwards: may include PG as 3rd position when apg >= 6.5 */
export const POINT_FORWARD_SLUGS = new Set([
  "lebron-james",
  "magic-johnson",
  "ben-simmons",
  "luka-doncic",
  "scottie-pippen",
  "giannis-antetokounmpo",
  "larry-bird",
  "james-harden",
  "oscar-robertson",
  "jason-kidd",
  "ben-simmons",
  "draymond-green",
  "kevin-durant",
  "julius-erving",
  "toni-kukoc",
  "lamar-odom",
]);

const POINT_FORWARD_APG = 6.5;

let overridesCache = null;
let careerHintsCache = null;

function slug(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function uniquePositions(list) {
  const out = [];
  for (const pos of list || []) {
    if (LINEUP_POSITIONS.includes(pos) && !out.includes(pos)) out.push(pos);
  }
  return out;
}

function isGuard(pos) {
  return pos === "PG" || pos === "SG";
}

function isBig(pos) {
  return pos === "PF" || pos === "C";
}

export function loadPositionOverrides() {
  if (overridesCache) return overridesCache;
  const p = path.join(DATA_DIR, "position-overrides.json");
  overridesCache = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
  return overridesCache;
}

export function loadCareerPositionHints() {
  if (careerHintsCache) return careerHintsCache;
  const p = path.join(DATA_DIR, "player-careers.json");
  if (!fs.existsSync(p)) {
    careerHintsCache = new Map();
    return careerHintsCache;
  }
  const careers = JSON.parse(fs.readFileSync(p, "utf8"));
  careerHintsCache = new Map(
    careers.map((c) => [
      c.name.toLowerCase(),
      { primaryPosition: c.primaryPosition, positions: c.positions || [c.primaryPosition] },
    ])
  );
  return careerHintsCache;
}

function extractStats(player) {
  if (!player?.stats) return null;
  try {
    return normalizeStatRow(player.stats);
  } catch {
    return null;
  }
}

function statApg(player, stats) {
  if (stats?.apg != null) return stats.apg;
  const raw = player?.stats?.AST ?? player?.stats?.ast;
  const gp = Math.max(1, Number(player?.stats?.GP ?? player?.stats?.gp ?? 1));
  if (Number.isFinite(raw)) {
    const n = Number(raw);
    return n > gp * 2 ? n / gp : n;
  }
  return player?.ratings?.playmaking != null ? (player.ratings.playmaking - 40) / 6 : null;
}

function statRpg(player, stats) {
  if (stats?.rpg != null) return stats.rpg;
  const raw = player?.stats?.REB ?? player?.stats?.trb ?? player?.stats?.reb;
  const gp = Math.max(1, Number(player?.stats?.GP ?? player?.stats?.gp ?? 1));
  if (Number.isFinite(raw)) {
    const n = Number(raw);
    return n > gp * 2 ? n / gp : n;
  }
  return player?.ratings?.rebounding != null ? (player.ratings.rebounding - 40) / 5 : null;
}

/** Height-based position candidates before refinement */
function heightCandidates(height, apg, rpg, playerSlug) {
  if (height == null) return null;

  if (height >= 84) return ["PF", "C"];
  if (height >= 82) {
    if (rpg != null && rpg >= 9) return ["PF", "C"];
    return ["PF", "SF"];
  }
  if (height >= 80) {
    const base = ["SF", "PF"];
    if (POINT_FORWARD_SLUGS.has(playerSlug) && apg != null && apg >= POINT_FORWARD_APG) {
      return ["SF", "PF", "PG"];
    }
    if (apg != null && apg >= 7 && rpg != null && rpg >= 6) return ["SF", "PF", "PG"];
    return base;
  }
  if (height >= 78) {
    if (apg != null && apg >= 6) return ["SG", "SF", "PG"];
    if (rpg != null && rpg >= 7) return ["SF", "PF"];
    return ["SG", "SF"];
  }
  if (height >= 76) {
    if (apg != null && apg >= 5) return ["PG", "SG"];
    if (rpg != null && rpg >= 8) return ["SF", "PF"];
    return ["PG", "SG", "SF"];
  }
  if (height <= 74) return ["PG", "SG"];
  return ["PG", "SG", "SF"];
}

function mergeWithLabel(candidates, labelPositions) {
  const merged = uniquePositions([...labelPositions, ...candidates]);
  if (!merged.length) return candidates || labelPositions;
  return merged;
}

function filterByHeight(positions, height) {
  if (height == null) return uniquePositions(positions);
  let out = uniquePositions(positions);

  if (height >= 84) out = out.filter((pos) => !isGuard(pos) && pos !== "SF");
  else if (height >= 82) out = out.filter((pos) => !isGuard(pos));
  else if (height >= 80) {
    const isPointForward = out.includes("PG") && out.some((p) => p === "SF" || p === "PF");
    out = out.filter((pos) => pos !== "PG" || isPointForward);
  }

  if (height <= 72) out = out.filter((pos) => pos !== "C");
  if (height <= 74) out = out.filter((pos) => !isBig(pos));

  return out;
}

function heightFallback(height) {
  if (height == null) return ["SF"];
  if (height >= 84) return ["PF", "C"];
  if (height >= 82) return ["PF"];
  if (height >= 80) return ["SF", "PF"];
  if (height <= 74) return ["PG", "SG"];
  if (height <= 76) return ["PG", "SG"];
  return ["SF"];
}

function pickPrimaryFromList(list, height, apg, playerSlug, careerHint) {
  if (careerHint?.primaryPosition && list.includes(careerHint.primaryPosition)) {
    return careerHint.primaryPosition;
  }

  if (height != null && height >= 84 && list.includes("C")) return "C";
  if (height != null && height >= 82 && list.includes("PF")) return "PF";
  if (height != null && height >= 80 && height <= 81) {
    if (list.includes("SF")) return "SF";
    if (list.includes("PF")) return "PF";
  }
  if (height != null && height <= 74 && list.includes("PG")) return "PG";
  if (apg != null && apg >= 7 && list.includes("PG") && height != null && height <= 81) {
    return list.includes("SF") ? "SF" : "PG";
  }
  if (POINT_FORWARD_SLUGS.has(playerSlug) && list.includes("SF")) return "SF";

  return list[0];
}

/**
 * Infer realistic positions for a player row.
 * @param {object} player — may include height/hgt, positions, posLabel, stats, ratings, name, id
 * @returns {{ positions: string[], primaryPosition: string }}
 */
export function inferPositions(player) {
  const playerSlug = player.id?.split("-")[0] === player.id
    ? slug(player.name)
    : slug(player.name) || player.id?.replace(/-[^-]+-\d+$/, "") || slug(player.name);

  const overrides = loadPositionOverrides();
  if (overrides[playerSlug]) {
    const o = overrides[playerSlug];
    return {
      positions: uniquePositions(o.positions),
      primaryPosition: o.primaryPosition || o.positions[0],
    };
  }

  const height = parseHeight(player.height ?? player.hgt);
  const stats = extractStats(player);
  const apg = statApg(player, stats);
  const rpg = statRpg(player, stats);

  const rawLabel =
    player.posLabel || player.pos || player.position || (player.positions?.length ? null : "F");
  const labelPositions = player.positions?.length
    ? uniquePositions(player.positions)
    : parsePositionLabel(rawLabel || "F");

  const careerHint = loadCareerPositionHints().get(String(player.name || "").toLowerCase());

  let positions = labelPositions;

  const heightBased = heightCandidates(height, apg, rpg, playerSlug);
  if (heightBased) {
    positions = mergeWithLabel(heightBased, labelPositions);
    positions = filterByHeight(positions, height);
  }

  if (careerHint?.positions?.length) {
    positions = uniquePositions([
      ...careerHint.positions.filter((p) => {
        const filtered = filterByHeight([p], height);
        return filtered.length > 0;
      }),
      ...positions,
    ]);
  }

  positions = filterByHeight(positions, height);

  if (!positions.length) {
    positions = heightFallback(height);
  }

  // Point-forward PG only as 3rd slot
  if (height != null && height >= 80 && positions.includes("PG")) {
    const canPg =
      POINT_FORWARD_SLUGS.has(playerSlug) ||
      (apg != null && apg >= POINT_FORWARD_APG && (positions.includes("SF") || positions.includes("PF")));
    if (!canPg) {
      positions = positions.filter((p) => p !== "PG");
    } else {
      const withoutPg = positions.filter((p) => p !== "PG");
      positions = uniquePositions([...withoutPg.slice(0, 2), "PG"]);
    }
  }

  if (!positions.length) {
    positions = careerHint?.positions?.length
      ? filterByHeight(careerHint.positions, height)
      : heightFallback(height);
  }
  if (!positions.length) positions = heightFallback(height);

  const primaryPosition = pickPrimaryFromList(positions, height, apg, playerSlug, careerHint);

  return { positions: uniquePositions(positions), primaryPosition };
}

export function applyCareerPositionHints(player, career) {
  if (!career?.positions?.length) return player;
  const height = parseHeight(player.height ?? player.hgt);
  let positions = uniquePositions([
    ...career.positions,
    ...(player.positions || []),
  ]);
  positions = filterByHeight(positions, height);
  if (!positions.length) positions = filterByHeight(career.positions, height);
  if (!positions.length) positions = career.positions;

  return {
    ...player,
    positions,
    primaryPosition: career.primaryPosition && positions.includes(career.primaryPosition)
      ? career.primaryPosition
      : positions[0],
  };
}
