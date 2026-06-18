import { getDayKey } from "./day-key.mjs";
import { loadTeams, loadModifiers, getRosterPlayers } from "./players.mjs";

export const CHALLENGE_VERSION = 7;
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
  const years = [];
  for (let y = lo; y <= hi; y++) years.push(y);
  if (years.length === 1) return String(years[0]);
  if (years.length === 2) return `${years[0]} & ${years[1]}`;
  if (years.length <= 4) {
    return `${years.slice(0, -1).join(", ")} & ${years[years.length - 1]}`;
  }
  return `${lo}–${hi} (${years.length} seasons)`;
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

function isDraftableConfig(teamId, year, modifierId) {
  return (
    getRosterPlayers({ teamId, year, modifierIds: [modifierId] }).length >= PICK_COUNT
  );
}

export function getModifierPool() {
  const modifiers = loadModifiers();
  let modPool = modifiers.filter(
    (m) =>
      m.id === "standard" ||
      m.effectType === "advantage" ||
      m.effectType === "disadvantage" ||
      m.type === "simBonus" ||
      m.type === "simPenalty"
  );
  if (!modPool.length) modPool = modifiers;
  return modPool;
}

function freshRoundRespins() {
  return {
    respinsUsed: { team: false, year: false, modifier: false },
    respinCounts: { team: 0, year: 0, modifier: 0 },
  };
}

function applyRoundFields(round, team, year, mod, extras = {}) {
  return {
    ...round,
    teamId: team.id,
    teamName: team.name,
    teamAbbr: team.abbr,
    year,
    yearsLabel: yearsLabel(year, mod),
    modifierId: mod.id,
    modifierLabel: mod.label,
    modifierDescription: mod.description,
    modifierEffectType: mod.effectType || "neutral",
    modifierEffectSummary: mod.effectSummary || mod.description,
    ...extras,
  };
}

/** Re-roll team, year, or modifier for one pick (once per category). */
export function respinRoundDimension(challenge, roundIndex, dimension) {
  const valid = new Set(["team", "year", "modifier"]);
  if (!valid.has(dimension)) return { error: "Invalid respin type" };

  const round = challenge?.rounds?.[roundIndex];
  if (!round) return { error: "Invalid round" };

  if (!round.respinsUsed) {
    Object.assign(round, freshRoundRespins());
  }
  if (round.respinsUsed[dimension]) {
    return { error: `You already respun ${dimension} for this pick` };
  }

  const teams = loadTeams();
  const modPool = getModifierPool();
  round.respinCounts[dimension] = (round.respinCounts[dimension] || 0) + 1;

  const rng = seededRng(
    hashString(
      `${challenge.seed}-${challenge.dayKey}-respin-r${roundIndex}-${dimension}-n${round.respinCounts[dimension]}`
    )
  );

  let teamId = round.teamId;
  let year = round.year;
  let modifierId = round.modifierId;

  if (dimension === "team") {
    const candidates = teams
      .map((t) => t.id)
      .filter((id) => id !== round.teamId && isDraftableConfig(id, year, modifierId));
    if (!candidates.length) return { error: "No other teams work with this year and modifier" };
    teamId = candidates[Math.floor(rng() * candidates.length)];
  } else if (dimension === "year") {
    const candidates = [];
    for (let y = 1970; y <= 2024; y++) {
      if (y !== round.year && isDraftableConfig(teamId, y, modifierId)) candidates.push(y);
    }
    if (!candidates.length) return { error: "No other years work with this team and modifier" };
    year = candidates[Math.floor(rng() * candidates.length)];
  } else {
    const candidates = modPool
      .map((m) => m.id)
      .filter((id) => id !== round.modifierId && isDraftableConfig(teamId, year, id));
    if (!candidates.length) return { error: "No other modifiers work with this team and year" };
    modifierId = candidates[Math.floor(rng() * candidates.length)];
  }

  const team = teams.find((t) => t.id === teamId) || teams[0];
  const mod = loadModifiers().find((m) => m.id === modifierId) || loadModifiers()[0];

  const updated = applyRoundFields(round, team, year, mod, {
    respinsUsed: { ...round.respinsUsed, [dimension]: true },
    respinCounts: { ...round.respinCounts },
  });

  challenge.rounds[roundIndex] = updated;
  return { round: updated, challenge };
}

export function buildDailyChallenge(dayKey = getDayKey(), seed = "shared") {
  const teams = loadTeams();
  const modPool = getModifierPool();

  for (let attempt = 0; attempt < 50; attempt++) {
    const rng = seededRng(hashString(`dynasty-v6-${dayKey}-${seed}-${attempt}`));
    const rounds = [];

    for (let i = 0; i < PICK_COUNT; i++) {
      const { team, year } = pickDraftableRound(teams, rng);
      const mod = pickRandom(modPool, rng);
      rounds.push(
        applyRoundFields({ round: i + 1, ...freshRoundRespins() }, team, year, mod)
      );
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

  const rounds = presets.map((p, i) =>
    applyRoundFields(
      { round: i + 1, ...freshRoundRespins() },
      p.team,
      p.year,
      mod
    )
  );

  return {
    challengeVersion: CHALLENGE_VERSION,
    dayKey,
    seed,
    rounds,
    createdAt: new Date().toISOString(),
  };
}

function refreshChallengeRoundLabels(challenge) {
  if (!challenge?.rounds) return challenge;
  for (const round of challenge.rounds) {
    const mod = loadModifiers().find((m) => m.id === round.modifierId);
    if (mod) round.yearsLabel = yearsLabel(round.year, mod);
  }
  return challenge;
}

export function getOrCreateUserChallenge(store, dayKey = getDayKey(), seed = "shared") {
  store.dailyChallenges = store.dailyChallenges || [];
  const idx = store.dailyChallenges.findIndex(
    (c) => c.dayKey === dayKey && c.seed === seed && c.challengeVersion === CHALLENGE_VERSION
  );
  if (idx >= 0) return refreshChallengeRoundLabels(store.dailyChallenges[idx]);

  const challenge = buildDailyChallenge(dayKey, seed);
  const staleIdx = store.dailyChallenges.findIndex((c) => c.dayKey === dayKey && c.seed === seed);
  if (staleIdx >= 0) store.dailyChallenges[staleIdx] = challenge;
  else store.dailyChallenges.push(challenge);

  store.dailyChallenges = store.dailyChallenges.filter((c) => {
    const age = Date.now() - new Date(c.createdAt || c.dayKey).getTime();
    return age < 14 * 24 * 60 * 60 * 1000;
  });
  return refreshChallengeRoundLabels(challenge);
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

export function getSimModifiers(challenge) {
  if (!challenge?.rounds) return [];
  const all = loadModifiers();
  return challenge.rounds
    .map((r) => all.find((m) => m.id === r.modifierId))
    .filter((m) => m && (m.type === "simBonus" || m.type === "simPenalty"));
}

/** @deprecated */
export function getSimModifierIds(challenge) {
  return getSimModifiers(challenge).map((m) => m.id);
}
