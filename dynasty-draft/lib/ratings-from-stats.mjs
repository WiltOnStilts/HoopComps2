/** Derive DynastyDraft ratings from per-game or advanced stats */

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function scale(val, lo, hi, outLo = 40, outHi = 99) {
  if (hi <= lo) return Math.round((outLo + outHi) / 2);
  const t = (val - lo) / (hi - lo);
  return clamp(Math.round(outLo + t * (outHi - outLo)), outLo, outHi);
}

/** NBA API LeagueDashPlayerStats row or BBGM stat row */
export function ratingsFromStatRow(row, positions = ["SF"]) {
  const gp = Math.max(1, Number(row?.GP ?? row?.gp ?? 1));
  const per = Number(row?.per);
  const obpm = Number(row?.obpm);
  const dbpm = Number(row?.dbpm);

  if (Number.isFinite(per) || Number.isFinite(obpm)) {
    const ppg = Number(row.pts || 0) / gp;
    let scoring = scale(ppg, 10, 33, 52, 99);
    if (ppg >= 27) scoring = Math.min(99, scoring + 4);
    if (ppg >= 30) scoring = Math.min(99, scoring + 3);
    const shooting = scale(row.fga ? Number(row.fg || 0) / Number(row.fga) : 0.45, 0.35, 0.58);
    const playmaking = scale(Number(row.ast || 0) / gp, 1, 10);
    const rebounding = scale(
      Number(row.trb || row.reb || Number(row.orb || 0) + Number(row.drb || 0)) / gp,
      1,
      12
    );
    const defense = scale((Number.isFinite(dbpm) ? dbpm : 0) + 2.5, -2, 4.5);
    const health = scale(Number(row.gp || row.GP || 50), 20, 82, 55, 99);
    const impact = scale(
      Number.isFinite(obpm) ? obpm + (Number.isFinite(dbpm) ? dbpm : 0) * 0.5 : per,
      5,
      28,
      45,
      99
    );
    return {
      scoring: clamp(scoring, 40, 99),
      shooting: clamp(shooting, 40, 99),
      defense: clamp(defense, 40, 99),
      playmaking: clamp(playmaking, 40, 99),
      rebounding: clamp(rebounding, 40, 99),
      health,
      impact: clamp(impact, 40, 99),
    };
  }

  const pts = Number(row?.PTS ?? row?.pts ?? 0) / gp;
  const reb = Number(row?.REB ?? row?.trb ?? row?.reb ?? 0) / gp;
  const ast = Number(row?.AST ?? row?.ast ?? 0) / gp;
  const stl = Number(row?.STL ?? row?.stl ?? 0) / gp;
  const blk = Number(row?.BLK ?? row?.blk ?? 0) / gp;
  const fgPct = Number(row?.FG_PCT ?? (row?.fga ? row.fg / row.fga : 0.45));
  const fg3Pct = Number(row?.FG3_PCT ?? (row?.tpa ? row.tp / row.tpa : 0));
  const ftPct = Number(row?.FT_PCT ?? (row?.fta ? row.ft / row.fta : 0.75));
  const min = Number(row?.MIN ?? row?.min ?? gp * 20) / gp;

  // Scoring: 10–33 PPG maps to ~55–99; elite 27+ PPG lands in low 90s
  let scoring = scale(pts, 10, 33, 52, 99);
  if (pts >= 27) scoring = Math.min(99, scoring + 4);
  if (pts >= 30) scoring = Math.min(99, scoring + 3);

  const shooting = scale(fgPct * 0.55 + fg3Pct * 0.25 + ftPct * 0.2, 0.35, 0.62);
  const playmaking = scale(ast, 0.5, 10);
  const rebounding = scale(reb, 0.5, 12);
  const defense = scale(stl * 2.2 + blk * 2, 0.3, 4.5);
  const health = scale(Math.min(gp, 82), 20, 82, 55, 99);
  const usageBoost = scale(min, 10, 38, 0, 10);
  const impact = clamp(
    Math.round(scoring * 0.3 + shooting * 0.1 + defense * 0.18 + playmaking * 0.14 + rebounding * 0.12 + usageBoost),
    40,
    99
  );

  const pos = positions[0];
  if (pos === "C" || pos === "PF") {
    return {
      scoring,
      shooting,
      defense: clamp(defense + 2, 40, 99),
      playmaking,
      rebounding: clamp(rebounding + 4, 40, 99),
      health,
      impact,
    };
  }
  if (pos === "PG") {
    return {
      scoring,
      shooting,
      defense,
      playmaking: clamp(playmaking + 4, 40, 99),
      rebounding: clamp(rebounding - 4, 40, 99),
      health,
      impact,
    };
  }
  return { scoring, shooting, defense, playmaking, rebounding, health, impact };
}

/** @deprecated alias */
export const ratingsFromNbaApiStats = ratingsFromStatRow;
