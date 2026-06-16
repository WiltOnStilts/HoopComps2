export function generateSeasonStories({ wins, losses, notableLosses, seasonHighlights, lineup }) {
  const stories = [];
  const star = lineup.reduce((best, e) => {
    const impact = e.player?.ratings?.impact || 0;
    return impact > (best?.player?.ratings?.impact || 0) ? e : best;
  }, lineup[0]);

  stories.push({
    type: "season_opening",
    headline: "Opening Night Lights",
    body: `${star?.player?.name || "Your squad"} draws the spotlight as your dynasty begins its 82-game march.`,
  });

  if (wins >= 10 && losses === 0) {
    stories.push({
      type: "hot_start",
      headline: "Red-Hot Start",
      body: `An undefeated stretch has the league buzzing. Can anyone slow this team down?`,
    });
  }

  for (const loss of (notableLosses || []).slice(0, 3)) {
    stories.push({
      type: "notable_loss",
      headline: `Game ${loss.game}: Fall to ${loss.opponent}`,
      body: `A ${loss.margin}-point defeat against ${loss.opponent} shakes the locker room. Adjustments needed.`,
    });
  }

  for (const hl of (seasonHighlights || []).slice(0, 2)) {
    stories.push({
      type: "highlight",
      headline: `Game ${hl.game}: Statement Win`,
      body: `Your squad demolishes ${hl.opponent} in a signature performance.`,
    });
  }

  if (wins >= 60) {
    stories.push({
      type: "elite_record",
      headline: "Elite Regular Season",
      body: `With ${wins} wins, home-court advantage is locked in. The playoffs await.`,
    });
  } else if (wins >= 42) {
    stories.push({
      type: "playoff_clinch",
      headline: "Playoffs Clinched!",
      body: `${wins}-${losses} — your team earns a postseason berth. The real test begins now.`,
    });
  } else {
    stories.push({
      type: "missed_playoffs",
      headline: "Season Ends Early",
      body: `At ${wins}-${losses}, the dream of a championship falls short this year.`,
    });
  }

  return stories;
}

export function generatePlayoffStories(playoff) {
  const stories = [];
  for (const round of playoff.rounds || []) {
    if (round.won) {
      stories.push({
        type: "playoff_win",
        headline: `${round.round}: Defeat ${round.opponent}`,
        body: `Series won ${round.result}! Your team advances to the next round.`,
      });
    } else {
      stories.push({
        type: "playoff_elimination",
        headline: `${round.round}: Eliminated by ${round.opponent}`,
        body: `Heartbreak — the season ends in the ${round.round} (${round.result}).`,
      });
      break;
    }
  }

  if (playoff.champion) {
    stories.push({
      type: "championship",
      headline: "🏆 NBA CHAMPIONS!",
      body: `Your dynasty is complete. Banner night. The parade is tomorrow.`,
    });
  }

  return stories;
}

export function buildShareText({ grade, score, simulation, dayKey }) {
  const { record, playoff } = simulation;
  const champ = playoff?.champion ? " 🏆 CHAMPS" : "";
  return `DynastyDraft ${dayKey}: ${grade.grade} (${score} pts) — ${record.wins}-${record.losses}${champ}. Can you go undefeated? 🏀`;
}
