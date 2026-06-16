#!/usr/bin/env node
/**
 * Download Basketball GM NBA roster files and build imported-bbgm.json.
 * Source: https://github.com/alexnoob/BasketBall-GM-Rosters (MIT-style community data)
 *
 * Run: node scripts/import-bbgm-rosters.mjs
 *      node scripts/import-bbgm-rosters.mjs --skip-download   (use cached raw files)
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

const BBGM_BASE =
  "https://raw.githubusercontent.com/alexnoob/BasketBall-GM-Rosters/master";

/** Season snapshot files — full ~12–15 man rosters per team */
const SNAPSHOT_FILES = [
  "1995-96.NBA.Roster.json",
  "2009-10 Rosters.json",
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
  "NBA Legacy 1985 23 teams.json",
];

/** Mega files — career stats + ratings history */
const MEGA_FILES = [
  "2019-20.NBA.Roster.json",
  "2020-21.NBA.Roster.json",
  "2021-22.NBA.Roster.json",
  "2022-23.NBA.Roster.json",
  "2023-24.NBA.Roster.json",
  "2024-25.NBA.Roster.json",
];

const skipDownload = process.argv.includes("--skip-download");

async function downloadFile(name) {
  const dest = path.join(RAW_DIR, name.replace(/[^\w.-]+/g, "_"));
  if (skipDownload && fs.existsSync(dest)) return dest;

  fs.mkdirSync(RAW_DIR, { recursive: true });
  const url = `${BBGM_BASE}/${encodeURIComponent(name).replace(/%20/g, "%20")}`;
  process.stdout.write(`  fetch ${name}… `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${name}`);
  const text = await res.text();
  fs.writeFileSync(dest, text);
  console.log(`${(text.length / 1024).toFixed(0)} KB`);
  return dest;
}

function loadLeague(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return parseBBGMJson(text);
}

async function main() {
  console.log("DynastyDraft — BBGM roster import\n");

  const merged = new Map();
  const meta = { snapshots: [], statsFiles: [], errors: [] };

  for (const name of SNAPSHOT_FILES) {
    try {
      const filePath = await downloadFile(name);
      const league = loadLeague(filePath);
      const { year, startingSeason, players } = extractSnapshotRoster(league);
      mergeImportedPlayers(merged, players);
      meta.snapshots.push({ file: name, startingSeason, year, players: players.length });
      console.log(`  ✓ snapshot ${name} → year ${year}, ${players.length} players`);
    } catch (err) {
      meta.errors.push({ file: name, error: err.message });
      console.warn(`  ✗ ${name}: ${err.message}`);
    }
  }

  for (const name of MEGA_FILES) {
    try {
      const filePath = await downloadFile(name);
      const league = loadLeague(filePath);
      const before = merged.size;
      mergeImportedPlayers(merged, extractStatsRoster(league, 1));
      mergeImportedPlayers(merged, extractRatingsHistory(league));
      meta.statsFiles.push({
        file: name,
        added: merged.size - before,
      });
      console.log(`  ✓ mega ${name} → +${merged.size - before} new`);
    } catch (err) {
      meta.errors.push({ file: name, error: err.message });
      console.warn(`  ✗ mega ${name}: ${err.message}`);
    }
  }

  const nbaApiPath = path.join(ROOT, "data", "dynasty", "raw", "nba-api-rosters.json");
  if (fs.existsSync(nbaApiPath)) {
    const data = JSON.parse(fs.readFileSync(nbaApiPath, "utf8"));
    const before = merged.size;
    mergeImportedPlayers(merged, data.players || []);
    meta.nbaApi = { added: merged.size - before, rows: (data.players || []).length };
    console.log(`  ✓ nba-api cache → +${merged.size - before} new`);
  }

  const players = [...merged.values()].sort(
    (a, b) => b.year - a.year || a.teamId.localeCompare(b.teamId) || a.name.localeCompare(b.name)
  );

  const teamYears = new Set(players.map((p) => `${p.teamId}:${p.year}`));
  const byYear = {};
  for (const p of players) byYear[p.year] = (byYear[p.year] || 0) + 1;

  const payload = {
    importedAt: new Date().toISOString(),
    source: "alexnoob/BasketBall-GM-Rosters",
    meta,
    stats: {
      players: players.length,
      teamYears: teamYears.size,
      yearRange: [Math.min(...players.map((p) => p.year)), Math.max(...players.map((p) => p.year))],
    },
    players,
  };

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));

  console.log(`\nWrote ${players.length} player-season rows (${teamYears.size} team-years)`);
  console.log(`Output: ${OUT}`);
  console.log("\nNext: node scripts/generate-rosters.mjs");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
