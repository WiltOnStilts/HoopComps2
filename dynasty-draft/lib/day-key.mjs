/** UTC day key — shared by daily challenge and leaderboard */

export function getDayKey(date = new Date()) {
  const now = date instanceof Date ? date : new Date(date);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}
