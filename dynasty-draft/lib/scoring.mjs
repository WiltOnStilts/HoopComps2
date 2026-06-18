export function calculateScore(simulation) {
  const { record, playoff, teamStrength } = simulation;
  let score = 0;

  score += (record?.wins || 0) * 2;
  score += (playoff?.playoffWins || 0) * 8;

  if (playoff?.champion) score += 150;
  if (record?.losses === 0 && record?.wins === 82) score += 400;
  if (playoff?.champion && record?.losses === 0) score += 200;

  // Reward dominant rosters that win at a high clip
  if ((record?.wins || 0) >= 60 && (teamStrength || 0) >= 88) score += 25;
  if ((record?.wins || 0) >= 55 && (teamStrength || 0) >= 85) score += 15;

  return score;
}

export function scoreBreakdown(simulation) {
  const { record, playoff } = simulation;
  const items = [];
  const regWins = record?.wins || 0;
  items.push({ label: "Regular season wins", points: regWins * 2, detail: `${regWins} × 2` });

  const poWins = playoff?.playoffWins || 0;
  if (poWins) items.push({ label: "Playoff wins", points: poWins * 8, detail: `${poWins} × 8` });

  if (playoff?.champion) items.push({ label: "Championship bonus", points: 150, detail: "🏆" });

  if (record?.losses === 0 && record?.wins === 82) {
    items.push({ label: "Undefeated regular season", points: 400, detail: "82-0" });
  }
  if (playoff?.champion && record?.losses === 0) {
    items.push({ label: "Perfect season bonus", points: 200, detail: "82-0 + title" });
  }

  if ((record?.wins || 0) >= 60 && (simulation.teamStrength || 0) >= 88) {
    items.push({ label: "Elite roster bonus", points: 25, detail: "60+ wins, 88+ strength" });
  } else if ((record?.wins || 0) >= 55 && (simulation.teamStrength || 0) >= 85) {
    items.push({ label: "Contender bonus", points: 15, detail: "55+ wins, 85+ strength" });
  }

  const total = items.reduce((s, i) => s + i.points, 0);
  return { items, total };
}
