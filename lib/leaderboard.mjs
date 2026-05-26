/** Build public leaderboard rows from synced user state */

import { uniqueScoutCount, migrateScanTracking } from "./card-fingerprint.mjs";

export function buildLeaderboardEntry(name, state) {
  migrateScanTracking(state);
  const scoutCount = uniqueScoutCount(state);
  if (scoutCount <= 0) return null;
  return {
    name: name || state?.profile?.displayName || "Scout",
    scoutCount,
    cardCount: (state?.collection || []).length,
    streak: state?.streak || 0,
  };
}

export function sortLeaderboardEntries(entries, limit = 15) {
  return entries
    .filter(Boolean)
    .sort((a, b) => {
      if (b.scoutCount !== a.scoutCount) return b.scoutCount - a.scoutCount;
      return (b.streak || 0) - (a.streak || 0);
    })
    .slice(0, limit);
}
