/** Convert Basketball GM roster JSON into DynastyDraft player-season rows */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ratingsFromStatRow } from "./ratings-from-stats.mjs";
import { normalizePlayerPositions, parsePositionLabel } from "./positions.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALIASES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "dynasty", "team-aliases.json"), "utf8")
);

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function slug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseBBGMJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(text.replace(/,\s*([}\]])/g, "$1"));
  }
}

export function snapshotYear(startingSeason) {
  return startingSeason >= 2020 ? startingSeason - 1 : startingSeason;
}

export function teamLabel(team) {
  if (!team) return "";
  return `${team.region || ""} ${team.name || ""}`.trim().toLowerCase();
}

export function mapBBGMTeamId(team) {
  if (!team) return null;
  const label = teamLabel(team);
  if (ALIASES.franchiseByLabel[label]) return ALIASES.franchiseByLabel[label];
  const abbr = (team.abbrev || team.abbreviation || "").toUpperCase();
  if (ALIASES.abbrevToId[abbr]) return ALIASES.abbrevToId[abbr];
  return null;
}

export function parsePositions(pos) {
  return parsePositionLabel(pos);
}

function playerHeight(player) {
  return player?.hgt ?? player?.height ?? null;
}

function finalizePlayerRow(row, sourcePlayer) {
  return normalizePlayerPositions({
    ...row,
    height: playerHeight(sourcePlayer),
    hgt: playerHeight(sourcePlayer),
  });
}

export function bbgmToDynastyRatings(r) {
  if (!r) {
    return { scoring: 65, shooting: 65, defense: 65, playmaking: 62, rebounding: 60, health: 80, impact: 65 };
  }
  const scoring = clamp(Math.round((r.ins + r.fg + r.dnk) / 3), 40, 99);
  const shooting = clamp(Math.round((r.fg + r.tp + r.ft) / 3), 40, 99);
  const defense = clamp(Math.round((r.drb + r.diq + r.stre * 0.45) / 2.45), 40, 99);
  const playmaking = clamp(Math.round((r.pss + r.oiq) / 2), 40, 99);
  const rebounding = clamp(Math.round(r.reb), 40, 99);
  const health = clamp(Math.round(r.endu), 40, 99);
  const impact = clamp(
    Math.round((scoring + shooting + defense + playmaking + rebounding) / 5),
    40,
    99
  );
  return { scoring, shooting, defense, playmaking, rebounding, health, impact };
}

function ratingForSeason(player, season) {
  const ratings = player.ratings || [];
  let match = ratings.find((r) => r.season === season);
  if (!match && ratings.length) {
    match = ratings.reduce((best, r) => {
      if (!best) return r;
      const bd = Math.abs(best.season - season);
      const rd = Math.abs(r.season - season);
      return rd < bd ? r : best;
    }, null);
  }
  return match;
}

function isAllStar(player, season) {
  return (player.awards || []).some(
    (a) => a.season === season && String(a.type || "").toLowerCase().includes("all-star")
  );
}

function experienceFor(player, year) {
  const draftYear = player.draft?.year;
  if (draftYear) return Math.max(1, year - draftYear + 1);
  const born = player.born?.year;
  if (born) return Math.max(1, year - (born + 19) + 1);
  return 3;
}

export function playerSeasonFromSnapshot(player, team, year, startingSeason) {
  const teamId = mapBBGMTeamId(team);
  if (!teamId || !player?.name) return null;

  const ratingSeason = startingSeason >= 2020 ? startingSeason - 1 : startingSeason;
  const rating = ratingForSeason(player, ratingSeason) || ratingForSeason(player, startingSeason);
  const positions = parsePositions(player.pos);
  const stat =
    (player.stats || []).find(
      (s) => !s.playoffs && s.season === year && s.gp >= 1 && s.tid === team?.tid
    ) ||
    (player.stats || []).find((s) => !s.playoffs && s.season === year && s.gp >= 1);
  const ratings =
    stat && stat.gp >= 1 ? ratingsFromStatRow(stat, positions) : bbgmToDynastyRatings(rating);
  const age = player.born?.year ? year - player.born.year : 25;

  return finalizePlayerRow(
    {
      id: `${slug(player.name)}-${teamId}-${year}`,
      name: player.name,
      teamId,
      year,
      age,
      experience: experienceFor(player, year),
      positions,
      primaryPosition: positions[0],
      allStar: isAllStar(player, ratingSeason) || isAllStar(player, year),
      ratings,
      source: stat ? "bbgm-stats" : "bbgm-snapshot",
    },
    player
  );
}

export function playerSeasonFromStat(player, teamByTid, stat) {
  const team = teamByTid.get(stat.tid);
  const teamId = mapBBGMTeamId(team);
  if (!teamId || !player?.name || stat.gp < 1) return null;

  const year = stat.season;
  const positions = parsePositions(player.pos);
  const ratings = ratingsFromStatRow(stat, positions);
  const age = player.born?.year ? year - player.born.year : 25;

  return finalizePlayerRow(
    {
      id: `${slug(player.name)}-${teamId}-${year}`,
      name: player.name,
      teamId,
      year,
      age,
      experience: experienceFor(player, year),
      positions,
      primaryPosition: positions[0],
      allStar: isAllStar(player, year),
      ratings,
      source: "bbgm-stats",
    },
    player
  );
}

export function extractSnapshotRoster(league) {
  const year = snapshotYear(league.startingSeason);
  const teamByTid = new Map((league.teams || []).map((t) => [t.tid, t]));
  const players = [];

  for (const p of league.players || []) {
    if (p.tid == null || p.tid < 0) continue;
    const team = teamByTid.get(p.tid);
    const row = playerSeasonFromSnapshot(p, team, year, league.startingSeason);
    if (row) players.push(row);
  }

  return { year, startingSeason: league.startingSeason, players };
}

export function extractStatsRoster(league, minGp = 1) {
  const teamByTid = new Map((league.teams || []).map((t) => [t.tid, t]));
  const players = [];

  for (const p of league.players || []) {
    for (const stat of p.stats || []) {
      if (stat.playoffs || stat.gp < minGp) continue;
      const row = playerSeasonFromStat(p, teamByTid, stat);
      if (row) players.push(row);
    }
  }

  return players;
}

/** BBGM ratings tied to team via stats/transactions — fills gaps stats-only misses */
export function extractRatingsHistory(league) {
  const teamByTid = new Map((league.teams || []).map((t) => [t.tid, t]));
  const players = [];

  for (const p of league.players || []) {
    if (!p.name) continue;
    const teamBySeason = new Map();
    for (const s of p.stats || []) {
      if (!s.playoffs && s.gp >= 1) teamBySeason.set(s.season, s.tid);
    }
    for (const t of p.transactions || []) {
      if (t.tid >= 0) teamBySeason.set(t.season, t.tid);
    }

    for (const r of p.ratings || []) {
      const tid = teamBySeason.get(r.season);
      if (tid == null) continue;
      const team = teamByTid.get(tid);
      const teamId = mapBBGMTeamId(team);
      if (!teamId) continue;

      const year = r.season;
      const stat = (p.stats || []).find((s) => !s.playoffs && s.season === year && s.tid === tid);
      const positions = parsePositions(p.pos);
      const ratings = stat ? ratingsFromStatRow(stat, positions) : bbgmToDynastyRatings(r);
      const age = p.born?.year ? year - p.born.year : 25;

      players.push(
        finalizePlayerRow(
          {
            id: `${slug(p.name)}-${teamId}-${year}`,
            name: p.name,
            teamId,
            year,
            age,
            experience: experienceFor(p, year),
            positions,
            primaryPosition: positions[0],
            allStar: isAllStar(p, year),
            ratings,
            source: stat ? "bbgm-stats" : "bbgm-ratings",
          },
          p
        )
      );
    }
  }

  return players;
}

const SOURCE_RANK = {
  "bbgm-stats": 5,
  "nba-api": 5,
  "bbgm-ratings": 3,
  "bbgm-snapshot": 2,
};

export function mergeImportedPlayers(existingMap, rows) {
  for (const row of rows) {
    const key = `${row.name.toLowerCase()}:${row.teamId}:${row.year}`;
    const existing = existingMap.get(key);
    if (!existing) {
      existingMap.set(key, row);
      continue;
    }
    const rankNew = SOURCE_RANK[row.source] || 0;
    const rankOld = SOURCE_RANK[existing.source] || 0;
    if (rankNew > rankOld) existingMap.set(key, row);
  }
  return existingMap;
}
