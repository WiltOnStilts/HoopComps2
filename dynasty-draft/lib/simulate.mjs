import { lineupOverall } from "./players.mjs";
import { getSimModifierIds } from "./challenge.mjs";
import { generateSeasonStories, generatePlayoffStories } from "./stories.mjs";

const CLASSIC_OPPONENTS = [
  { name: "1996 Chicago Bulls", strength: 98, era: "dynasty" },
  { name: "2017 Golden State Warriors", strength: 96, era: "dynasty" },
  { name: "1986 Boston Celtics", strength: 94, era: "dynasty" },
  { name: "2001 Los Angeles Lakers", strength: 93, era: "champion" },
  { name: "2013 Miami Heat", strength: 92, era: "champion" },
  { name: "2008 Boston Celtics", strength: 90, era: "champion" },
  { name: "2019 Toronto Raptors", strength: 88, era: "champion" },
  { name: "2020 Los Angeles Lakers", strength: 87, era: "champion" },
  { name: "2011 Dallas Mavericks", strength: 85, era: "champion" },
  { name: "2004 Detroit Pistons", strength: 84, era: "champion" },
  { name: "2018 Houston Rockets", strength: 86, era: "contender" },
  { name: "2023 Denver Nuggets", strength: 88, era: "champion" },
  { name: "2024 Boston Celtics", strength: 89, era: "champion" },
  { name: "1994 New York Knicks", strength: 82, era: "contender" },
  { name: "2006 Phoenix Suns", strength: 83, era: "contender" },
  { name: "2015 Atlanta Hawks", strength: 78, era: "contender" },
  { name: "2026 Sacramento Kings", strength: 52, era: "rebuild" },
  { name: "2026 Washington Wizards", strength: 48, era: "rebuild" },
  { name: "2026 Charlotte Hornets", strength: 50, era: "rebuild" },
  { name: "2026 Detroit Pistons", strength: 55, era: "rebuild" },
];

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
  const base = 1 / (1 + Math.exp(-diff / 8));
  return Math.min(0.97, Math.max(0.03, base + bonus));
}

function pickOpponent(rng, tier) {
  const pool = CLASSIC_OPPONENTS.filter((o) => {
    if (tier === "lottery") return o.strength <= 60;
    if (tier === "playin") return o.strength <= 72;
    if (tier === "mid") return o.strength <= 82;
    if (tier === "contender") return o.strength <= 90;
    return true;
  });
  return pool[Math.floor(rng() * pool.length)] || CLASSIC_OPPONENTS[0];
}

function applySimModifiers(lineup, challenge, rng) {
  let bonus = 0;
  const modifierIds = getSimModifierIds(challenge);
  if (modifierIds.includes("home-court")) bonus += 0.03;
  if (modifierIds.includes("injury-prone")) {
    const idx = Math.floor(rng() * lineup.length);
    const target = lineup[idx]?.player;
    if (target?.ratings) target.ratings = { ...target.ratings, health: Math.max(60, target.ratings.health - 10) };
  }
  return bonus;
}

export function simulateSeason({ lineup, challenge, dayKey, userId }) {
  const seed = hashString(`${dayKey}-${userId}-sim`);
  const rng = seededRng(seed);
  const simBonus = applySimModifiers(lineup, challenge, rng);
  const strength = lineupOverall(lineup, true);

  let wins = 0;
  let losses = 0;
  const notableLosses = [];
  const seasonHighlights = [];

  for (let game = 1; game <= 82; game++) {
    let tier = "mid";
    if (game % 7 === 0) tier = "contender";
    if (game % 11 === 0) tier = "lottery";
    const opponent = pickOpponent(rng, tier);
    const oppStrength = opponent.strength + (rng() - 0.5) * 6;
    const wp = winProbability(strength, oppStrength, simBonus);
    const won = rng() < wp;
    if (won) {
      wins++;
      if (rng() < 0.04) seasonHighlights.push({ game, opponent: opponent.name, type: "blowout" });
    } else {
      losses++;
      if (opponent.strength >= 85 || rng() < 0.15) {
        notableLosses.push({ game, opponent: opponent.name, margin: 3 + Math.floor(rng() * 15) });
      }
    }
  }

  const madePlayoffs = wins >= 42;
  let playoff = null;

  if (madePlayoffs) {
    playoff = simulatePlayoffs({ strength, simBonus, rng, wins });
  }

  const stories = generateSeasonStories({ wins, losses, notableLosses, seasonHighlights, lineup });
  if (playoff) stories.push(...generatePlayoffStories(playoff));

  return {
    record: { wins, losses },
    madePlayoffs,
    playoff,
    notableLosses: notableLosses.slice(0, 8),
    seasonHighlights: seasonHighlights.slice(0, 5),
    stories,
    teamStrength: Math.round(strength * 10) / 10,
    simBonus,
  };
}

function simulatePlayoffs({ strength, simBonus, rng, wins }) {
  const rounds = [
    { name: "First Round", key: "r1", tier: "playin", winsNeeded: 4, games: 7 },
    { name: "Conference Semifinals", key: "r2", tier: "mid", winsNeeded: 4, games: 7 },
    { name: "Conference Finals", key: "cf", tier: "contender", winsNeeded: 4, games: 7 },
    { name: "NBA Finals", key: "finals", tier: "contender", winsNeeded: 4, games: 7 },
  ];

  const results = [];
  let totalPlayoffWins = 0;
  let eliminatedBy = null;
  let champion = false;

  for (const round of rounds) {
    const opponent = pickOpponent(rng, round.tier);
    const oppStrength = opponent.strength + 2 + rng() * 4;
    let roundWins = 0;
    let roundLosses = 0;
    const seriesGames = [];

    while (roundWins < round.winsNeeded && roundLosses < round.winsNeeded) {
      const wp = winProbability(strength + (wins > 60 ? 2 : 0), oppStrength, simBonus);
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
      result: wonSeries ? `${roundWins}-${roundLosses}` : `${roundWins}-${roundLosses}`,
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
