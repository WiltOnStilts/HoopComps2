import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDayKey } from "./day-key.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "dynasty-db.json");

function emptyDb() {
  return {
    dailyChallenges: [],
    submissions: [],
    userSettings: {},
    streaks: {},
    bestScores: {},
  };
}

function readDbFile() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  if (!fs.existsSync(DB_PATH)) return emptyDb();
  try {
    return { ...emptyDb(), ...JSON.parse(fs.readFileSync(DB_PATH, "utf8")) };
  } catch {
    return emptyDb();
  }
}

function writeDbFile(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export async function withDynastyStore(mutator) {
  const data = readDbFile();
  const result = mutator(data);
  writeDbFile(data);
  return result;
}

export function getUserSettings(data, userId) {
  return data.userSettings[userId] || { showStats: true, soundEnabled: true };
}

export function updateUserSettings(data, userId, patch) {
  data.userSettings[userId] = { ...getUserSettings(data, userId), ...patch };
  return data.userSettings[userId];
}

export function getUserSubmission(data, userId, dayKey) {
  return data.submissions.find((s) => s.userId === userId && s.dayKey === dayKey) || null;
}

export function updateStreak(data, userId, dayKey) {
  const streak = data.streaks[userId] || { current: 0, lastDay: null, best: 0 };
  const yesterday = previousDayKey(dayKey);

  if (streak.lastDay === dayKey) return streak;
  if (streak.lastDay === yesterday) streak.current += 1;
  else streak.current = 1;

  streak.lastDay = dayKey;
  streak.best = Math.max(streak.best, streak.current);
  data.streaks[userId] = streak;
  return streak;
}

function previousDayKey(dayKey) {
  const d = new Date(`${dayKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function updateBestScore(data, userId, score, grade) {
  const prev = data.bestScores[userId] || { score: 0, grade: "F" };
  if (score > prev.score) {
    data.bestScores[userId] = { score, grade };
  }
  return data.bestScores[userId];
}

export function getDailyLeaderboard(data, dayKey = getDayKey()) {
  const today = data.submissions.filter((s) => s.dayKey === dayKey);
  return today
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map((s, i) => ({
      rank: i + 1,
      userId: s.userId,
      score: s.score,
      grade: s.grade,
      record: s.simulation?.record,
      champion: s.simulation?.playoff?.champion || false,
    }));
}

export function saveSubmission(data, submission) {
  const idx = data.submissions.findIndex((s) => s.userId === submission.userId && s.dayKey === submission.dayKey);
  if (idx >= 0) data.submissions[idx] = submission;
  else data.submissions.push(submission);
  data.submissions = data.submissions.slice(-5000);
  return submission;
}

export { getDayKey };
