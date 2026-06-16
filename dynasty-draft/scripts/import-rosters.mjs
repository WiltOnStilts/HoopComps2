#!/usr/bin/env node
/** Alias — see import-bbgm-rosters.mjs for roster import pipeline */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "import-bbgm-rosters.mjs");
const result = spawnSync(process.execPath, [script, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
