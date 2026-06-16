export function calculateScore(simulation) {
  const { record, playoff } = simulation;
  let score = 0;

  score += (record?.wins || 0) * 2;
  score += (playoff?.playoffWins || 0) * 8;

  if (playoff?.champion) score += 150;
  if (record?.losses === 0 && record?.wins === 82) score += 400;
  if (playoff?.champion && record?.losses === 0) score += 200;

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

  const total = items.reduce((s, i) => s + i.points, 0);
  return { items, total };
}
