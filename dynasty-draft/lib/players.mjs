import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { withCalibratedRatings } from "./rating-calibration.mjs";
import { expandCareerToSeason } from "./roster-builder.mjs";
import {
  canPlayPosition,
  getEligiblePositions as eligiblePositionsForPlayer,
  normalizePlayerPositions,
  positionFitMultiplier,
} from "./positions.mjs";

export { canPlayPosition, positionFitMultiplier };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data", "dynasty");

let teamsCache = null;
let modifiersCache = null;
let playersCache = null;
let careersCache = null;
let rosterIndexCache = null;

export const LINEUP_SLOTS = ["PG", "SG", "SF", "PF", "C", "sixth"];

export function loadTeams() {
  if (!teamsCache) {
    teamsCache = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "teams.json"), "utf8"));
  }
  return teamsCache;
}

export function loadModifiers() {
  if (!modifiersCache) {
    modifiersCache = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "modifiers.json"), "utf8"));
  }
  return modifiersCache;
}

export function loadSeedPlayers() {
  if (!playersCache) {
    playersCache = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "players-seed.json"), "utf8")).map(
      normalizePlayerPositions
    );
  }
  return playersCache;
}

export function loadCareers() {
  if (!careersCache) {
    const p = path.join(DATA_DIR, "player-careers.json");
    careersCache = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : [];
  }
  return careersCache;
}

function buildRosterIndexFromSeed() {
  const index = new Map();
  for (const p of loadSeedPlayers()) {
    const key = `${p.teamId}:${p.year}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(p);
  }
  for (const roster of index.values()) {
    roster.sort((a, b) => (b.ratings?.impact || 0) - (a.ratings?.impact || 0));
  }
  return index;
}

export function invalidateRosterCache() {
  playersCache = null;
  rosterIndexCache = null;
}

function getRosterIndex() {
  if (!rosterIndexCache) rosterIndexCache = buildRosterIndexFromSeed();
  return rosterIndexCache;
}

export function getTeamById(teamId) {
  return loadTeams().find((t) => t.id === teamId) || null;
}

export function getModifierById(modifierId) {
  return loadModifiers().find((m) => m.id === modifierId) || loadModifiers()[0];
}

function yearRangeForChallenge(year, modifiers) {
  let span = 0;
  for (const mod of modifiers) {
    if (mod?.yearSpan) span = Math.max(span, mod.yearSpan);
  }
  const years = [];
  for (let y = year - span; y <= year + span; y++) {
    if (y >= 1960 && y <= 2026) years.push(y);
  }
  return years.length ? years : [year];
}

function passesAllModifiers(player, modifiers) {
  for (const mod of modifiers) {
    if (mod?.filter && !passesFilter(player, mod.filter)) return false;
  }
  return true;
}

/** Real players only — exact team + season from seed index */
export function buildFullRoster(teamId, year) {
  const index = getRosterIndex();
  return (index.get(`${teamId}:${year}`) || []).map(withCalibratedRatings);
}

export function getRosterPlayers({ teamId, year, modifierIds, modifierId }) {
  return getEligiblePlayers({ teamId, year, modifierIds, modifierId, slotPosition: null });
}

export function findPlayerInRoundPool(round, playerId) {
  const id = String(playerId || "").trim();
  if (!id || !round?.teamId || !round?.year) return null;

  const pool = getRosterPlayers({
    teamId: round.teamId,
    year: round.year,
    modifierIds: [round.modifierId || "standard"],
  });
  const player = pool.find((p) => p.id === id);
  if (player) return { player };

  const modifier = getModifierById(round.modifierId);
  const years = yearRangeForChallenge(round.year, [modifier]);
  for (const y of years) {
    for (const p of buildFullRoster(round.teamId, y)) {
      if (p.id === id) {
        return {
          error: `${p.name} is not eligible for that spin's pool rules`,
        };
      }
    }
  }

  return { error: "Player not found for that spin — refresh and replay today's challenge." };
}

export function getEligiblePlayers({ teamId, year, modifierIds, modifierId, slotPosition }) {
  const ids = modifierIds?.length ? modifierIds : modifierId ? [modifierId] : ["standard"];
  const modifiers = ids.map((id) => getModifierById(id));
  const years = yearRangeForChallenge(year, modifiers);

  const pool = new Map();
  for (const y of years) {
    for (const p of buildFullRoster(teamId, y)) {
      pool.set(p.id, p);
    }
  }

  const filtered = [...pool.values()].filter((p) => {
    if (!passesAllModifiers(p, modifiers)) return false;
    if (slotPosition && !canPlayPosition(p, slotPosition)) return false;
    return true;
  });

  return filtered.sort((a, b) => (b.ratings?.impact || 0) - (a.ratings?.impact || 0));
}

export function countRoster(teamId, year) {
  return buildFullRoster(teamId, year).length;
}

/** Positions a player can realistically be assigned to in the draft */
export function getEligiblePositions(player) {
  return eligiblePositionsForPlayer(player, LINEUP_SLOTS);
}

function passesFilter(player, filter) {
  if (!filter) return true;
  if (filter === "noAllStars" && player.allStar) return false;
  if (filter.startsWith("noPrimaryPosition:")) {
    const pos = filter.split(":")[1];
    if (player.primaryPosition === pos) return false;
  }
  if (filter.startsWith("maxAge:")) {
    const max = Number(filter.split(":")[1]);
    if (player.age > max) return false;
  }
  if (filter.startsWith("minAge:")) {
    const min = Number(filter.split(":")[1]);
    if (player.age < min) return false;
  }
  if (filter.startsWith("maxExperience:")) {
    const max = Number(filter.split(":")[1]);
    if (player.experience > max) return false;
  }
  if (filter.startsWith("minDefense:")) {
    const min = Number(filter.split(":")[1]);
    if ((player.ratings?.defense || 0) < min) return false;
  }
  if (filter.startsWith("minShooting:")) {
    const min = Number(filter.split(":")[1]);
    if ((player.ratings?.shooting || 0) < min) return false;
  }
  return true;
}

export function lineupOverall(lineup, showStats = true) {
  let total = 0;
  let count = 0;
  for (const entry of lineup) {
    const player = entry?.player;
    if (!player?.ratings) continue;
    const pos = entry.slot;
    const mult = positionFitMultiplier(player, pos);
    const r = player.ratings;
    const skill = showStats
      ? r.impact * 0.38 +
        r.scoring * 0.14 +
        r.shooting * 0.14 +
        ((r.defense + r.playmaking) / 2) * 0.18 +
        ((r.rebounding + r.health) / 2) * 0.16
      : r.impact;
    total += skill * mult;
    count++;
  }
  return count ? total / count : 50;
}

export function sanitizePlayerForClient(player, showStats) {
  if (showStats) return player;
  return {
    id: player.id,
    name: player.name,
    teamId: player.teamId,
    year: player.year,
    age: player.age,
    positions: player.positions,
    primaryPosition: player.primaryPosition,
    allStar: player.allStar,
    ratings: { impact: player.ratings.impact },
  };
}

/** Runtime expansion fallback when seed missing (dev) */
export function expandCareersToRoster(teamId, year) {
  const careers = loadCareers();
  const players = new Map();
  for (const c of careers) {
    const p = expandCareerToSeason(c, teamId, year);
    if (p) players.set(p.id, p);
  }
  return [...players.values()].sort((a, b) => b.ratings.impact - a.ratings.impact);
}
