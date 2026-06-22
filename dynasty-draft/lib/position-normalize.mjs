/** Server-side position normalization (uses Node fs via position-inference). */

import { inferPositions } from "./position-inference.mjs";
import { parseHeight } from "./positions.mjs";

/** Normalize stored positions on import / roster generation */
export function normalizePlayerPositions(player) {
  const height = parseHeight(player.height ?? player.hgt);
  const ratings = player.ratings || null;
  const inferred = inferPositions({ ...player, height, ratings });

  const normalized = {
    ...player,
    positions: inferred.positions,
    primaryPosition: inferred.primaryPosition,
  };

  if (height != null) normalized.height = height;
  else delete normalized.height;

  return normalized;
}
