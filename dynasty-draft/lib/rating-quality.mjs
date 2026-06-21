/** Detect placeholder / missing-stat ratings so we never prefer them over real data. */

const PLACEHOLDER_SIGNATURES = [
  { scoring: 66, shooting: 66, defense: 66, playmaking: 64, rebounding: 66, impact: 66 },
  { scoring: 68, shooting: 67, defense: 64, playmaking: 68, rebounding: 60, impact: 66 },
  { scoring: 64, shooting: 62, defense: 70, playmaking: 62, rebounding: 72, impact: 66 },
];

export function isPlaceholderRatings(ratings) {
  if (!ratings) return true;
  const { scoring, shooting, defense, playmaking, rebounding, impact } = ratings;
  if ([scoring, shooting, defense, playmaking, rebounding, impact].some((v) => !Number.isFinite(v))) {
    return true;
  }
  if (PLACEHOLDER_SIGNATURES.some(
    (sig) =>
      sig.scoring === scoring &&
      sig.shooting === shooting &&
      sig.defense === defense &&
      sig.playmaking === playmaking &&
      sig.rebounding === rebounding &&
      sig.impact === impact
  )) {
    return true;
  }
  // NBA API default_ratings for guards (68/67/64/68/60/66) and generic 66 flats
  if (impact >= 64 && impact <= 68 && scoring >= 64 && scoring <= 70 && shooting >= 62 && shooting <= 68) {
    const flat = Math.max(scoring, shooting, defense, playmaking, rebounding) -
      Math.min(scoring, shooting, defense, playmaking, rebounding);
    if (flat <= 10) return true;
  }
  return false;
}

const SOURCE_RANK = {
  "bbgm-stats": 5,
  "nba-api": 4,
  "bbgm-snapshot": 3,
  snapshot: 3,
  "career-fallback": 1,
};

/** Higher = prefer this row when merging duplicate player-seasons. */
export function ratingRowQuality(player) {
  if (!player?.ratings) return -1;
  if (isPlaceholderRatings(player.ratings)) return 0;
  const base = SOURCE_RANK[player.source] ?? 2;
  const spread =
    Math.max(
      player.ratings.scoring,
      player.ratings.shooting,
      player.ratings.defense,
      player.ratings.playmaking,
      player.ratings.rebounding,
      player.ratings.impact
    ) -
    Math.min(
      player.ratings.scoring,
      player.ratings.shooting,
      player.ratings.defense,
      player.ratings.playmaking,
      player.ratings.rebounding,
      player.ratings.impact
    );
  return base * 100 + spread + (player.ratings.impact || 0) * 0.01;
}
