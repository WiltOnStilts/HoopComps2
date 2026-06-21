/** Post-process all ratings so elite seasons match real NBA dominance (applied at load time). */

const STAT_KEYS = ["scoring", "shooting", "defense", "playmaking", "rebounding", "health"];

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

const ELITE_FLOORS = {
  PG: { scoring: 88, playmaking: 90, defense: 74, shooting: 78, rebounding: 52, health: 84 },
  SG: { scoring: 90, playmaking: 78, defense: 76, shooting: 84, rebounding: 50, health: 84 },
  SF: { scoring: 88, playmaking: 76, defense: 78, shooting: 80, rebounding: 56, health: 84 },
  PF: { scoring: 86, playmaking: 70, defense: 80, rebounding: 86, shooting: 70, health: 82 },
  C: { scoring: 92, playmaking: 62, defense: 82, rebounding: 88, shooting: 52, health: 82 },
};

function applyFloors(r, pos, margin = 0) {
  const f = ELITE_FLOORS[pos] || ELITE_FLOORS.SF;
  for (const key of STAT_KEYS) {
    const floor = f[key];
    if (floor && r[key] < floor - margin) {
      r[key] = Math.min(99, Math.max(r[key], floor - margin));
    }
  }
}

function liftUnderrated(r, threshold, factor = 0.5, cap = 97, skipKeys = []) {
  for (const key of STAT_KEYS) {
    if (skipKeys.includes(key)) continue;
    if (r[key] < threshold) {
      r[key] = Math.min(cap, r[key] + Math.ceil((threshold - r[key]) * factor));
    }
  }
}

export function calibrateRatings(player) {
  if (!player?.ratings) return player.ratings;

  const r = { ...player.ratings };
  const pos = player.primaryPosition || player.positions?.[0] || "SF";
  const impact = r.impact || 70;
  const starSeason =
    player.allStar ||
    impact >= 84 ||
    r.scoring >= 84 ||
    (r.scoring >= 78 && r.rebounding >= 88) ||
    (r.playmaking >= 90 && r.scoring >= 72);
  const elite = starSeason && impact >= 82;
  const superElite = starSeason && impact >= 86;
  const legend = starSeason && impact >= 90;

  const skipDefenseLift =
    ["PG", "SG"].includes(pos) && r.defense < 82;

  if (elite) applyFloors(r, pos, superElite ? 0 : 2);
  if (superElite) liftUnderrated(r, 84, 0.45, 96, skipDefenseLift ? ["defense"] : []);
  if (legend) liftUnderrated(r, 88, 0.55, 99, skipDefenseLift ? ["defense"] : []);

  if (legend) {
    liftUnderrated(r, 90, 0.65, 99, skipDefenseLift ? ["defense"] : []);
    applyFloors(r, pos, 0);
  }

  // Elite two-way bigs (Shaq, Hakeem tier)
  if (pos === "C" && r.rebounding >= 85) {
    r.defense = Math.min(95, Math.max(r.defense, r.rebounding - 10));
    if (r.scoring < 94) r.scoring = Math.min(98, r.scoring + 6);
  }

  // Elite playmakers (Magic, CP3 tier)
  if (pos === "PG" && r.playmaking >= 88) {
    r.playmaking = Math.min(99, r.playmaking + 3);
    r.scoring = Math.min(95, Math.max(r.scoring, r.playmaking - 8));
  }

  // Elite shooters (Reggie, Curry, Dame tier)
  if (r.shooting >= 84) {
    r.shooting = Math.min(99, r.shooting + (r.shooting >= 92 ? 4 : r.shooting >= 88 ? 3 : 2));
  }
  if (["PG", "SG", "SF"].includes(pos) && r.scoring >= 88 && r.shooting < 88) {
    r.shooting = Math.min(92, r.shooting + 4);
  }

  // Lockdown defenders (Pippen, GP tier)
  if (r.defense >= 84 && ["SG", "SF", "PF"].includes(pos)) {
    r.defense = Math.min(97, r.defense + 5);
  }

  // Elite passers beyond PG
  if (r.playmaking >= 82) {
    r.playmaking = Math.min(99, r.playmaking + 3);
  }

  // Rebounding machines
  if (r.rebounding >= 88) {
    r.rebounding = Math.min(99, r.rebounding + 2);
  }


  // Volume scorers
  if (r.scoring >= 90 && ["PG", "SG", "SF"].includes(pos)) {
    r.scoring = Math.min(99, r.scoring + 2);
  }

  // Bigs: don't crater shooting for paint specialists
  if (pos === "C" && r.scoring >= 90 && r.shooting < 65) {
    r.shooting = clamp(r.shooting + 8, 40, 72);
  }

  // All-stars play heavy minutes
  if (elite && r.health < 86) {
    r.health = Math.min(95, r.health + 6);
  }

  const blended = Math.round(
    r.scoring * 0.26 +
      r.shooting * 0.1 +
      r.defense * 0.18 +
      r.playmaking * 0.16 +
      r.rebounding * 0.14 +
      r.health * 0.06 +
      impact * 0.1
  );
  r.impact = clamp(Math.max(impact, blended), 40, 99);

  const out = {};
  for (const key of STAT_KEYS) {
    out[key] = clamp(r[key], 40, 99);
  }
  out.impact = r.impact;
  return out;
}

export function withCalibratedRatings(player) {
  if (!player) return player;
  return { ...player, ratings: calibrateRatings(player) };
}
