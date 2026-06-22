const MAX_STORIES = 7;

const STORY_PRIORITY = {
  championship: 100,
  playoff_elimination: 95,
  playoff_win: 82,
  elite_record: 72,
  superteam: 70,
  strong_record: 66,
  playoff_clinch: 62,
  missed_playoffs: 60,
  upset_loss: 54,
  notable_loss: 50,
  injury: 44,
  player_explosion: 42,
  blowout: 38,
  hot_start: 34,
  strong_start: 32,
  highlight: 28,
  season_opening: 24,
  injury_watch: 18,
  player_dud: 12,
};

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function lineupStars(lineup, n = 3) {
  return [...lineup]
    .sort((a, b) => (b.player?.ratings?.impact || 0) - (a.player?.ratings?.impact || 0))
    .slice(0, n)
    .map((e) => e.player?.name)
    .filter(Boolean);
}

function starLineup(lineup) {
  return lineup.reduce((best, e) => {
    const impact = e.player?.ratings?.impact || 0;
    return impact > (best?.player?.ratings?.impact || 0) ? e : best;
  }, lineup[0]);
}

function injuryHeadline(inj) {
  const sev = inj.severity || "minor";
  if (sev === "major") return `Injury Report: ${inj.player} Out ${inj.weeks} Weeks`;
  if (sev === "moderate") return `Injury Report: ${inj.player} Sidelined`;
  return `Injury Report: ${inj.player} Day-to-Day`;
}

function injuryBody(inj, rng) {
  const sev = inj.severity || "minor";
  const bodies = {
    major: [
      `Game ${inj.game}: ${inj.player} suffered a significant injury and is expected to miss ${inj.weeks} weeks. The training staff lists them as out indefinitely.`,
      `Brutal news after Game ${inj.game}. ${inj.player} goes down with a ${inj.weeks}-week absence — depth will be tested.`,
      `${inj.player} left Game ${inj.game} and MRI results aren't good. Estimated ${inj.weeks}-week recovery.`,
    ],
    moderate: [
      `Game ${inj.game}: ${inj.player} tweaked something and will miss ${inj.weeks} games. Listed week-to-week.`,
      `${inj.player} exited Game ${inj.game} with a moderate injury. Expected back in ${inj.weeks} games.`,
    ],
    minor: [
      `Game ${inj.game}: ${inj.player} is day-to-day with a minor knock. Shouldn't miss extended time.`,
      `${inj.player} got banged up in Game ${inj.game} but avoided serious damage. Probable for next game.`,
    ],
  };
  return pick(rng, bodies[sev] || bodies.minor);
}

function performanceHeadline(perf) {
  if (perf.type === "career") {
    return `Game ${perf.game}: ${perf.player} Erupts for ${perf.pts}`;
  }
  return `Game ${perf.game}: ${perf.player} Ice Cold (${perf.pts} pts)`;
}

function performanceBody(perf, rng) {
  const statLine = `${perf.pts} PTS, ${perf.reb} REB, ${perf.ast} AST`;
  if (perf.type === "career") {
    return pick(rng, [
      `${perf.player} dropped ${statLine} on ${perf.opponent}. A vintage performance that had the arena buzzing.`,
      `Career night: ${perf.player} with ${statLine} vs ${perf.opponent}. Social media is calling it an all-timer.`,
      `${perf.player} couldn't miss — ${statLine} in a statement win over ${perf.opponent}.`,
      `Box score stuffer: ${perf.player} (${statLine}) took over Game ${perf.game} and ${perf.opponent} had no answer.`,
    ]);
  }
  return pick(rng, [
    `${perf.player} struggled to ${perf.pts} points vs ${perf.opponent} (${statLine}). One of those nights where nothing fell.`,
    `Cold shooting night for ${perf.player}: ${statLine}. ${perf.opponent} keyed the game plan on taking them out of rhythm.`,
    `${perf.player} finished ${statLine} in the loss to ${perf.opponent}. Teammates couldn't compensate for the off night.`,
  ]);
}

function isStoryworthyUpset(up, teamStrength) {
  if (up.opponentEra === "rebuild") return false;
  if (teamStrength >= 88 && (up.opponentStrength ?? 0) < 76) return false;
  if (teamStrength >= 84 && (up.opponentStrength ?? 0) < 70) return false;
  return true;
}

function lossBody(loss, starName, rosterLabel, rng) {
  const oppStr = loss.opponentStrength ?? 0;
  const margin = loss.margin;

  if (oppStr >= 88) {
    return pick(rng, [
      `${loss.opponent} brought championship pedigree and won by ${margin}. A measuring-stick loss against a true heavyweight.`,
      `A ${margin}-point defeat to ${loss.opponent}. ${starName} had ${20 + Math.floor(rng() * 15)} but the reigning formula was too much.`,
      `${loss.opponent} executed in crunch time. ${rosterLabel} ran into a team built for June.`,
    ]);
  }
  if (oppStr >= 80) {
    return pick(rng, [
      `${loss.opponent} punched their playoff ticket with a ${margin}-point win. A tough night against a legitimate contender.`,
      `A ${margin}-point loss to ${loss.opponent}. ${starName} battled, but the other side had more answers down the stretch.`,
      `${loss.opponent} made the plays that mattered. ${rosterLabel} will want that one back.`,
    ]);
  }
  return pick(rng, [
    `A ${margin}-point loss to ${loss.opponent}. ${starName} had ${18 + Math.floor(rng() * 12)} but the supporting cast went quiet.`,
    `${loss.opponent} caught fire from three and held on. ${rosterLabel} couldn't get stops when it counted.`,
    `An off night at the wrong time — ${loss.opponent} won by ${margin} despite being outgunned on paper.`,
  ]);
}

function upsetBody(up, starName, rosterLabel, rng) {
  return pick(rng, [
    `A ${up.margin}-point shocker. ${up.opponent} hit timely shots while ${rosterLabel} couldn't close.`,
    `Rare off night. ${up.opponent} out-executed a stacked roster in crunch time.`,
    `${up.opponent} played with house money and cashed in — ${starName} wasn't enough in the clutch.`,
  ]);
}

function pickDiverseTimeline(timeline, teamStrength) {
  const picked = [];
  const usedOpponents = new Set();
  const counts = { injury: 0, performance: 0, blowout: 0, upset: 0, dud: 0 };
  const limits = { injury: 1, performance: 1, blowout: 1, upset: 1, dud: 0 };

  for (const item of timeline) {
    let bucket = item.kind;
    if (bucket === "performance") {
      bucket = item.data.type === "career" ? "performance" : "dud";
    }
    if (bucket === "upset" && !isStoryworthyUpset(item.data, teamStrength)) continue;
    if (counts[bucket] >= (limits[bucket] ?? 0)) continue;

    const opp = item.data?.opponent;
    if (opp && usedOpponents.has(opp) && (bucket === "blowout" || bucket === "upset")) continue;

    picked.push(item);
    counts[bucket]++;
    if (opp) usedOpponents.add(opp);
  }

  return picked;
}

function storyOpponent(story) {
  return story.meta?.opponent || null;
}

function prioritizeStories(stories, max = MAX_STORIES) {
  const ranked = [...stories].sort(
    (a, b) => (STORY_PRIORITY[b.type] ?? 10) - (STORY_PRIORITY[a.type] ?? 10)
  );
  const selected = [];
  const usedOpponents = new Set();
  const typeCounts = {};

  for (const story of ranked) {
    if (selected.length >= max) break;

    const opp = storyOpponent(story);
    const lossLike = story.type === "upset_loss" || story.type === "notable_loss" || story.type === "blowout";
    if (opp && lossLike && usedOpponents.has(opp)) continue;

    const capType = story.type === "upset_loss" || story.type === "notable_loss";
    if (capType && (typeCounts.upset_loss || 0) + (typeCounts.notable_loss || 0) >= 1) continue;
    if (story.type === "blowout" && (typeCounts.blowout || 0) >= 1) continue;
    if (story.type === "injury" && (typeCounts.injury || 0) >= 1) continue;
    if (story.type === "player_explosion" && (typeCounts.player_explosion || 0) >= 1) continue;

    selected.push(story);
    typeCounts[story.type] = (typeCounts[story.type] || 0) + 1;
    if (opp && lossLike) usedOpponents.add(opp);
  }

  if (selected.length < Math.min(5, max)) {
    for (const story of ranked) {
      if (selected.includes(story)) continue;
      selected.push(story);
      if (selected.length >= Math.min(5, max)) break;
    }
  }

  return selected.slice(0, max);
}

export function finalizeStories(seasonStories, playoffStories = [], { max = MAX_STORIES } = {}) {
  const playoffReserve = Math.min(playoffStories.length, 2);
  const seasonCap = Math.max(4, max - playoffReserve);
  const trimmedSeason = prioritizeStories(seasonStories, seasonCap);
  const playoffTrimmed = playoffStories.slice(0, playoffReserve);
  return prioritizeStories([...trimmedSeason, ...playoffTrimmed], max);
}

export function generateSeasonStories({
  wins,
  losses,
  notableLosses,
  seasonHighlights,
  lineup,
  teamStrength,
  events = {},
  rng = () => Math.random(),
}) {
  const stories = [];
  const star = starLineup(lineup);
  const stars = lineupStars(lineup);
  const starName = star?.player?.name || "Your franchise player";
  const rosterLabel = stars.length >= 2 ? `${stars[0]} and ${stars[1]}` : starName;

  stories.push({
    type: "season_opening",
    headline: pick(rng, ["Opening Night: Lights On", "Season Tip-Off", "The March Begins"]),
    body: pick(rng, [
      `${starName} leads a revamped roster into the spotlight as the league wonders how far this experiment can go.`,
      `Media day buzz centers on ${rosterLabel} — a lineup stitched together from across NBA history.`,
      `Fans pack the arena for Game 1. ${starName} says this group has "championship habits."`,
    ]),
  });

  if (wins >= 10 && losses === 0) {
    stories.push({
      type: "hot_start",
      headline: pick(rng, ["Unbeaten & Unbothered", "Historic Hot Start", "The League Is On Notice"]),
      body: pick(rng, [
        `${wins}-0. ${rosterLabel} look like they're playing a different sport.`,
        `An undefeated run has social media calling this the best fantasy roster ever assembled.`,
      ]),
    });
  } else if (wins >= 8 && losses <= 2) {
    stories.push({
      type: "strong_start",
      headline: pick(rng, ["Fast Out of the Gate", "Contenders From Day One"]),
      body: `${wins}-${losses} through the early slate. ${starName} is playing like an MVP candidate.`,
    });
  }

  const timeline = [];
  for (const inj of events.injuries || []) {
    timeline.push({ game: inj.game, kind: "injury", data: inj });
  }
  for (const perf of events.playerGames || []) {
    timeline.push({ game: perf.game, kind: "performance", data: perf });
  }
  for (const bo of events.blowouts || []) {
    timeline.push({ game: bo.game, kind: "blowout", data: bo });
  }
  for (const up of events.upsets || []) {
    timeline.push({ game: up.game, kind: "upset", data: up });
  }
  timeline.sort((a, b) => a.game - b.game);

  for (const item of pickDiverseTimeline(timeline, teamStrength)) {
    if (item.kind === "injury") {
      stories.push({
        type: "injury",
        headline: injuryHeadline(item.data),
        body: injuryBody(item.data, rng),
        meta: { game: item.data.game },
      });
    } else if (item.kind === "performance") {
      stories.push({
        type: item.data.type === "career" ? "player_explosion" : "player_dud",
        headline: performanceHeadline(item.data),
        body: performanceBody(item.data, rng),
        meta: { game: item.data.game, opponent: item.data.opponent },
      });
    } else if (item.kind === "blowout") {
      const bo = item.data;
      stories.push({
        type: "blowout",
        headline: pick(rng, [
          `Game ${bo.game}: ${bo.margin}-Point Blowout vs ${bo.opponent}`,
          `Game ${bo.game}: Statement Win (+${bo.margin})`,
        ]),
        body: pick(rng, [
          `${rosterLabel} demolished ${bo.opponent} by ${bo.margin}. The bench cleared with minutes still on the clock.`,
          `Dominant from tip to buzzer — ${bo.margin} over ${bo.opponent}. This is what a superteam looks like.`,
        ]),
        meta: { game: bo.game, opponent: bo.opponent },
      });
    } else if (item.kind === "upset") {
      const up = item.data;
      stories.push({
        type: "upset_loss",
        headline: pick(rng, [
          `Game ${up.game}: Upset! Fall to ${up.opponent}`,
          `Game ${up.game}: Shocker vs ${up.opponent}`,
        ]),
        body: upsetBody(up, starName, rosterLabel, rng),
        meta: { game: up.game, opponent: up.opponent },
      });
    }
  }

  const upsetGames = new Set((events.upsets || []).map((u) => u.game));
  const lossCandidates = (notableLosses || []).filter((l) => !l.upset && !upsetGames.has(l.game));
  if (lossCandidates.length) {
    const best = [...lossCandidates].sort((a, b) => (b.opponentStrength ?? 0) - (a.opponentStrength ?? 0))[0];
    stories.push({
      type: "notable_loss",
      headline: pick(rng, [
        `Game ${best.game}: Fall to ${best.opponent}`,
        `Game ${best.game}: ${best.opponent} Get the Win`,
      ]),
      body: lossBody(best, starName, rosterLabel, rng),
      meta: { game: best.game, opponent: best.opponent },
    });
  }

  const highlight = (seasonHighlights || []).find((h) => h.type !== "blowout");
  if (highlight) {
    stories.push({
      type: "highlight",
      headline: pick(rng, [`Game ${highlight.game}: Statement Win`, `Game ${highlight.game}: Dominant Performance`]),
      body: pick(rng, [
        `${rosterLabel} ran ${highlight.opponent} out of the gym. The box score belongs in a museum.`,
        `A signature win over ${highlight.opponent}. ${starName} made it look effortless.`,
      ]),
      meta: { game: highlight.game, opponent: highlight.opponent },
    });
  }

  if (teamStrength >= 90 && wins >= 55) {
    stories.push({
      type: "superteam",
      headline: pick(rng, ["Superteam Confirmed", "Elite Tier Unlocked"]),
      body: `Team strength rating of ${Math.round(teamStrength)} — this roster grades among the best simulations have ever seen.`,
    });
  }

  if (wins >= 65) {
    stories.push({
      type: "elite_record",
      headline: pick(rng, ["Elite Regular Season", "Top Seed Secured"]),
      body: `${wins}-${losses}. ${starName} enters the playoffs with the target on their back — and the talent to handle it.`,
    });
  } else if (wins >= 55) {
    stories.push({
      type: "strong_record",
      headline: pick(rng, ["50-Win Season", "Legitimate Contender"]),
      body: `${wins}-${losses} — a rock-solid campaign led by ${starName}.`,
    });
  } else if (wins >= 42) {
    stories.push({
      type: "playoff_clinch",
      headline: pick(rng, ["Playoffs Clinched!", "Postseason Bound"]),
      body: `${wins}-${losses}. ${rosterLabel} punched their ticket. The real test starts now.`,
    });
  } else if (wins >= 30) {
    stories.push({
      type: "missed_playoffs",
      headline: pick(rng, ["Playoff Dreams Fade", "Short of the Dance"]),
      body: `${wins}-${losses} — talented on paper with ${starName}, but the wins didn't follow.`,
    });
  } else {
    stories.push({
      type: "missed_playoffs",
      headline: pick(rng, ["Season Ends in Disappointment", "A Year to Forget"]),
      body: `At ${wins}-${losses}, this experiment didn't pan out. Even ${starName} couldn't rescue it.`,
    });
  }

  return stories;
}

export function generatePlayoffStories(playoff, lineup, rng = () => Math.random()) {
  const stories = [];
  const star = starLineup(lineup)?.player?.name || "Your star";
  const stars = lineupStars(lineup, 2);
  const duo = stars.length >= 2 ? `${stars[0]} and ${stars[1]}` : star;

  for (const round of playoff.rounds || []) {
    if (round.won) {
      stories.push({
        type: "playoff_win",
        headline: `${round.round}: Past ${round.opponent}`,
        body: pick(rng, [
          `${round.result} over ${round.opponent}. ${duo} carried the load when it mattered most.`,
          `On to the next round. ${round.opponent} fought hard but this roster had too much firepower.`,
        ]),
        meta: { opponent: round.opponent },
      });
    } else {
      stories.push({
        type: "playoff_elimination",
        headline: `${round.round}: Eliminated by ${round.opponent}`,
        body: pick(rng, [
          `The run ends in the ${round.round} (${round.result}). ${round.opponent} had the edge in execution.`,
          `${round.opponent} ended the dream in ${round.result}. ${star} left everything on the floor.`,
        ]),
        meta: { opponent: round.opponent },
      });
      break;
    }
  }

  if (playoff.champion) {
    stories.push({
      type: "championship",
      headline: pick(rng, ["🏆 NBA CHAMPIONS!", "🏆 Banner Night!"]),
      body: pick(rng, [
        `${duo} cut down the nets. A roster for the ages just became immortal.`,
        `Champions. ${star} joins the legends who carried teams to the promised land.`,
      ]),
    });
  }

  return stories;
}

export function buildShareText({ grade, score, simulation, dayKey }) {
  const { record, playoff } = simulation;
  const champ = playoff?.champion ? " 🏆 CHAMPS" : "";
  return `DynastyDraft ${dayKey}: ${grade.grade} (${score} pts) — ${record.wins}-${record.losses}${champ}. Can you go undefeated? 🏀`;
}
