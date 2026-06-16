/** Expand career stints into season-specific roster entries */

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function scaleRating(base, age, peakAge = 27) {
  const drift = Math.abs(age - peakAge);
  const factor = clamp(1 - drift * 0.028, 0.68, 1);
  return clamp(Math.round(base * factor), 40, 99);
}

export function ratingsForCareer(career, year) {
  const age = year - career.birthYear;
  const peak = career.peakRatings || career.ratings || {};
  const peakAge = career.peakAge || 27;
  const pos = career.primaryPosition;
  const reboundBoost = pos === "C" || pos === "PF" ? 4 : 0;

  const scoring = scaleRating(peak.scoring ?? 70, age, peakAge);
  const shooting = scaleRating(peak.shooting ?? 68, age, peakAge);
  const defense = scaleRating(peak.defense ?? 68, age, peakAge);
  const playmaking = scaleRating(peak.playmaking ?? 65, age, peakAge);
  const rebounding = scaleRating((peak.rebounding ?? 62) + reboundBoost, age, peakAge);
  const health = scaleRating(peak.health ?? 82, age, peakAge);
  const impact = scaleRating(
    peak.impact ?? Math.round((scoring + shooting + defense + playmaking + rebounding) / 5),
    age,
    peakAge
  );

  return { scoring, shooting, defense, playmaking, rebounding, health, impact };
}

export function careerOnTeamInYear(career, teamId, year) {
  const aliases = { thunder: ["thunder", "supersonics"], kings: ["kings", "royals"], wizards: ["wizards", "bullets"] };
  const teamIds = aliases[teamId] || [teamId];
  return (career.stints || []).some((s) => {
    const stintTeam = s.teamId;
    const stintAliases = aliases[stintTeam] || [stintTeam];
    const match = teamIds.some((t) => stintAliases.includes(t) || stintTeam === t);
    return match && year >= s.from && year <= s.to;
  });
}

export function expandCareerToSeason(career, teamId, year) {
  if (!careerOnTeamInYear(career, teamId, year)) return null;

  const age = year - career.birthYear;
  const experience = Math.max(1, year - (career.debut || year) + 1);
  const ratings = ratingsForCareer(career, year);
  const allStar =
    career.allStarYears?.includes(year) ||
    (career.allStar && !career.allStarYears && ratings.impact >= 85);

  return {
    id: `${career.id}-${year}`,
    name: career.name,
    teamId,
    year,
    age,
    experience,
    positions: career.positions || [career.primaryPosition],
    primaryPosition: career.primaryPosition,
    allStar: Boolean(allStar),
    ratings,
  };
}

export function expandExplicitEntry(entry, teamId, year) {
  return {
    id: entry.id || `${slug(entry.name)}-${teamId}-${year}`,
    name: entry.name,
    teamId,
    year,
    age: entry.age ?? 25,
    experience: entry.experience ?? 3,
    positions: entry.positions || [entry.primaryPosition || "SF"],
    primaryPosition: entry.primaryPosition || entry.positions?.[0] || "SF",
    allStar: Boolean(entry.allStar),
    ratings: entry.ratings || ratingsForCareer({ birthYear: year - 25, peakRatings: entry.peakRatings, primaryPosition: entry.primaryPosition }, year),
  };
}

function slug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
