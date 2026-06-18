import { getDayKey } from "./day-key.mjs";
import { loadTeams, loadModifiers, getRosterPlayers } from "./players.mjs";

export const CHALLENGE_VERSION = 6;
export const PICK_COUNT = 6;

let draftablePairsCache = null;

function getDraftableTeamYears() {
  if (draftablePairsCache) return draftablePairsCache;
  const teams = loadTeams();
  const pairs = [];
  for (const team of teams) {
    for (let year = 1970; year <= 2024; year++) {
      const pool = getRosterPlayers({ teamId: team.id, year, modifierIds: ["standard"] });
      if (pool.length >= 6) {
        pairs.push({ teamId: team.id, teamName: team.name, teamAbbr: team.abbr, year });
      }
    }
  }
  draftablePairsCache = pairs;
  return pairs;
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pickRandom(items, rng) {
  return items[Math.floor(rng() * items.length)];
}

function yearsLabel(year, modifier) {
  const span = modifier?.yearSpan || 0;
  if (span <= 0) return String(year);
  const lo = Math.max(1960, year - span);
  const hi = Math.min(2026, year + span);
  return lo === hi ? String(year) : `${lo}–${hi}`;
}

function roundIsDraftable(round) {
  const pool = getRosterPlayers({
    teamId: round.teamId,
    year: round.year,
    modifierIds: [round.modifierId],
  });
  if (pool.length < 6) return false;
  return pool.length >= 6;
}

function pickDraftableRound(teams, rng) {
  const pairs = getDraftableTeamYears();
  if (!pairs.length) {
    const team = pickRandom(teams, rng);
    return { team, year: 2024 };
  }
  const pick = pairs[Math.floor(rng() * pairs.length)];
  const team = teams.find((t) => t.id === pick.teamId) || teams[0];
  return { team, year: pick.year };
}

export function buildDailyChallenge(dayKey = getDayKey(), seed = "shared") {
  const teams = loadTeams();
  const modifiers = loadModifiers();
  let modPool = modifiers.filter((m) => m.id === "standard" || m.type === "simBonus" || m.type === "simPenalty");
  if (!modPool.length) modPool = [modifiers.find((m) => m.id === "standard") || modifiers[0]];

  for (let attempt = 0; attempt < 50; attempt++) {
    const rng = seededRng(hashString(`dynasty-v6-${dayKey}-${seed}-${attempt}`));
    const rounds = [];

    for (let i = 0; i < PICK_COUNT; i++) {
      const { team, year } = pickDraftableRound(teams, rng);
      const mod = pickRandom(modPool, rng);
      rounds.push({
        round: i + 1,
        teamId: team.id,
        teamName: team.name,
        teamAbbr: team.abbr,
        year,
        yearsLabel: yearsLabel(year, mod),
        modifierId: mod.id,
        modifierLabel: mod.label,
        modifierDescription: mod.description,
      });
    }

    if (rounds.every(roundIsDraftable)) {
      return {
        challengeVersion: CHALLENGE_VERSION,
        dayKey,
        seed,
        rounds,
        createdAt: new Date().toISOString(),
      };
    }
  }

  return buildDailyChallengeFallback(dayKey, seed);
}

function buildDailyChallengeFallback(dayKey, seed = "shared") {
  const teams = loadTeams();
  const mod = loadModifiers().find((m) => m.id === "standard");
  const mavericks = teams.find((t) => t.id === "mavericks") || teams[0];
  const lakers = teams.find((t) => t.id === "lakers") || teams[0];

  const presets = [
    { team: mavericks, year: 2024 },
    { team: lakers, year: 2009 },
    { team: mavericks, year: 2024 },
    { team: lakers, year: 2010 },
    { team: mavericks, year: 2024 },
    { team: lakers, year: 2009 },
  ];

  const rounds = presets.map((p, i) => ({
    round: i + 1,
    teamId: p.team.id,
    teamName: p.team.name,
    teamAbbr: p.team.abbr,
    year: p.year,
    yearsLabel: String(p.year),
    modifierId: mod.id,
    modifierLabel: mod.label,
    modifierDescription: mod.description,
  }));

  return {
    challengeVersion: CHALLENGE_VERSION,
    dayKey,
    seed,
    rounds,
    createdAt: new Date().toISOString(),
  };
}

export function getOrCreateUserChallenge(store, dayKey = getDayKey(), seed = "shared") {
  store.dailyChallenges = store.dailyChallenges || [];
  const idx = store.dailyChallenges.findIndex(
    (c) => c.dayKey === dayKey && c.seed === seed && c.challengeVersion === CHALLENGE_VERSION
  );
  if (idx >= 0) return store.dailyChallenges[idx];

  const challenge = buildDailyChallenge(dayKey, seed);
  const staleIdx = store.dailyChallenges.findIndex((c) => c.dayKey === dayKey && c.seed === seed);
  if (staleIdx >= 0) store.dailyChallenges[staleIdx] = challenge;
  else store.dailyChallenges.push(challenge);

  store.dailyChallenges = store.dailyChallenges.filter((c) => {
    const age = Date.now() - new Date(c.createdAt || c.dayKey).getTime();
    return age < 14 * 24 * 60 * 60 * 1000;
  });
  return challenge;
}

/** @deprecated use getOrCreateUserChallenge */
export function getOrCreateDailyChallenge(store, dayKey = getDayKey()) {
  return getOrCreateUserChallenge(store, dayKey, "shared");
}

export function getRoundConfig(challenge, roundIndex) {
  return challenge?.rounds?.[roundIndex] || null;
}

function roundSnapshotMatches(a, b) {
  if (!a || !b) return false;
  return a.teamId === b.teamId && Number(a.year) === Number(b.year) && a.modifierId === b.modifierId;
}

/** Match a submitted pick to a challenge round (handles index drift after refresh). */
export function resolveSubmitRound(challenge, pick) {
  const roundIndex = pick.roundIndex;
  const hasSnapshot = pick.teamId != null && pick.year != null && pick.modifierId != null;
  const snapshot = hasSnapshot
    ? { teamId: pick.teamId, year: Number(pick.year), modifierId: pick.modifierId }
    : null;

  const atIndex = getRoundConfig(challenge, roundIndex);
  if (atIndex && (!snapshot || roundSnapshotMatches(atIndex, snapshot))) {
    return { roundIndex, round: atIndex };
  }

  if (snapshot) {
    const idx = challenge.rounds.findIndex((r) => roundSnapshotMatches(r, snapshot));
    if (idx >= 0) return { roundIndex: idx, round: challenge.rounds[idx] };
    return {
      error: "Your spins are out of date. Refresh the page and replay today's challenge.",
    };
  }

  if (!atIndex) return { error: `Invalid round for lineup` };
  return {
    error: "Your game no longer matches today's challenge. Refresh the page and try again.",
  };
}

export function getSimModifierIds(challenge) {
  if (!challenge?.rounds) return [];
  const all = loadModifiers();
  return challenge.rounds
    .map((r) => all.find((m) => m.id === r.modifierId))
    .filter((m) => m && (m.type === "simBonus" || m.type === "simPenalty"))
    .map((m) => m.id);
}
