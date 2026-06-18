import { lineupOverall } from "./players.mjs";
import { getSimModifiers } from "./challenge.mjs";
import { CLASSIC_OPPONENTS } from "./opponents.mjs";
import { generateSeasonStories, generatePlayoffStories } from "./stories.mjs";
import {
  createSeasonEventCollector,
  maybeInjuryEvent,
  pickStarPerformance,
} from "./sim-events.mjs";

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

function winProbability(userStrength, oppStrength, bonus = 0) {
  const diff = userStrength - oppStrength;
  let wp = 1 / (1 + Math.exp(-diff / 3.2));

  // Superteams should win 75+ — only elite historical teams give them real trouble
  if (userStrength >= 92) {
    if (oppStrength < 72) wp = Math.max(wp, 0.995);
    else if (oppStrength < 84) wp = Math.max(wp, 0.97);
    else if (oppStrength < 92) wp = Math.max(wp, 0.88);
    else wp = Math.max(wp, 0.72);
  } else if (userStrength >= 88) {
    if (oppStrength < 58) wp = Math.max(wp, 0.99);
    else if (oppStrength < 72) wp = Math.max(wp, 0.96);
    else if (oppStrength < 85) wp = Math.max(wp, 0.9);
    else wp = Math.max(wp, 0.75);
  } else if (userStrength >= 84) {
    if (oppStrength < 55) wp = Math.max(wp, 0.96);
    else if (oppStrength < 70) wp = Math.max(wp, 0.9);
  } else if (userStrength >= 78 && oppStrength < 52) {
    wp = Math.max(wp, 0.88);
  }

  return Math.min(0.995, Math.max(0.04, wp + bonus));
}

function pickOpponent(rng, tier) {
  const pool = CLASSIC_OPPONENTS.filter((o) => {
    if (tier === "lottery") return o.strength <= 58;
    if (tier === "playin") return o.strength <= 72;
    if (tier === "mid") return o.strength <= 82;
    if (tier === "contender") return o.strength <= 94;
    return true;
  });
  return pool[Math.floor(rng() * pool.length)] || CLASSIC_OPPONENTS[0];
}

function applySimModifiers(lineup, challenge, rng) {
  let bonus = 0;
  const mods = getSimModifiers(challenge);

  for (const mod of mods) {
    if (mod.type === "simBonus") bonus += mod.bonus ?? 0.1;
    if (mod.type === "simPenalty") bonus -= mod.penalty ?? 0.06;
  }

  if (mods.some((m) => m.id === "injury-prone")) {
    const idx = Math.floor(rng() * lineup.length);
    const target = lineup[idx]?.player;
    if (target?.ratings) {
      target.ratings = { ...target.ratings, health: Math.max(55, target.ratings.health - 18) };
    }
  }

  return bonus;
}

function opponentStrength(opponent, rng, tier) {
  const variance = tier === "lottery" ? 2 : tier === "contender" ? 4 : 3;
  return opponent.strength + (rng() - 0.5) * variance;
}

export function simulateSeason({ lineup, challenge, dayKey, userId }) {
  const seed = hashString(`${dayKey}-${userId}-sim`);
  const rng = seededRng(seed);
  const simBonus = applySimModifiers(lineup, challenge, rng);
  const strength = lineupOverall(lineup, true);
  const events = createSeasonEventCollector();

  let wins = 0;
  let losses = 0;
  const notableLosses = [];
  const seasonHighlights = [];

  for (let game = 1; game <= 82; game++) {
    let tier = "mid";
    if (game % 7 === 0) tier = "contender";
    if (game % 11 === 0) tier = "lottery";

    const opponent = pickOpponent(rng, tier);
    const oppStrength = opponentStrength(opponent, rng, tier);
    const wp = winProbability(strength, oppStrength, simBonus);
    const won = rng() < wp;

    if (game % 9 === 0) {
      const inj = maybeInjuryEvent(lineup, game, rng, events.injuries);
      if (inj) events.injuries.push(inj);
    }

    if (won) {
      wins++;
      const margin = 8 + Math.floor(rng() * 28);
      const dominant = strength - oppStrength >= 18 || margin >= 22;

      if (dominant && rng() < 0.4) {
        const blowout = {
          game,
          opponent: opponent.name,
          margin,
          type: "blowout",
        };
        events.blowouts.push(blowout);
        seasonHighlights.push(blowout);
      } else if (rng() < 0.06) {
        seasonHighlights.push({ game, opponent: opponent.name, type: "win" });
      }

      if (rng() < 0.09) {
        const perf = pickStarPerformance(lineup, rng, "career");
        perf.game = game;
        perf.opponent = opponent.name;
        events.playerGames.push(perf);
      }
    } else {
      losses++;
      const upset = oppStrength < strength - 10;
      const marquee = opponent.strength >= 88;

      if (upset) {
        const upsetEv = {
          game,
          opponent: opponent.name,
          margin: 4 + Math.floor(rng() * 12),
          upset: true,
        };
        events.upsets.push(upsetEv);
        notableLosses.push(upsetEv);
      } else if (marquee || rng() < 0.2) {
        notableLosses.push({
          game,
          opponent: opponent.name,
          margin: 3 + Math.floor(rng() * 14),
          upset: false,
        });
      }

      if (rng() < 0.07) {
        const perf = pickStarPerformance(lineup, rng, "cold");
        perf.game = game;
        perf.opponent = opponent.name;
        events.playerGames.push(perf);
      }
    }
  }

  const madePlayoffs = wins >= 42;
  let playoff = null;

  if (madePlayoffs) {
    playoff = simulatePlayoffs({ strength, simBonus, rng, wins, lineup });
  }

  const stories = generateSeasonStories({
    wins,
    losses,
    notableLosses,
    seasonHighlights,
    lineup,
    teamStrength: strength,
    events,
    rng,
  });
  if (playoff) stories.push(...generatePlayoffStories(playoff, lineup, rng));

  return {
    record: { wins, losses },
    madePlayoffs,
    playoff,
    notableLosses: notableLosses.slice(0, 8),
    seasonHighlights: seasonHighlights.slice(0, 8),
    stories,
    events,
    teamStrength: Math.round(strength * 10) / 10,
    simBonus,
  };
}

function simulatePlayoffs({ strength, simBonus, rng, wins, lineup }) {
  const rounds = [
    { name: "First Round", key: "r1", tier: "playin", winsNeeded: 4 },
    { name: "Conference Semifinals", key: "r2", tier: "mid", winsNeeded: 4 },
    { name: "Conference Finals", key: "cf", tier: "contender", winsNeeded: 4 },
    { name: "NBA Finals", key: "finals", tier: "contender", winsNeeded: 4 },
  ];

  const results = [];
  let totalPlayoffWins = 0;
  let eliminatedBy = null;
  let champion = false;
  const playoffBoost = strength >= 92 ? 5 : strength >= 88 ? 4 : strength >= 85 ? 3 : wins > 60 ? 2 : 0;

  for (const round of rounds) {
    const opponent = pickOpponent(rng, round.tier);
    const oppStrength = opponent.strength + 1 + rng() * 4;
    let roundWins = 0;
    let roundLosses = 0;
    const seriesGames = [];

    while (roundWins < round.winsNeeded && roundLosses < round.winsNeeded) {
      const wp = winProbability(strength + playoffBoost, oppStrength, simBonus);
      const won = rng() < wp;
      seriesGames.push({ won, opponent: opponent.name });
      if (won) roundWins++;
      else roundLosses++;
    }

    const wonSeries = roundWins >= round.winsNeeded;
    if (wonSeries) totalPlayoffWins += roundWins;
    else eliminatedBy = opponent.name;

    results.push({
      round: round.name,
      opponent: opponent.name,
      result: `${roundWins}-${roundLosses}`,
      won: wonSeries,
      games: seriesGames,
    });

    if (!wonSeries) break;
    if (round.key === "finals" && wonSeries) champion = true;
  }

  return {
    rounds: results,
    playoffWins: totalPlayoffWins,
    champion,
    eliminatedBy,
  };
}
