/** Position inference from height, stats, career hints, and known overrides */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  LINEUP_POSITIONS,
  POINT_FORWARD_SLUGS,
  POINT_FORWARD_APG,
  applyHeightCaps,
  applyPhysicalPositionLimits,
  applyRolePositionAdjustments,
  buildPositionContext,
  parseHeight,
  parsePositionLabel,
  pickPrimaryPositionFromRole,
  playerSlugFromName,
  refinePositions,
} from "./positions.mjs";
import { normalizeStatRow } from "./ratings-from-stats.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data", "dynasty");

export { POINT_FORWARD_SLUGS };

let overridesCache = null;
let careerHintsCache = null;

function uniquePositions(list) {
  const out = [];
  for (const pos of list || []) {
    if (LINEUP_POSITIONS.includes(pos) && !out.includes(pos)) out.push(pos);
  }
  return out;
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

function defaultCandidates(ctx) {
  const { height, apg, rpg, playerSlug } = ctx;
  if (height == null) return ["SF"];

  if (height >= 84) return ["SF", "PF", "C"];
  if (height >= 82) return ["SF", "PF"];
  if (height >= 80) {
    if (POINT_FORWARD_SLUGS.has(playerSlug) && apg != null && apg >= POINT_FORWARD_APG) {
      return ["SF", "PF", "PG"];
    }
    if (apg != null && apg >= 7 && rpg != null && rpg >= 6) return ["SF", "PF", "PG"];
    return ["SF", "PF"];
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
  return merged.length ? merged : candidates || labelPositions;
}

/**
 * Infer realistic positions for a player row.
 * @param {object} player — may include height/hgt, positions, posLabel, stats, ratings, name, id
 * @returns {{ positions: string[], primaryPosition: string }}
 */
export function inferPositions(player) {
  const playerSlug = playerSlugFromName(player.name, player.id);
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
  const careerHint = loadCareerPositionHints().get(String(player.name || "").toLowerCase());

  const rawLabel =
    player.posLabel || player.pos || player.position || (player.positions?.length ? null : "F");
  const labelPositions = player.positions?.length
    ? uniquePositions(player.positions)
    : parsePositionLabel(rawLabel || "F");

  const ctx = buildPositionContext(
    { ...player, height, stats: stats || player.stats, positions: labelPositions },
    careerHint
  );

  let positions = careerHint?.positions?.length
    ? uniquePositions(careerHint.positions)
    : refinePositions(labelPositions, {
        height,
        ratings: player.ratings,
        stats: stats || player.stats,
        name: player.name,
        id: player.id,
        careerHint,
      });

  positions = mergeWithLabel(defaultCandidates(ctx), positions);
  positions = applyPhysicalPositionLimits(positions, ctx);
  positions = applyRolePositionAdjustments(positions, ctx);

  if (!positions.length) {
    positions = applyHeightCaps(defaultCandidates(ctx), height, {
      ratings: player.ratings,
      stats: stats || player.stats,
      name: player.name,
      id: player.id,
      careerHint,
    });
  }

  // Point-forward PG only as 3rd slot
  if (height != null && height >= 80 && positions.includes("PG")) {
    const canPg =
      POINT_FORWARD_SLUGS.has(playerSlug) ||
      (ctx.apg != null &&
        ctx.apg >= POINT_FORWARD_APG &&
        (positions.includes("SF") || positions.includes("PF")));
    if (!canPg) {
      positions = positions.filter((p) => p !== "PG");
    } else {
      const withoutPg = positions.filter((p) => p !== "PG");
      positions = uniquePositions([...withoutPg.slice(0, 2), "PG"]);
    }
  }

  if (!positions.length && careerHint?.positions?.length) {
    positions = applyPhysicalPositionLimits(careerHint.positions, ctx);
    positions = applyRolePositionAdjustments(positions, ctx);
  }

  const primaryPosition = pickPrimaryPositionFromRole(positions, ctx);

  return { positions: uniquePositions(positions), primaryPosition };
}

export function applyCareerPositionHints(player, career) {
  if (!career?.positions?.length) return player;
  const ctx = buildPositionContext(player, career);
  let positions = uniquePositions([...career.positions, ...(player.positions || [])]);
  positions = applyPhysicalPositionLimits(positions, ctx);
  positions = applyRolePositionAdjustments(positions, ctx);
  if (!positions.length) positions = uniquePositions(career.positions);

  return {
    ...player,
    positions,
    primaryPosition:
      career.primaryPosition && positions.includes(career.primaryPosition)
        ? career.primaryPosition
        : pickPrimaryPositionFromRole(positions, ctx),
  };
}
