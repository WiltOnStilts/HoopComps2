#!/usr/bin/env node
/** Quick sanity check — run from dynasty-draft/: node scripts/smoke-test.mjs */

import crypto from "crypto";
import { registerUser } from "../lib/auth.mjs";
import { handleDynastyRoute } from "../lib/routes.mjs";
import { getRosterPlayers, canPlayPosition, LINEUP_SLOTS } from "../lib/players.mjs";
import { getOrCreateUserChallenge } from "../lib/challenge.mjs";
import { withDynastyStore } from "../lib/store.mjs";
import { getDayKey } from "../lib/day-key.mjs";

const reg = await registerUser({
  email: `smoke-${crypto.randomUUID()}@test.local`,
  password: "secret12",
  username: `smoke${Date.now()}`,
});

const user = { id: reg.user.id };
const challenge = await withDynastyStore((s) => getOrCreateUserChallenge(s, getDayKey(), reg.user.id));

if (!challenge.rounds || challenge.rounds.length !== 6) {
  throw new Error(`Expected 6 rounds, got ${challenge.rounds?.length}`);
}

const picks = [];
const slotsNeeded = [...LINEUP_SLOTS];
for (let roundIndex = 0; roundIndex < 6; roundIndex++) {
  const round = challenge.rounds[roundIndex];
  const pool = getRosterPlayers({
    teamId: round.teamId,
    year: round.year,
    modifierIds: [round.modifierId],
  });
  const used = new Set(picks.map((p) => p.player.id));
  const player =
    pool.find(
      (p) =>
        !used.has(p.id) &&
        slotsNeeded.some((slot) => canPlayPosition(p, slot))
    ) || pool.find((p) => !used.has(p.id));
  if (!player) throw new Error(`No players for round ${roundIndex + 1}`);
  const slotIdx = slotsNeeded.findIndex((slot) => canPlayPosition(player, slot));
  if (slotIdx >= 0) slotsNeeded.splice(slotIdx, 1);
  picks.push({ roundIndex, player });
}

const lineup = {};
const remaining = [...picks];
for (const slot of LINEUP_SLOTS) {
  const idx = remaining.findIndex((p) => canPlayPosition(p.player, slot));
  if (idx < 0) {
    throw new Error(`No player can fill ${slot} — check positions in roster data`);
  }
  const pick = remaining.splice(idx, 1)[0];
  const round = challenge.rounds[pick.roundIndex];
  lineup[slot] = {
    playerId: pick.player.id,
    roundIndex: pick.roundIndex,
    teamId: round.teamId,
    year: round.year,
    modifierId: round.modifierId,
  };
}

const dayKey = getDayKey();
let result = null;
await handleDynastyRoute(
  { method: "POST", headers: { "x-dynasty-seed": user.id } },
  "/api/dynasty/submit",
  {
    readBody: async () => ({ lineup, challengeSeed: user.id, dayKey }),
    send: (status, data) => {
      result = { status, data };
    },
    requireUser: async () => user,
  }
);

if (result.status !== 200) {
  console.error("FAIL submit:", result);
  process.exit(1);
}

console.log("OK DynastyDraft smoke test passed");
console.log("  Rounds:", challenge.rounds.length);
console.log("  Sample:", challenge.rounds[0].teamName, challenge.rounds[0].year);
console.log("  Grade:", result.data.grade?.grade);
console.log("  Score:", result.data.submission?.score);
