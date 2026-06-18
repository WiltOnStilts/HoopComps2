import crypto from "crypto";
import { getDayKey } from "./day-key.mjs";
import { getOrCreateUserChallenge, resolveSubmitRound, respinRoundDimension } from "./challenge.mjs";
import {
  getRosterPlayers,
  buildFullRoster,
  loadTeams,
  loadModifiers,
  canPlayPosition,
  findPlayerInRoundPool,
  sanitizePlayerForClient,
  LINEUP_SLOTS,
} from "./players.mjs";
import { simulateSeason } from "./simulate.mjs";
import { calculateScore, scoreBreakdown } from "./scoring.mjs";
import { letterGrade } from "./grade.mjs";
import { buildShareText } from "./stories.mjs";
import {
  withDynastyStore,
  getUserSettings,
  updateUserSettings,
  getUserSubmission,
  updateStreak,
  updateBestScore,
  getDailyLeaderboard,
  saveSubmission,
} from "./store.mjs";
import { findUserById } from "./db.mjs";

function parseUrl(url) {
  return new URL(url, "http://localhost");
}

const DEFAULT_SETTINGS = { showStats: true, soundEnabled: true };

function resolveChallengeSeed(req, user) {
  if (user?.id) return user.id;
  const header = req.headers["x-dynasty-seed"] || req.headers["X-Dynasty-Seed"];
  if (typeof header === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(header.trim())) {
    return header.trim();
  }
  return null;
}

function computeLineupSubmission(store, { lineupInput, dayKey, userId, challengeSeed }) {
  const challenge = getOrCreateUserChallenge(store, dayKey, challengeSeed);
  const settings = userId ? getUserSettings(store, userId) : DEFAULT_SETTINGS;
  const usedPlayerIds = new Set();
  const usedRoundIndexes = new Set();
  const lineup = [];

  for (const slot of LINEUP_SLOTS) {
    const pick = lineupInput[slot];
    if (!pick?.playerId) return { error: `Missing pick for ${slot}` };

    if (usedPlayerIds.has(pick.playerId)) {
      return { error: "Each player can only be used once" };
    }

    const resolved = resolveSubmitRound(challenge, pick);
    if (resolved.error) return { error: resolved.error };

    const { roundIndex, round } = resolved;
    if (usedRoundIndexes.has(roundIndex)) {
      return { error: "Each spin round can only be used once" };
    }

    const found = findPlayerInRoundPool(round, pick.playerId);
    if (found?.error) return { error: `${found.error} (${slot})` };
    const player = found?.player;
    if (!player) return { error: `Invalid player for ${slot}` };
    if (!canPlayPosition(player, slot)) return { error: `${player.name} cannot play ${slot}` };

    usedPlayerIds.add(pick.playerId);
    usedRoundIndexes.add(roundIndex);
    lineup.push({ slot, player, roundIndex, round });
  }

  const simulation = simulateSeason({ lineup, challenge, dayKey, userId: userId || "guest" });
  const score = calculateScore(simulation);
  const gradeInfo = letterGrade(simulation, score);
  const breakdown = scoreBreakdown(simulation);
  const shareText = buildShareText({ grade: gradeInfo, score, simulation, dayKey });

  const submission = {
    id: crypto.randomUUID(),
    userId: userId || null,
    dayKey,
    lineup,
    simulation,
    score,
    grade: gradeInfo.grade,
    shareText,
    createdAt: new Date().toISOString(),
  };

  return { submission, grade: gradeInfo, breakdown, settings };
}

export async function handleDynastyRoute(req, url, ctx) {
  const { readBody, send, requireUser } = ctx;
  const u = parseUrl(url);
  const path = u.pathname;

  if (req.method === "GET" && path === "/api/dynasty/meta") {
    send(200, {
      teams: loadTeams(),
      modifiers: loadModifiers(),
      slots: LINEUP_SLOTS,
    });
    return true;
  }

  if (req.method === "GET" && path === "/api/dynasty/today") {
    const user = await requireUser(req);
    const dayKey = getDayKey();
    const challengeSeed = resolveChallengeSeed(req, user);
    if (!challengeSeed) {
      send(400, { error: "Missing challenge seed" });
      return true;
    }
    const data = await withDynastyStore((store) => {
      const challenge = getOrCreateUserChallenge(store, dayKey, challengeSeed);
      if (!user) {
        return {
          challenge,
          settings: DEFAULT_SETTINGS,
          submission: null,
          streak: { current: 0, best: 0 },
          best: { score: 0, grade: "F" },
          guest: true,
        };
      }
      const settings = getUserSettings(store, user.id);
      const submission = getUserSubmission(store, user.id, dayKey);
      const streak = store.streaks[user.id] || { current: 0, best: 0 };
      const best = store.bestScores[user.id] || { score: 0, grade: "F" };
      return { challenge, settings, submission, streak, best };
    });

    send(200, data);
    return true;
  }

  if (req.method === "GET" && path === "/api/dynasty/players") {
    const teamId = u.searchParams.get("teamId");
    const year = Number(u.searchParams.get("year"));
    const modifierIdsParam = u.searchParams.get("modifierIds") || u.searchParams.get("modifierId") || "standard";
    const modifierIds = modifierIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const slot = u.searchParams.get("slot") || "all";
    const showStats = u.searchParams.get("showStats") !== "false";

    if (!teamId || !year) {
      send(400, { error: "teamId and year required" });
      return true;
    }

    const players =
      slot === "all"
        ? getRosterPlayers({ teamId, year, modifierIds })
        : getRosterPlayers({ teamId, year, modifierIds }).filter((p) => canPlayPosition(p, slot));

    const rosterSize = buildFullRoster(teamId, year).length;
    send(200, {
      players: players.map((p) => sanitizePlayerForClient(p, showStats)),
      count: players.length,
      rosterSize,
    });
    return true;
  }

  if (req.method === "PUT" && path === "/api/dynasty/settings") {
    const user = await requireUser(req);
    if (!user) {
      send(401, { error: "Sign in required" });
      return true;
    }
    const body = await readBody(req);
    const settings = await withDynastyStore((store) => updateUserSettings(store, user.id, body));
    send(200, { settings });
    return true;
  }

  if (req.method === "POST" && path === "/api/dynasty/respin") {
    const user = await requireUser(req);
    const body = await readBody(req);
    const dayKey = String(body.dayKey || getDayKey()).trim();
    const roundIndex = Number(body.roundIndex);
    const dimension = String(body.dimension || "").trim();
    const challengeSeed = resolveChallengeSeed(req, user) || body.challengeSeed;

    if (!challengeSeed) {
      send(400, { error: "Missing challenge seed" });
      return true;
    }
    if (dayKey !== getDayKey()) {
      send(400, { error: "This daily challenge has expired. Refresh and play today's challenge." });
      return true;
    }
    if (!Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex > 5) {
      send(400, { error: "Invalid round" });
      return true;
    }

    const result = await withDynastyStore((store) => {
      const challenge = getOrCreateUserChallenge(store, dayKey, challengeSeed);
      const respin = respinRoundDimension(challenge, roundIndex, dimension);
      if (respin.error) return respin;
      return respin;
    });

    if (result.error) {
      send(400, { error: result.error });
      return true;
    }

    send(200, result);
    return true;
  }

  if (req.method === "POST" && path === "/api/dynasty/submit") {
    const user = await requireUser(req);
    const body = await readBody(req);
    const dayKey = String(body.dayKey || getDayKey()).trim();
    const lineupInput = body.lineup || {};
    const challengeSeed = resolveChallengeSeed(req, user) || body.challengeSeed;
    if (!challengeSeed) {
      send(400, { error: "Missing challenge seed" });
      return true;
    }

    const todayKey = getDayKey();
    if (dayKey !== todayKey) {
      send(400, { error: "This daily challenge has expired. Refresh and play today's challenge." });
      return true;
    }

    const result = await withDynastyStore((store) => {
      if (user) {
        const existing = getUserSubmission(store, user.id, dayKey);
        if (existing) {
          return { error: "Already submitted today", submission: existing };
        }
      }

      const computed = computeLineupSubmission(store, {
        lineupInput,
        dayKey,
        userId: user?.id,
        challengeSeed,
      });
      if (computed.error) return computed;

      if (user) {
        saveSubmission(store, computed.submission);
        updateStreak(store, user.id, dayKey);
        updateBestScore(store, user.id, computed.submission.score, computed.grade.grade);
        return computed;
      }

      return { ...computed, guest: true };
    });

    if (result.error && !result.submission) {
      send(400, { error: result.error });
      return true;
    }
    if (result.error) {
      send(409, { error: result.error, submission: result.submission });
      return true;
    }

    send(200, result);
    return true;
  }

  if (req.method === "GET" && path === "/api/dynasty/leaderboard") {
    const dayKey = u.searchParams.get("dayKey") || getDayKey();
    const leaderboard = await withDynastyStore((store) =>
      getDailyLeaderboard(store, dayKey).map((row) => {
        const user = findUserById(row.userId);
        return {
          ...row,
          displayName: user?.display_name || "Player",
          username: user?.username || null,
        };
      })
    );
    send(200, { dayKey, leaderboard });
    return true;
  }

  if (req.method === "GET" && path === "/api/dynasty/profile") {
    const user = await requireUser(req);
    if (!user) {
      send(401, { error: "Sign in required" });
      return true;
    }
    const targetId = u.searchParams.get("userId") || user.id;

    const profile = await withDynastyStore((store) => ({
      streak: store.streaks[targetId] || { current: 0, best: 0 },
      best: store.bestScores[targetId] || { score: 0, grade: "F" },
      recentSubmissions: store.submissions
        .filter((s) => s.userId === targetId)
        .sort((a, b) => b.dayKey.localeCompare(a.dayKey))
        .slice(0, 7),
    }));

    send(200, profile);
    return true;
  }

  return false;
}
