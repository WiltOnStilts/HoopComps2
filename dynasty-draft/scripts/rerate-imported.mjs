#!/usr/bin/env node
/**
 * Re-apply stat-based ratings to every row in imported-bbgm.json by re-parsing
 * cached BBGM mega files. Run after ratings-from-stats.mjs changes.
 *
 *   node scripts/rerate-imported.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  extractSnapshotRoster,
  extractStatsRoster,
  extractRatingsHistory,
  mergeImportedPlayers,
  parseBBGMJson,
} from "../lib/bbgm-import.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const RAW_DIR = path.join(ROOT, "data", "dynasty", "raw", "bbgm");
const OUT = path.join(ROOT, "data", "dynasty", "imported-bbgm.json");

const SNAPSHOT_FILES = [
  "1995-96.NBA.Roster.json",
  "2009-10_Rosters.json",
  "2015-16.NBA.Roster.json",
  "2016-17.NBA.Roster.json",
  "2017-18.NBA.Roster.json",
  "2018-19.NBA.Roster.json",
  "2019-20.NBA.Roster.json",
  "2020-21.NBA.Roster.json",
  "2021-22.NBA.Roster.json",
  "2022-23.NBA.Roster.json",
  "2023-24.NBA.Roster.json",
  "2024-25.NBA.Roster.json",
  "NBA_Legacy_1985_23_teams.json",
];

const MEGA_FILES = [
  "2019-20.NBA.Roster.json",
  "2020-21.NBA.Roster.json",
  "2021-22.NBA.Roster.json",
  "2022-23.NBA.Roster.json",
  "2023-24.NBA.Roster.json",
  "2024-25.NBA.Roster.json",
  "2122.json",
  "test_mega.json",
];

function resolveRaw(name) {
  const safe = name.replace(/[^\w.-]+/g, "_");
  const direct = path.join(RAW_DIR, name);
  if (fs.existsSync(direct)) return direct;
  if (fs.existsSync(path.join(RAW_DIR, safe))) return path.join(RAW_DIR, safe);
  return null;
}

function loadLeague(filePath) {
  return parseBBGMJson(fs.readFileSync(filePath, "utf8"));
}

const merged = new Map();

for (const name of SNAPSHOT_FILES) {
  const filePath = resolveRaw(name);
  if (!filePath) continue;
  const league = loadLeague(filePath);
  mergeImportedPlayers(merged, extractSnapshotRoster(league).players);
  console.log(`snapshot ${path.basename(filePath)}`);
}

for (const name of MEGA_FILES) {
  const filePath = resolveRaw(name);
  if (!filePath) continue;
  const league = loadLeague(filePath);
  mergeImportedPlayers(merged, extractStatsRoster(league, 1));
  mergeImportedPlayers(merged, extractRatingsHistory(league));
  console.log(`mega ${path.basename(filePath)}`);
}

const nbaApiPath = path.join(ROOT, "data", "dynasty", "raw", "nba-api-rosters.json");
if (fs.existsSync(nbaApiPath)) {
  const data = JSON.parse(fs.readFileSync(nbaApiPath, "utf8"));
  mergeImportedPlayers(merged, data.players || []);
  console.log("merged nba-api cache (lower priority than bbgm-stats)");
}

const players = [...merged.values()].sort(
  (a, b) => b.year - a.year || a.teamId.localeCompare(b.teamId) || a.name.localeCompare(b.name)
);

const payload = {
  importedAt: new Date().toISOString(),
  source: "rerate-imported",
  stats: { players: players.length },
  players,
};

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`Wrote ${players.length} rows → ${OUT}`);
