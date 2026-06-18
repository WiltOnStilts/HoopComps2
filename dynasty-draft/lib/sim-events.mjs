/** Generate injuries, player performances, blowouts, and upsets during simulation */

function pickWeighted(rng, lineup, weightFn) {
  const weights = lineup.map((e) => Math.max(0.1, weightFn(e)));
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = rng() * total;
  for (let i = 0; i < lineup.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return lineup[i];
  }
  return lineup[0];
}

export function injuryRisk(player) {
  const health = player?.ratings?.health ?? 80;
  const age = player?.age ?? 27;
  const exp = player?.experience ?? 5;
  let risk = (100 - health) / 280;
  if (age >= 34) risk += 0.06;
  else if (age >= 30) risk += 0.03;
  if (exp <= 2) risk += 0.02;
  return Math.min(0.22, Math.max(0.015, risk));
}

export function maybeInjuryEvent(lineup, game, rng, existing) {
  if (existing.some((i) => i.game === game)) return null;
  for (const entry of lineup) {
    const p = entry.player;
    if (!p || rng() > injuryRisk(p)) continue;
    const weeks = 1 + Math.floor(rng() * 5);
    const severity = weeks >= 4 ? "major" : weeks >= 2 ? "moderate" : "minor";
    return {
      game,
      player: p.name,
      slot: entry.slot,
      weeks,
      severity,
      health: p.ratings?.health ?? 80,
    };
  }
  return null;
}

export function simulatePlayerLine(stats, rng, type) {
  const r = stats;
  const mult = type === "career" ? 1.35 + rng() * 0.25 : type === "cold" ? 0.45 + rng() * 0.25 : 1;
  const pts = Math.max(
    type === "cold" ? 4 : 18,
    Math.round(((r.scoring || 70) / 99) * 32 * mult + rng() * 8)
  );
  const reb = Math.max(0, Math.round(((r.rebounding || 50) / 99) * 14 * mult));
  const ast = Math.max(0, Math.round(((r.playmaking || 50) / 99) * 12 * mult));
  return { pts, reb, ast };
}

export function pickStarPerformance(lineup, rng, type) {
  const entry =
    type === "career"
      ? pickWeighted(rng, lineup, (e) => e.player?.ratings?.scoring || 70)
      : pickWeighted(rng, lineup, () => 1);
  const line = simulatePlayerLine(entry.player?.ratings || {}, rng, type);
  return {
    type,
    player: entry.player?.name || "Unknown",
    slot: entry.slot,
    game: 0,
    ...line,
  };
}

export function createSeasonEventCollector() {
  return {
    injuries: [],
    playerGames: [],
    blowouts: [],
    upsets: [],
  };
}
