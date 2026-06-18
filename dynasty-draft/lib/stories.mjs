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

  const openHeadlines = ["Opening Night: Lights On", "Season Tip-Off", "The March Begins", "82 Games Await"];
  const openBodies = [
    `${starName} leads a revamped roster into the spotlight as the league wonders how far this experiment can go.`,
    `Media day buzz centers on ${rosterLabel} — a lineup stitched together from across NBA history.`,
    `Fans pack the arena for Game 1. ${starName} says this group has "championship habits."`,
    `Analysts call ${rosterLabel} one of the most intriguing builds of the season. The proof starts now.`,
  ];
  stories.push({
    type: "season_opening",
    headline: pick(rng, openHeadlines),
    body: pick(rng, openBodies),
  });

  // Injury risk preview at season start
  const fragile = lineup.filter((e) => (e.player?.ratings?.health || 99) < 78);
  if (fragile.length) {
    const names = fragile.map((e) => e.player.name).slice(0, 2).join(" and ");
    stories.push({
      type: "injury_watch",
      headline: pick(rng, ["Medical Staff on Alert", "Injury Watch List", "Health Concerns Enter Season"]),
      body: pick(rng, [
        `Team doctors flag ${names} as high-risk based on durability ratings. Load management could factor in.`,
        `${names} enter the year with injury concerns. The training staff has a plan — but health is never guaranteed.`,
      ]),
    });
  }

  if (wins >= 10 && losses === 0) {
    stories.push({
      type: "hot_start",
      headline: pick(rng, ["Unbeaten & Unbothered", "Historic Hot Start", "The League Is On Notice"]),
      body: pick(rng, [
        `${wins}-0. ${rosterLabel} look like they're playing a different sport. Opponents are searching for answers.`,
        `An undefeated run has social media calling this the best fantasy roster ever assembled.`,
        `Vegas odds on an undefeated season just shifted. ${starName} says the group isn't satisfied yet.`,
      ]),
    });
  } else if (wins >= 8 && losses <= 2) {
    stories.push({
      type: "strong_start",
      headline: pick(rng, ["Fast Out of the Gate", "Contenders From Day One"]),
      body: `${wins}-${losses} through the early slate. ${starName} is playing like an MVP candidate.`,
    });
  }

  // Merge timeline: injuries, performances, blowouts, upsets by game number
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

  for (const item of timeline.slice(0, 14)) {
    if (item.kind === "injury") {
      stories.push({
        type: "injury",
        headline: injuryHeadline(item.data),
        body: injuryBody(item.data, rng),
      });
    } else if (item.kind === "performance") {
      stories.push({
        type: item.data.type === "career" ? "player_explosion" : "player_dud",
        headline: performanceHeadline(item.data),
        body: performanceBody(item.data, rng),
      });
    } else if (item.kind === "blowout") {
      const bo = item.data;
      stories.push({
        type: "blowout",
        headline: pick(rng, [
          `Game ${bo.game}: ${bo.margin}-Point Blowout vs ${bo.opponent}`,
          `Game ${bo.game}: Rout of ${bo.opponent}`,
          `Game ${bo.game}: Statement Win (+${bo.margin})`,
        ]),
        body: pick(rng, [
          `${rosterLabel} demolished ${bo.opponent} by ${bo.margin}. The bench cleared with minutes still on the clock.`,
          `A ${bo.margin}-point hammering of ${bo.opponent}. ${starName} didn't even need to play the fourth quarter.`,
          `Dominant from tip to buzzer — ${bo.margin} over ${bo.opponent}. This is what a superteam looks like.`,
        ]),
      });
    } else if (item.kind === "upset") {
      const up = item.data;
      stories.push({
        type: "upset_loss",
        headline: pick(rng, [
          `Game ${up.game}: Upset! Fall to ${up.opponent}`,
          `Game ${up.game}: Shocker vs ${up.opponent}`,
          `Game ${up.game}: Stunned by ${up.opponent}`,
        ]),
        body: pick(rng, [
          `A ${up.margin}-point stunner. ${up.opponent} punched above their weight and ${starName} wasn't enough in the clutch.`,
          `Rare off night. ${up.opponent} outworked a stacked roster. Film session will be brutal.`,
          `The scoreboard lied all night — ${up.opponent} hit timely shots while ${rosterLabel} couldn't close.`,
        ]),
      });
    }
  }

  // Notable losses not already covered as upsets
  const upsetGames = new Set((events.upsets || []).map((u) => u.game));
  for (const loss of (notableLosses || []).filter((l) => !l.upset && !upsetGames.has(l.game)).slice(0, 3)) {
    stories.push({
      type: "notable_loss",
      headline: pick(rng, [
        `Game ${loss.game}: Fall to ${loss.opponent}`,
        `Game ${loss.game}: ${loss.opponent} Get the Win`,
        `Game ${loss.game}: Battle Lost`,
      ]),
      body: pick(rng, [
        `${loss.opponent} brought championship pedigree and won by ${loss.margin}. A measuring-stick loss.`,
        `A ${loss.margin}-point defeat to ${loss.opponent}. ${starName} had ${20 + Math.floor(rng() * 15)} but needed more help.`,
        `${loss.opponent} executed in crunch time. ${rosterLabel} left points on the floor.`,
      ]),
    });
  }

  for (const hl of (seasonHighlights || []).filter((h) => h.type !== "blowout").slice(0, 2)) {
    stories.push({
      type: "highlight",
      headline: pick(rng, [
        `Game ${hl.game}: Statement Win`,
        `Game ${hl.game}: Dominant Performance`,
        `Game ${hl.game}: ${hl.opponent} Routed`,
      ]),
      body: pick(rng, [
        `${rosterLabel} ran ${hl.opponent} out of the gym. The box score belongs in a museum.`,
        `A signature win over ${hl.opponent}. ${starName} made it look effortless.`,
        `Defensive clamps, transition threes, and ${starName} in the post — ${hl.opponent} had no answers.`,
      ]),
    });
  }

  if (teamStrength >= 90 && wins >= 55) {
    stories.push({
      type: "superteam",
      headline: pick(rng, ["Superteam Confirmed", "Elite Tier Unlocked", "Historically Great?"]),
      body: pick(rng, [
        `Team strength rating of ${Math.round(teamStrength)} — this roster grades among the best simulations have ever seen.`,
        `Opponents are calling ${starName} "unfair." The numbers back them up.`,
        `${rosterLabel} aren't just winning — they're dictating how the game is played.`,
      ]),
    });
  }

  if (wins >= 65) {
    stories.push({
      type: "elite_record",
      headline: pick(rng, ["Elite Regular Season", "Top Seed Secured", "Home Court All the Way"]),
      body: pick(rng, [
        `${wins} wins. ${starName} enters the playoffs with the target on their back — and the talent to handle it.`,
        `A ${wins}-${losses} masterpiece. ${rosterLabel} enter the postseason as the team to beat.`,
        `${wins}-${losses} — only ${losses} losses all year. Who is beating this team ${losses} times?`,
      ]),
    });
  } else if (wins >= 55) {
    stories.push({
      type: "strong_record",
      headline: pick(rng, ["50-Win Season", "Legitimate Contender", "Playoff Bound"]),
      body: `${wins}-${losses} — a rock-solid campaign led by ${starName}. The postseason should be special.`,
    });
  } else if (wins >= 42) {
    stories.push({
      type: "playoff_clinch",
      headline: pick(rng, ["Playoffs Clinched!", "Postseason Bound", "April Basketball Awaits"]),
      body: pick(rng, [
        `${wins}-${losses}. ${rosterLabel} punched their ticket. The real test starts now.`,
        `Playoff basketball secured. ${starName} says the regular season was "just warm-ups."`,
        `A ${wins}-win season ends with champagne in the locker room. Championship dreams live.`,
      ]),
    });
  } else if (wins >= 30) {
    stories.push({
      type: "missed_playoffs",
      headline: pick(rng, ["Playoff Dreams Fade", "Short of the Dance", "What Could Have Been"]),
      body: pick(rng, [
        `${wins}-${losses} — talented on paper with ${starName}, but the wins didn't follow. Summer questions loom.`,
        `A disappointing ${wins}-win finish. ${rosterLabel} underachieved relative to their star power.`,
        `The math didn't work. ${starName} deserved a better supporting cast on some nights.`,
      ]),
    });
  } else {
    stories.push({
      type: "missed_playoffs",
      headline: pick(rng, ["Season Ends in Disappointment", "Rebuild Mode?", "A Year to Forget"]),
      body: pick(rng, [
        `At ${wins}-${losses}, this experiment didn't pan out. Even ${starName} couldn't rescue it.`,
        `A brutal ${wins}-win campaign. Fans expected more from ${rosterLabel}.`,
        `The lottery looms. ${starName} deserves better than a ${wins}-win slog.`,
      ]),
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
        headline: pick(rng, [
          `${round.round}: Past ${round.opponent}`,
          `${round.round}: Series Won`,
          `${round.round}: Moving On`,
        ]),
        body: pick(rng, [
          `${round.result} over ${round.opponent}. ${duo} carried the load when it mattered most.`,
          `Survived ${round.opponent} in ${round.result}. ${star} elevated in the fourth quarter.`,
          `On to the next round. ${round.opponent} fought hard but this roster had too much firepower.`,
        ]),
      });
    } else {
      stories.push({
        type: "playoff_elimination",
        headline: pick(rng, [
          `${round.round}: Eliminated by ${round.opponent}`,
          `${round.round}: Season Over`,
          `${round.round}: Heartbreak`,
        ]),
        body: pick(rng, [
          `The run ends in the ${round.round} (${round.result}). ${round.opponent} had the edge in execution.`,
          `${round.opponent} ended the dream in ${round.result}. ${star} left everything on the floor.`,
          `A crushing ${round.result} loss to ${round.opponent}. This roster will wonder what-if for a long time.`,
        ]),
      });
      break;
    }
  }

  if (playoff.champion) {
    stories.push({
      type: "championship",
      headline: pick(rng, ["🏆 NBA CHAMPIONS!", "🏆 Banner Night!", "🏆 Dynasty Complete!"]),
      body: pick(rng, [
        `${duo} cut down the nets. A roster for the ages just became immortal.`,
        `Parade tomorrow. ${star} hoists the trophy — this is what the daily challenge is all about.`,
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
