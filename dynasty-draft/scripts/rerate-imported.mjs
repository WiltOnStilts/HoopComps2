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
  parseLenientJson,
} from "../lib/bbgm-import.mjs";
import { SNAPSHOT_FILES, MEGA_FILES, bbgmCacheName } from "../lib/bbgm-sources.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const RAW_DIR = path.join(ROOT, "data", "dynasty", "raw", "bbgm");
const OUT = path.join(ROOT, "data", "dynasty", "imported-bbgm.json");

function resolveRaw(name) {
  const safe = bbgmCacheName(name);
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
  const data = parseLenientJson(fs.readFileSync(nbaApiPath, "utf8"));
  mergeImportedPlayers(merged, data.players || []);
  console.log("merged nba-api cache");
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
