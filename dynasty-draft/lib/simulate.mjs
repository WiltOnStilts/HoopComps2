import { lineupOverall } from "./players.mjs";
import { getSimModifiers } from "./challenge.mjs";
import { CLASSIC_OPPONENTS } from "./opponents.mjs";
import { generateSeasonStories, generatePlayoffStories, finalizeStories } from "./stories.mjs";
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

  if (userStrength >= 92) {
    if (oppStrength < 75) wp = Math.max(wp, 0.9992);
    else if (oppStrength < 82) wp = Math.max(wp, 0.985);
    else if (oppStrength < 90) wp = Math.max(wp, 0.9);
    else wp = Math.max(wp, 0.74);
  } else if (userStrength >= 88) {
    if (oppStrength < 70) wp = Math.max(wp, 0.998);
    else if (oppStrength < 78) wp = Math.max(wp, 0.975);
    else if (oppStrength < 86) wp = Math.max(wp, 0.9);
    else wp = Math.max(wp, 0.76);
  } else if (userStrength >= 84) {
    if (oppStrength < 65) wp = Math.max(wp, 0.99);
    else if (oppStrength < 74) wp = Math.max(wp, 0.94);
    else if (oppStrength < 82) wp = Math.max(wp, 0.86);
  } else if (userStrength >= 78 && oppStrength < 58) {
    wp = Math.max(wp, 0.92);
  }

  return Math.min(0.995, Math.max(0.04, wp + bonus));
}

function filterPoolForTier(tier) {
  return CLASSIC_OPPONENTS.filter((o) => {
    if (tier === "lottery") return o.strength <= 58;
    if (tier === "playin") return o.strength >= 60 && o.strength <= 72;
    if (tier === "mid") return o.strength >= 68 && o.strength <= 86;
    if (tier === "contender") return o.strength >= 80;
    return true;
  });
}

function pickOpponent(rng, tier, { userStrength = 0, usedOpponents = null } = {}) {
  let pool = filterPoolForTier(tier);
  if (!pool.length) pool = [...CLASSIC_OPPONENTS];

  if (userStrength >= 90) {
    const respectable = pool.filter((o) => o.strength >= 74 && o.era !== "rebuild");
    if (respectable.length) pool = respectable;
  } else if (userStrength >= 86) {
    const noRebuild = pool.filter((o) => o.era !== "rebuild" || o.strength >= 62);
    if (noRebuild.length) pool = noRebuild;
  }

  if (usedOpponents?.size) {
    const fresh = pool.filter((o) => !usedOpponents.has(o.name));
    if (fresh.length >= 2) pool = fresh;
  }

  const pick = pool[Math.floor(rng() * pool.length)] || CLASSIC_OPPONENTS[0];
  usedOpponents?.add(pick.name);
  return pick;
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

function isUpsetLoss(strength, opponent, oppStrength) {
  if (opponent.era === "rebuild") return false;
  if (strength >= 88 && opponent.strength < 76) return false;
  if (strength >= 84 && opponent.strength < 70) return false;
  return oppStrength < strength - 12 && opponent.strength >= 72;
}

function lossEvent(game, opponent, margin, upset) {
  return {
    game,
    opponent: opponent.name,
    opponentStrength: opponent.strength,
    opponentEra: opponent.era,
    margin,
    upset,
  };
}

export function simulateSeason({ lineup, challenge, dayKey, userId }) {
  const seed = hashString(`${dayKey}-${userId}-sim`);
  const rng = seededRng(seed);
  const simBonus = applySimModifiers(lineup, challenge, rng);
  const strength = lineupOverall(lineup, true);
  const events = createSeasonEventCollector();
  const usedOpponents = new Set();

  let wins = 0;
  let losses = 0;
  const notableLosses = [];
  const seasonHighlights = [];

  for (let game = 1; game <= 82; game++) {
    let tier = "mid";
    if (game % 7 === 0) tier = "contender";
    if (game % 11 === 0) tier = "lottery";

    const opponent = pickOpponent(rng, tier, { userStrength: strength, usedOpponents });
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

      if (dominant && rng() < 0.15 && events.blowouts.length < 2) {
        const blowout = {
          game,
          opponent: opponent.name,
          opponentStrength: opponent.strength,
          margin,
          type: "blowout",
        };
        events.blowouts.push(blowout);
        seasonHighlights.push(blowout);
      } else if (rng() < 0.04 && seasonHighlights.length < 4) {
        seasonHighlights.push({
          game,
          opponent: opponent.name,
          opponentStrength: opponent.strength,
          type: "win",
        });
      }

      if (rng() < 0.07 && events.playerGames.length < 3) {
        const perf = pickStarPerformance(lineup, rng, "career");
        perf.game = game;
        perf.opponent = opponent.name;
        events.playerGames.push(perf);
      }
    } else {
      losses++;
      const upset = isUpsetLoss(strength, opponent, oppStrength);
      const marquee = opponent.strength >= 84;

      if (upset && events.upsets.length < 2) {
        const upsetEv = lossEvent(game, opponent, 4 + Math.floor(rng() * 12), true);
        events.upsets.push(upsetEv);
        notableLosses.push(upsetEv);
      } else if ((marquee || (rng() < 0.12 && opponent.strength >= 78)) && notableLosses.length < 6) {
        notableLosses.push(lossEvent(game, opponent, 3 + Math.floor(rng() * 14), false));
      }

      if (rng() < 0.05 && events.playerGames.length < 3) {
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

  const seasonStories = generateSeasonStories({
    wins,
    losses,
    notableLosses,
    seasonHighlights,
    lineup,
    teamStrength: strength,
    events,
    rng,
  });
  const playoffStories = playoff ? generatePlayoffStories(playoff, lineup, rng) : [];
  const stories = finalizeStories(seasonStories, playoffStories);

  const uniqueNotableLosses = [];
  const seenLossOpponents = new Set();
  for (const loss of notableLosses) {
    if (seenLossOpponents.has(loss.opponent)) continue;
    seenLossOpponents.add(loss.opponent);
    uniqueNotableLosses.push(loss);
    if (uniqueNotableLosses.length >= 5) break;
  }

  return {
    record: { wins, losses },
    madePlayoffs,
    playoff,
    notableLosses: uniqueNotableLosses,
    seasonHighlights: seasonHighlights.slice(0, 4),
    stories,
    events,
    teamStrength: Math.round(strength * 10) / 10,
    simBonus,
  };
}

function simulatePlayoffs({ strength, simBonus, rng, wins, lineup }) {
  const rounds = [
    { name: "First Round", key: "r1", tier: "mid", winsNeeded: 4 },
    { name: "Conference Semifinals", key: "r2", tier: "contender", winsNeeded: 4 },
    { name: "Conference Finals", key: "cf", tier: "contender", winsNeeded: 4 },
    { name: "NBA Finals", key: "finals", tier: "contender", winsNeeded: 4 },
  ];

  const results = [];
  let totalPlayoffWins = 0;
  let eliminatedBy = null;
  let champion = false;
  const playoffBoost = strength >= 92 ? 5 : strength >= 88 ? 4 : strength >= 85 ? 3 : wins > 60 ? 2 : 0;
  const usedOpponents = new Set();

  for (const round of rounds) {
    const opponent = pickOpponent(rng, round.tier, { userStrength: strength, usedOpponents });
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
