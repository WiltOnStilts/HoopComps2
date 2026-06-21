/** Server-side position normalization (uses Node fs via position-inference). */

import { inferPositions } from "./position-inference.mjs";
import {
  applyHeightCaps,
  parseHeight,
  parsePositionLabel,
  refinePositions,
} from "./positions.mjs";

const LINEUP_POSITIONS = ["PG", "SG", "SF", "PF", "C"];

function uniquePositions(list) {
  const out = [];
  for (const pos of list || []) {
    if (LINEUP_POSITIONS.includes(pos) && !out.includes(pos)) out.push(pos);
  }
  return out;
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

function pickPrimary(positions, height = null) {
  const list = uniquePositions(positions);
  if (!list.length) return "SF";

  if (height != null && height >= 80 && height <= 81) {
    if (list.includes("SF")) return "SF";
    if (list.includes("PF")) return "PF";
  }
  if (height != null && height >= 82 && list.includes("PF")) return "PF";
  if (height != null && height >= 84 && list.includes("C")) return "C";
  if (height != null && height <= 74 && list.includes("PG")) return "PG";
  if (list.includes("PG") && (list.includes("SF") || list.includes("PF"))) {
    return list.includes("SF") ? "SF" : "PF";
  }
  return list[0];
}

/** Normalize stored positions on import / roster generation */
export function normalizePlayerPositions(player) {
  const height = parseHeight(player.height ?? player.hgt);
  const ratings = player.ratings || null;
  const rawPositions =
    player.positions?.length > 0
      ? uniquePositions(player.positions)
      : parsePositionLabel(player.posLabel || player.pos || player.position);

  let positions = refinePositions(rawPositions, { height, ratings });
  positions = applyHeightCaps(positions, height);

  const inferred = inferPositions({ ...player, height, positions, ratings });
  positions = inferred.positions;

  if (!positions.length) {
    positions = heightFallbackPositions(height);
  }

  const normalized = {
    ...player,
    positions,
    primaryPosition: inferred.primaryPosition || pickPrimary(positions, height),
  };

  if (height != null) normalized.height = height;
  else delete normalized.height;

  return normalized;
}
