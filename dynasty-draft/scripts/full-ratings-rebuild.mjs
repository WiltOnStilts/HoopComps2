#!/usr/bin/env node
/**
 * Full stat-based ratings rebuild for every player in players-seed.json.
 *
 *   node scripts/full-ratings-rebuild.mjs              # import + generate (cached nba-api)
 *   node scripts/full-ratings-rebuild.mjs --fetch-nba  # also re-fetch nba-api (slow, ~20-40 min)
 */

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadSeedPlayers } from "../lib/players.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const fetchNba = process.argv.includes("--fetch-nba");

function run(cmd, args, label) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (fetchNba) {
  const py = path.join(ROOT, ".venv", "bin", "python");
  if (!fs.existsSync(py)) {
    console.error("Missing .venv — run: python3 -m venv .venv && .venv/bin/pip install nba_api");
    process.exit(1);
  }
  run(py, [path.join(ROOT, "scripts", "fetch-nba-rosters.py"), "--from", "1970", "--to", "2024"], "NBA API fetch 1970–2024");
}

run(process.execPath, [path.join(ROOT, "scripts", "import-bbgm-rosters.mjs"), "--skip-download"], "BBGM import");
run(process.execPath, [path.join(ROOT, "scripts", "generate-rosters.mjs")], "Generate players-seed.json");

const players = loadSeedPlayers();
const bySource = {};
let underrated = 0;
for (const p of players) {
  bySource[p.source || "career-fallback"] = (bySource[p.source || "career-fallback"] || 0) + 1;
  if (p.ratings.scoring <= 45 && p.ratings.impact <= 55) underrated++;
}

console.log("\n=== Rebuild audit ===");
console.log("Total player-seasons:", players.length);
console.log("By source:", bySource);
console.log("Likely underrated (scoring≤45 & impact≤55):", underrated);

const joe = players.find((p) => p.id === "joe-johnson-hawks-2007");
if (joe) console.log("Joe Johnson 2007:", joe.ratings, joe.source);
