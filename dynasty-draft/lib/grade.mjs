export function letterGrade(simulation, score) {
  const { record, playoff } = simulation;
  const wins = record?.wins || 0;
  const losses = record?.losses || 0;
  const champion = playoff?.champion;
  const undefeated = losses === 0 && wins === 82;

  if (undefeated && champion) return { grade: "A+", label: "Legendary", color: "#ffd700" };
  if (champion && wins >= 60) return { grade: "A+", label: "Dynasty", color: "#ffd700" };
  if (champion) return { grade: "A", label: "Champion", color: "#ff8c00" };
  if (playoff?.rounds?.length >= 3) return { grade: "A-", label: "Finals appearance", color: "#ff8c00" };
  if (playoff?.rounds?.length >= 2) return { grade: "B+", label: "Deep run", color: "#e67e22" };
  if (playoff?.rounds?.length >= 1 && playoff.rounds[0]?.won) return { grade: "B", label: "Playoff team", color: "#e67e22" };
  if (wins >= 55) return { grade: "B-", label: "Strong season", color: "#d35400" };
  if (wins >= 45) return { grade: "C+", label: "Playoff bubble", color: "#c0392b" };
  if (wins >= 35) return { grade: "C", label: "Average", color: "#a93226" };
  if (wins >= 25) return { grade: "D+", label: "Below average", color: "#922b21" };
  if (wins >= 15) return { grade: "D", label: "Struggling", color: "#7b241c" };
  if (wins >= 8) return { grade: "D-", label: "Rough year", color: "#641e16" };
  return { grade: "F", label: "Rebuild season", color: "#4a0404" };
}

export const GRADE_SCALE = [
  { grade: "A+", minScore: 500, description: "Undefeated champion — the ultimate dynasty" },
  { grade: "A", minScore: 350, description: "NBA champion with a dominant record" },
  { grade: "A-", minScore: 280, description: "Finals appearance or elite regular season" },
  { grade: "B+", minScore: 220, description: "Deep playoff run" },
  { grade: "B", minScore: 180, description: "Solid playoff team" },
  { grade: "C+", minScore: 140, description: "Winning record, competitive" },
  { grade: "C", minScore: 100, description: "Middle of the pack" },
  { grade: "D", minScore: 50, description: "Lottery team" },
  { grade: "F", minScore: 0, description: "Full rebuild" },
];
