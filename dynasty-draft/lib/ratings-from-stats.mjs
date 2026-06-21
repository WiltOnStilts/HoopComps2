/** Derive DynastyDraft ratings from per-game or advanced stats (NBA API + BBGM). */

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function scale(val, lo, hi, outLo = 40, outHi = 99) {
  if (hi <= lo) return Math.round((outLo + outHi) / 2);
  const t = (val - lo) / (hi - lo);
  return clamp(Math.round(outLo + t * (outHi - outLo)), outLo, outHi);
}

/** Map a stat to 40–99 using anchor points (linear between knots). */
function rateAnchors(value, anchors) {
  if (!Number.isFinite(value)) return anchors[0][1];
  if (value <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (value <= x1) {
      const t = (value - x0) / (x1 - x0);
      return clamp(Math.round(y0 + t * (y1 - y0)), 40, 99);
    }
  }
  return anchors[anchors.length - 1][1];
}

/** @returns {boolean} BBGM stat rows store season totals; NBA API rows are usually per-game. */
function isBbgmStatRow(row) {
  return row != null && (row.season != null || row.tid != null) && row.gp != null;
}

function perGameValue(raw, gp, { forceTotal = false } = {}) {
  if (!Number.isFinite(raw)) return 0;
  if (forceTotal || raw > gp * 2.5) return raw / gp;
  return raw;
}

function usesSeasonTotals(row, gp, bbgm) {
  if (bbgm) return true;
  const rawPts = Number(row?.PTS ?? row?.pts);
  return Number.isFinite(rawPts) && rawPts > gp * 4;
}

/** Normalize NBA API or BBGM stat rows into per-game rates. */
export function normalizeStatRow(row) {
  const gp = Math.max(1, Number(row?.GP ?? row?.gp ?? 1));
  const bbgm = isBbgmStatRow(row);
  const seasonTotals = usesSeasonTotals(row, gp, bbgm);

  let ppg = 0;
  const rawPts = Number(row?.PTS ?? row?.pts);
  if (Number.isFinite(rawPts) && rawPts > 0) {
    ppg = seasonTotals ? rawPts / gp : perGameValue(rawPts, gp);
  } else if (row?.fg != null) {
    const fg = Number(row.fg || 0);
    const tp = Number(row.tp || 0);
    const ft = Number(row.ft || 0);
    ppg = (fg * 2 + tp + ft) / gp;
  }

  const rawReb = Number(row?.REB ?? row?.trb ?? row?.reb);
  let rpg = 0;
  if (Number.isFinite(rawReb)) {
    rpg = seasonTotals ? rawReb / gp : perGameValue(rawReb, gp);
  } else {
    rpg = (Number(row?.orb || 0) + Number(row?.drb || 0)) / gp;
  }

  const rawAst = Number(row?.AST ?? row?.ast);
  const apg = Number.isFinite(rawAst) ? (seasonTotals ? rawAst / gp : perGameValue(rawAst, gp)) : 0;

  const rawStl = Number(row?.STL ?? row?.stl);
  const spg = Number.isFinite(rawStl) ? (seasonTotals ? rawStl / gp : perGameValue(rawStl, gp)) : 0;

  const rawBlk = Number(row?.BLK ?? row?.blk);
  const bpg = Number.isFinite(rawBlk) ? (seasonTotals ? rawBlk / gp : perGameValue(rawBlk, gp)) : 0;

  const fga = Number(row?.FGA ?? row?.fga ?? 0);
  const fg = Number(row?.FG ?? row?.fg ?? 0);
  const tpa = Number(row?.FG3A ?? row?.tpa ?? 0);
  const tp = Number(row?.FG3 ?? row?.tp ?? 0);
  const fta = Number(row?.FTA ?? row?.fta ?? 0);
  const ft = Number(row?.FT ?? row?.ft ?? 0);

  let fgPct = Number(row?.FG_PCT);
  if (!Number.isFinite(fgPct) && fga > 0) fgPct = fg / fga;

  let fg3Pct = Number(row?.FG3_PCT);
  if (!Number.isFinite(fg3Pct) && tpa > 0) fg3Pct = tp / tpa;

  let ftPct = Number(row?.FT_PCT);
  if (!Number.isFinite(ftPct) && fta > 0) ftPct = ft / fta;

  const rawMin = Number(row?.MIN ?? row?.min);
  const mpg = Number.isFinite(rawMin) ? (bbgm ? rawMin / gp : perGameValue(rawMin, gp, { forceTotal: rawMin > 200 })) : 20;

  const per = Number(row?.PER ?? row?.per);
  const obpm = Number(row?.OBPM ?? row?.obpm);
  const dbpm = Number(row?.DBPM ?? row?.dbpm);

  const tsAttempts = fga + 0.44 * fta;
  const tsPct = tsAttempts > 0 ? (fg * 2 + tp + ft) / (2 * tsAttempts) : fgPct || 0.45;
  const efgPct = fga > 0 ? (fg + 0.5 * tp) / fga : fgPct || 0.45;
  const tpaPg = tpa / gp;
  const tpmPg = tp / gp;

  return {
    gp,
    ppg,
    rpg,
    apg,
    spg,
    bpg,
    fgPct: Number.isFinite(fgPct) ? fgPct : 0.45,
    fg3Pct: Number.isFinite(fg3Pct) ? fg3Pct : 0,
    ftPct: Number.isFinite(ftPct) ? ftPct : 0.75,
    efgPct,
    tpaPg,
    tpmPg,
    mpg,
    tsPct,
    per: Number.isFinite(per) ? per : null,
    obpm: Number.isFinite(obpm) ? obpm : null,
    dbpm: Number.isFinite(dbpm) ? dbpm : null,
  };
}

function rateScoring(ppg) {
  return rateAnchors(ppg, [
    [0, 40],
    [5, 50],
    [10, 62],
    [15, 72],
    [18, 78],
    [22, 85],
    [25, 90],
    [28, 94],
    [32, 97],
    [36, 99],
  ]);
}

function rateShooting(stats) {
  const { tsPct, efgPct, fg3Pct, ftPct, tpaPg, tpmPg } = stats;
  let blend = tsPct * 0.5 + efgPct * 0.2 + fg3Pct * 0.18 + ftPct * 0.12;

  // Reward high-volume deep shooters (Curry, Dame, Klay tier)
  if (tpaPg >= 5 && fg3Pct >= 0.355) blend += 0.02;
  if (tpaPg >= 7 && fg3Pct >= 0.36) blend += 0.025;
  if (tpaPg >= 9 && fg3Pct >= 0.38) blend += 0.025;
  if (tpmPg >= 3 && fg3Pct >= 0.37) blend += 0.02;
  if (tpmPg >= 4 && fg3Pct >= 0.39) blend += 0.03;

  return rateAnchors(blend, [
    [0.4, 45],
    [0.48, 58],
    [0.52, 68],
    [0.56, 78],
    [0.58, 84],
    [0.62, 90],
    [0.66, 95],
    [0.7, 99],
  ]);
}

function ratePlaymaking(apg) {
  return rateAnchors(apg, [
    [0, 40],
    [1, 52],
    [3, 65],
    [5, 75],
    [7, 85],
    [9, 92],
    [11, 97],
    [13, 99],
  ]);
}

function rateRebounding(rpg) {
  return rateAnchors(rpg, [
    [0, 40],
    [2, 52],
    [4, 62],
    [6, 72],
    [8, 82],
    [10, 90],
    [12, 95],
    [14, 99],
  ]);
}

function rateDefense(stats, pos = "SF") {
  const { spg, bpg, dbpm } = stats;
  const stocks = spg * 1.35 + bpg * 1.75;
  let fromStocks = rateAnchors(stocks, [
    [0, 40],
    [0.5, 52],
    [1.0, 60],
    [1.6, 68],
    [2.2, 76],
    [2.8, 84],
    [3.5, 91],
    [4.5, 97],
    [5.5, 99],
  ]);
  if (dbpm != null) {
    const fromBpm = rateAnchors(dbpm, [
      [-3, 40],
      [-1, 52],
      [0, 62],
      [1, 72],
      [2, 82],
      [3, 90],
      [4, 96],
      [5, 99],
    ]);
    fromStocks = Math.round(fromStocks * 0.4 + fromBpm * 0.6);
  } else if (pos === "PG" || pos === "SG") {
    if (stocks < 2.4) fromStocks = Math.min(fromStocks, 74);
    else if (stocks < 3.6) fromStocks = Math.min(fromStocks, 78);
  } else if (pos === "SF" && stocks < 2.6) {
    fromStocks = Math.min(fromStocks, 84);
  }
  return clamp(fromStocks, 40, 99);
}

function rateHealth(gp) {
  return rateAnchors(Math.min(gp, 82), [
    [20, 55],
    [40, 65],
    [55, 72],
    [65, 78],
    [72, 85],
    [78, 92],
    [82, 99],
  ]);
}

function rateImpact(stats, skills) {
  if (stats.obpm != null) {
    const bpm = stats.obpm + (stats.dbpm != null ? stats.dbpm * 0.5 : 0);
    return rateAnchors(bpm, [
      [-4, 40],
      [-1, 52],
      [1, 65],
      [3, 78],
      [5, 88],
      [7, 94],
      [9, 97],
      [11, 99],
    ]);
  }
  if (stats.per != null) {
    return rateAnchors(stats.per, [
      [5, 40],
      [10, 52],
      [15, 65],
      [18, 72],
      [22, 82],
      [25, 90],
      [28, 96],
      [32, 99],
    ]);
  }
  return clamp(
    Math.round(
      skills.scoring * 0.28 +
        skills.shooting * 0.1 +
        skills.defense * 0.2 +
        skills.playmaking * 0.16 +
        skills.rebounding * 0.14 +
        rateAnchors(stats.mpg, [
          [10, 40],
          [20, 55],
          [28, 70],
          [34, 82],
          [38, 92],
        ]) *
          0.12
    ),
    40,
    99
  );
}

function applyPositionTweaks(ratings, pos) {
  const r = { ...ratings };
  if (pos === "C" || pos === "PF") {
    r.rebounding = clamp(r.rebounding + 3, 40, 99);
    r.defense = clamp(r.defense + 2, 40, 99);
  }
  if (pos === "PG") {
    r.playmaking = clamp(r.playmaking + 3, 40, 99);
    r.rebounding = clamp(r.rebounding - 3, 40, 99);
  }
  if (pos === "SG") {
    r.shooting = clamp(r.shooting + 1, 40, 99);
  }
  return r;
}

/** Build ratings from a normalized stat row + position. */
export function ratingsFromNormalized(stats, positions = ["SF"]) {
  const pos = positions[0] || "SF";
  const skills = {
    scoring: rateScoring(stats.ppg),
    shooting: rateShooting(stats),
    playmaking: ratePlaymaking(stats.apg),
    rebounding: rateRebounding(stats.rpg),
    defense: rateDefense(stats, pos),
    health: rateHealth(stats.gp),
  };
  skills.impact = rateImpact(stats, skills);
  return applyPositionTweaks(skills, positions[0] || "SF");
}

/** NBA API LeagueDashPlayerStats row or BBGM stat row */
export function ratingsFromStatRow(row, positions = ["SF"]) {
  if (!row) {
    return {
      scoring: 55,
      shooting: 55,
      defense: 55,
      playmaking: 55,
      rebounding: 55,
      health: 75,
      impact: 55,
    };
  }
  return ratingsFromNormalized(normalizeStatRow(row), positions);
}

/** @deprecated alias */
export const ratingsFromNbaApiStats = ratingsFromStatRow;
