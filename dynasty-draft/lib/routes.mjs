import crypto from "crypto";
import { getDayKey } from "./day-key.mjs";
import { getOrCreateDailyChallenge, getRoundConfig } from "./challenge.mjs";
import {
  getRosterPlayers,
  buildFullRoster,
  loadTeams,
  loadModifiers,
  canPlayPosition,
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

function computeLineupSubmission(store, { lineupInput, dayKey, userId }) {
  const challenge = getOrCreateDailyChallenge(store, dayKey);
  const settings = userId ? getUserSettings(store, userId) : DEFAULT_SETTINGS;
  const usedPlayerIds = new Set();
  const usedRoundIndexes = new Set();
  const lineup = [];

  for (const slot of LINEUP_SLOTS) {
    const pick = lineupInput[slot];
    if (!pick?.playerId) return { error: `Missing pick for ${slot}` };

    const roundIndex = pick.roundIndex;
    if (typeof roundIndex !== "number" || roundIndex < 0 || roundIndex >= challenge.rounds.length) {
      return { error: `Invalid round for ${slot}` };
    }
    if (usedRoundIndexes.has(roundIndex)) {
      return { error: "Each spin round can only be used once" };
    }
    if (usedPlayerIds.has(pick.playerId)) {
      return { error: "Each player can only be used once" };
    }

    const round = getRoundConfig(challenge, roundIndex);
    const pool = getRosterPlayers({
      teamId: round.teamId,
      year: round.year,
      modifierIds: [round.modifierId],
    });
    const player = pool.find((p) => p.id === pick.playerId);
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
    const data = await withDynastyStore((store) => {
      const challenge = getOrCreateDailyChallenge(store, dayKey);
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

  if (req.method === "POST" && path === "/api/dynasty/submit") {
    const user = await requireUser(req);
    const body = await readBody(req);
    const dayKey = getDayKey();
    const lineupInput = body.lineup || {};

    const result = await withDynastyStore((store) => {
      if (user) {
        const existing = getUserSubmission(store, user.id, dayKey);
        if (existing) {
          return { error: "Already submitted today", submission: existing };
        }
      }

      const computed = computeLineupSubmission(store, { lineupInput, dayKey, userId: user?.id });
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
