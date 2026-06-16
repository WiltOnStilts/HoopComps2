/** DynastyDraft — game UI */

import { isLoggedIn } from "./auth.js";
import {
  fetchDynastyToday,
  fetchDynastyPlayers,
  submitDynastyLineup,
  updateDynastySettings,
  fetchDynastyLeaderboard,
} from "./api.js";
import { searchFriendCandidates, sendFriendRequest } from "./social.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SLOTS = ["PG", "SG", "SF", "PF", "C", "sixth"];
const SLOT_LABELS = {
  PG: "Point Guard",
  SG: "Shooting Guard",
  SF: "Small Forward",
  PF: "Power Forward",
  C: "Center",
  sixth: "6th Man",
};

let audioCtx = null;
let dynastyState = {
  challenge: null,
  settings: { showStats: true, soundEnabled: true },
  submission: null,
  streak: { current: 0, best: 0 },
  best: { score: 0, grade: "F" },
  picks: [],
  assignments: {},
  currentRound: 0,
  playersCache: [],
  players: {},
  phase: "loading",
  spinning: false,
  spinDisplay: null,
  pendingPlayer: null,
  selectedLineupSlot: null,
  playError: null,
};

function challengeIsValid(challenge) {
  return Array.isArray(challenge?.rounds) && challenge.rounds.length === 6;
}

async function ensureChallengeFresh() {
  if (challengeIsValid(dynastyState.challenge)) return true;
  const data = await fetchDynastyToday();
  dynastyState.challenge = data.challenge;
  return challengeIsValid(dynastyState.challenge);
}

function playSound(type) {
  if (!dynastyState.settings.soundEnabled) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const freqs = { spin: 220, pick: 440, win: 660, submit: 550 };
    osc.frequency.value = freqs[type] || 330;
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch {
    /* audio optional */
  }
}

function getRoundConfig(index) {
  return dynastyState.challenge?.rounds?.[index] || null;
}

function getPickByPlayerId(playerId) {
  return dynastyState.picks.find((p) => p.player.id === playerId);
}

function canPlayPosition(player, position) {
  if (position === "sixth") return true;
  const positions = player.positions || [];
  if (positions.includes(position)) return true;
  const adjacency = {
    PG: ["SG"],
    SG: ["PG", "SF"],
    SF: ["SG", "PF"],
    PF: ["SF", "C"],
    C: ["PF"],
  };
  return adjacency[position]?.includes(player.primaryPosition) || false;
}

function playerEligibleSlots(player) {
  return SLOTS.filter((slot) => canPlayPosition(player, slot));
}

function findPlayerSlot(playerId) {
  for (const slot of SLOTS) {
    if (dynastyState.assignments[slot] === playerId) return slot;
  }
  return null;
}

function canMutualSwap(playerA, slotA, playerB, slotB) {
  return canPlayPosition(playerA, slotB) && canPlayPosition(playerB, slotA);
}

function tryMutualSwap(slotA, slotB) {
  const idA = dynastyState.assignments[slotA];
  const idB = dynastyState.assignments[slotB];
  if (!idA || !idB || slotA === slotB) return false;
  const pickA = getPickByPlayerId(idA);
  const pickB = getPickByPlayerId(idB);
  if (!pickA || !pickB) return false;
  if (!canMutualSwap(pickA.player, slotA, pickB.player, slotB)) return false;
  dynastyState.assignments[slotA] = idB;
  dynastyState.assignments[slotB] = idA;
  return true;
}

function tryMoveToSlot(fromSlot, toSlot) {
  const playerId = dynastyState.assignments[fromSlot];
  if (!playerId || dynastyState.assignments[toSlot] || fromSlot === toSlot) return false;
  const pick = getPickByPlayerId(playerId);
  if (!pick || !canPlayPosition(pick.player, toSlot)) return false;
  delete dynastyState.assignments[fromSlot];
  dynastyState.assignments[toSlot] = playerId;
  return true;
}

function canMoveToEmptyPreview(fromSlot, toSlot) {
  if (dynastyState.assignments[toSlot]) return false;
  const playerId = dynastyState.assignments[fromSlot];
  const pick = getPickByPlayerId(playerId);
  return Boolean(pick && canPlayPosition(pick.player, toSlot));
}

function handleLineupSlotClick(slot) {
  const playerId = dynastyState.assignments[slot];
  const selected = dynastyState.selectedLineupSlot;

  if (!playerId) {
    if (!selected || selected === slot) return;
    if (tryMoveToSlot(selected, slot)) playSound("pick");
    dynastyState.selectedLineupSlot = null;
    return;
  }

  if (!selected) {
    dynastyState.selectedLineupSlot = slot;
    return;
  }
  if (selected === slot) {
    dynastyState.selectedLineupSlot = null;
    return;
  }
  if (tryMutualSwap(selected, slot)) playSound("pick");
  dynastyState.selectedLineupSlot = null;
}

function renderLineupSlot(slot, { interactive = false } = {}) {
  const playerId = dynastyState.assignments[slot];
  const pick = playerId ? getPickByPlayerId(playerId) : null;
  const posLabel = slot === "sixth" ? "6th" : slot;
  const inner = `
    <span class="dyn-lineup-pos">${posLabel}</span>
    <span class="dyn-lineup-pick">${pick ? escapeHtml(pick.player.name) : "—"}</span>
  `;

  if (!interactive) {
    return `<div class="dyn-lineup-slot${pick ? " filled" : ""}">${inner}</div>`;
  }

  const selected = dynastyState.selectedLineupSlot;

  if (!playerId) {
    const canMoveHere = selected && canMoveToEmptyPreview(selected, slot);
    if (canMoveHere) {
      return `
        <button type="button" class="dyn-lineup-slot move-target" data-lineup-slot="${slot}">
          ${inner}
        </button>
      `;
    }
    return `<div class="dyn-lineup-slot">${inner}</div>`;
  }

  const isSelected = selected === slot;
  const canSwapTarget =
    selected && selected !== slot && tryMutualSwapPreview(selected, slot);

  return `
    <button type="button" class="dyn-lineup-slot filled${isSelected ? " active" : ""}${canSwapTarget ? " swap-target" : ""}" data-lineup-slot="${slot}">
      ${inner}
    </button>
  `;
}

function tryMutualSwapPreview(slotA, slotB) {
  const idA = dynastyState.assignments[slotA];
  const idB = dynastyState.assignments[slotB];
  if (!idA || !idB) return false;
  const pickA = getPickByPlayerId(idA);
  const pickB = getPickByPlayerId(idB);
  if (!pickA || !pickB) return false;
  return canMutualSwap(pickA.player, slotA, pickB.player, slotB);
}

function assignPlayerToSlot(slot, playerId) {
  const existingId = dynastyState.assignments[slot];
  const sourceSlot = findPlayerSlot(playerId);

  if (!existingId) {
    if (sourceSlot) delete dynastyState.assignments[sourceSlot];
    dynastyState.assignments[slot] = playerId;
    return true;
  }
  if (existingId === playerId) return true;
  if (!sourceSlot) return false;

  const incoming = getPickByPlayerId(playerId)?.player;
  const outgoing = getPickByPlayerId(existingId)?.player;
  if (!incoming || !outgoing) return false;
  if (!canMutualSwap(incoming, slot, outgoing, sourceSlot)) return false;

  dynastyState.assignments[slot] = playerId;
  dynastyState.assignments[sourceSlot] = existingId;
  return true;
}

function usedPlayerIds() {
  return new Set(dynastyState.picks.map((p) => p.player.id));
}

function allSlotsFilled() {
  return SLOTS.every((s) => dynastyState.assignments[s]);
}

function statBar(value, label) {
  const v = Math.round(value || 0);
  return `<div class="dyn-stat"><span class="dyn-stat-label">${label}</span><div class="dyn-stat-bar"><div class="dyn-stat-fill" style="width:${v}%"></div></div><span class="dyn-stat-val">${v}</span></div>`;
}

const FULL_STAT_LABELS = [
  ["scoring", "Scoring"],
  ["shooting", "Shooting"],
  ["defense", "Defense"],
  ["playmaking", "Playmaking"],
  ["rebounding", "Rebounding"],
  ["health", "Health"],
];

const SHORT_STAT_LABELS = [
  ["scoring", "SC"],
  ["shooting", "SH"],
  ["defense", "DF"],
  ["playmaking", "PM"],
  ["rebounding", "RB"],
  ["health", "HL"],
];

function renderPlayerStats(ratings, { fullLabels = false } = {}) {
  const labels = fullLabels ? FULL_STAT_LABELS : SHORT_STAT_LABELS;
  const statsClass = fullLabels ? "dyn-player-stats dyn-player-stats--draft" : "dyn-player-stats";
  return `<div class="${statsClass}">${labels.map(([key, label]) => statBar(ratings[key], label)).join("")}</div>`;
}

function renderPlayerCard(player, { selected, showStats, disabled, fullStatLabels = false }) {
  const r = player.ratings || {};
  const posList = (player.positions || []).join(", ");
  const statsHtml = showStats
    ? renderPlayerStats(r, { fullLabels: fullStatLabels })
    : `<p class="dyn-hidden-stats">Stats hidden — toggle in settings</p><div class="dyn-impact-only">Impact: <strong>${r.impact || "?"}</strong></div>`;

  return `
    <button type="button" class="dyn-player-card${selected ? " is-selected" : ""}${disabled ? " is-disabled" : ""}" data-pick="${escapeHtml(player.id)}" ${disabled ? "disabled" : ""}>
      <div class="dyn-player-head">
        <strong>${escapeHtml(player.name)}</strong>
        <span class="dyn-player-meta">${player.year} · ${escapeHtml(posList || player.primaryPosition)}${player.allStar ? " ★" : ""}${disabled ? " · drafted" : ""}</span>
      </div>
      ${statsHtml}
    </button>
  `;
}

async function loadRosterForRound(roundIndex) {
  const round = getRoundConfig(roundIndex);
  if (!round) return [];
  const key = `r${roundIndex}-${round.teamId}-${round.year}-${round.modifierId}`;
  if (dynastyState.players[key]) return dynastyState.players[key];

  const data = await fetchDynastyPlayers({
    teamId: round.teamId,
    year: round.year,
    modifierIds: [round.modifierId],
    slot: "all",
    showStats: dynastyState.settings.showStats,
  });
  dynastyState.players[key] = data.players || [];
  dynastyState.rosterSize = data.rosterSize;
  return dynastyState.players[key];
}

function spinReelHtml(label, value, spinning) {
  return `
    <div class="dyn-spin-card${spinning ? " is-spinning" : ""}">
      <span class="dyn-slot-badge">${escapeHtml(label)}</span>
      <div class="dyn-spin-reels">
        <div class="dyn-reel dyn-reel-single">
          <span class="dyn-reel-value">${escapeHtml(value || "???")}</span>
        </div>
      </div>
    </div>
  `;
}

function renderGuestBanner(onAuthRequired) {
  if (isLoggedIn()) return "";
  return `
    <div class="dyn-guest-banner panel">
      <p>You're playing as a guest — your score won't appear on the leaderboard.</p>
      <button type="button" class="btn-secondary btn-sm" id="dynGuestSignUp">Create account to compete</button>
    </div>
  `;
}

function renderDashboard({ onAuthRequired } = {}) {
  const err = dynastyState.playError;
  return `
    ${renderGuestBanner(onAuthRequired)}
    <div class="dyn-dashboard panel">
      <h1 class="dyn-dashboard-title">Draft your daily dynasty!</h1>
      <p class="dyn-dashboard-sub">Six spins. Six picks. Build your starting five + 6th man from real NBA rosters.</p>
      ${err ? `<p class="error dyn-play-error">${escapeHtml(err)}</p>` : ""}
      <button type="button" class="btn-primary dyn-play-btn" id="dynPlayBtn">▶ Play</button>
    </div>
  `;
}

function renderSpinPhase() {
  const roundIndex = dynastyState.currentRound;
  const round = getRoundConfig(roundIndex);
  const display = dynastyState.spinDisplay || {
    team: "???",
    year: "???",
    mod: "???",
  };
  const revealed = Boolean(dynastyState.spinDisplay) && !dynastyState.spinning;

  let actions = "";
  if (dynastyState.spinning) {
    actions = `<div class="dyn-spin-actions"><p class="hint">Spinning…</p></div>`;
  } else if (!dynastyState.spinDisplay) {
    actions = `
      <div class="dyn-spin-actions">
        <button type="button" class="btn-primary dyn-spin-btn" id="dynSpinBtn">Spin</button>
      </div>
    `;
  } else {
    actions = `<div class="dyn-spin-actions"><p class="hint">Draft opening…</p></div>`;
  }

  return `
    <div class="dyn-round-banner panel">
      <span class="dyn-round-tag">Pick ${roundIndex + 1} of 6</span>
      <p class="hint">${revealed ? "Your spin for this pick:" : "Spin for team, season, and today's advantage/disadvantage."}</p>
    </div>
    <div class="dyn-spin-grid${dynastyState.spinning ? " is-animating" : ""}${revealed ? " is-revealed" : ""}">
      ${spinReelHtml("Team", display.team, dynastyState.spinning)}
      ${spinReelHtml("Year(s)", display.year, dynastyState.spinning)}
      ${spinReelHtml("Advantage / Disadvantage", display.mod, dynastyState.spinning)}
    </div>
    ${round?.modifierDescription && revealed ? `<p class="dyn-mod-desc panel">${escapeHtml(round.modifierDescription)}</p>` : ""}
    ${actions}
  `;
}

function renderPickPhase() {
  const roundIndex = dynastyState.currentRound;
  const round = getRoundConfig(roundIndex);
  const players = dynastyState.playersCache || [];
  const taken = usedPlayerIds();

  const canReassign = dynastyState.picks.length > 0;

  const lineupSummary = SLOTS.map((s) => renderLineupSlot(s, { interactive: canReassign })).join("");

  return `
    <div class="dyn-draft-layout">
      <div class="panel dyn-roster-banner">
        <span class="dyn-round-tag">Pick ${roundIndex + 1} of 6</span>
        <h3>${escapeHtml(round?.teamName || "")} · ${escapeHtml(round?.yearsLabel || "")}</h3>
        <p class="hint">${dynastyState.rosterSize || players.length} players · ${escapeHtml(round?.modifierLabel || "")}</p>
      </div>
      <div class="dyn-lineup-bar${canReassign ? "" : " dyn-lineup-readonly"}">
        ${canReassign ? `<p class="hint dyn-lineup-hint">Tap a player, then tap an open spot or another player to move or swap.</p>` : ""}
        ${lineupSummary}
      </div>
      <div class="dyn-player-pool" id="dynPlayerPool">
        ${players.length
          ? players.map((p) =>
              renderPlayerCard(p, {
                selected: false,
                showStats: dynastyState.settings.showStats,
                disabled: taken.has(p.id),
                fullStatLabels: true,
              })
            ).join("")
          : `<p class="hint">Loading players…</p>`}
      </div>
    </div>
    ${renderPositionModal()}
  `;
}

function renderPositionModal() {
  const player = dynastyState.pendingPlayer;
  if (!player) return "";

  const slots = playerEligibleSlots(player);
  const sourceSlot = findPlayerSlot(player.id);
  const buttons = slots
    .map((slot) => {
      const occupied = dynastyState.assignments[slot];
      if (!occupied) {
        return `
        <button type="button" class="btn-secondary dyn-pos-btn" data-assign-slot="${slot}">
          ${SLOT_LABELS[slot]}
        </button>
      `;
      }
      if (!sourceSlot) return "";
      const occupant = getPickByPlayerId(occupied);
      if (!occupant || occupant.player.id === player.id) return "";
      if (!canMutualSwap(player, slot, occupant.player, sourceSlot)) return "";
      return `
        <button type="button" class="btn-secondary dyn-pos-btn" data-assign-slot="${slot}">
          ${SLOT_LABELS[slot]} ↔ swap with ${escapeHtml(occupant.player.name)}
        </button>
      `;
    })
    .filter(Boolean)
    .join("");

  return `
    <div class="dyn-modal-backdrop" id="dynPositionModal">
      <div class="dyn-modal panel">
        <h3>Where does ${escapeHtml(player.name)} play?</h3>
        <p class="hint">NBA positions: ${escapeHtml((player.positions || []).join(", "))}. Occupied spots only if both players can swap positions.</p>
        <div class="dyn-pos-grid">${buttons || `<p class="hint">No open spots available</p>`}</div>
        <button type="button" class="btn-text" id="dynCancelPos">Cancel</button>
      </div>
    </div>
  `;
}

function renderReviewPhase() {
  const picksHtml = dynastyState.picks
    .map((p) => {
      const r = p.round;
      const slot = Object.entries(dynastyState.assignments).find(([, id]) => id === p.player.id)?.[0];
      return `
        <li class="dyn-pick-row">
          <span class="dyn-pick-round">Spin ${p.roundIndex + 1}</span>
          <strong>${escapeHtml(p.player.name)}</strong>
          <span class="hint">${escapeHtml(r.teamName)} ${escapeHtml(r.yearsLabel)} · ${escapeHtml(r.modifierLabel)}</span>
          <span class="dyn-pick-slot">${slot ? (slot === "sixth" ? "6th" : slot) : "Unassigned"}</span>
        </li>
      `;
    })
    .join("");

  const lineupSummary = SLOTS.map((s) => renderLineupSlot(s, { interactive: true })).join("");

  return `
    <div class="dyn-review panel">
      <h3>Your dynasty</h3>
      <p class="hint">Tap a player, then tap an open spot or another player to move or swap.</p>
      <div class="dyn-lineup-bar">${lineupSummary}</div>
      <ul class="dyn-picks-list">${picksHtml}</ul>
      <button type="button" class="btn-primary${allSlotsFilled() ? "" : " btn-disabled"}" id="dynSubmitLineup" ${allSlotsFilled() ? "" : "disabled"}>
        Simulate Season →
      </button>
    </div>
  `;
}

function clientBreakdown(submission) {
  const sim = submission.simulation || {};
  const record = sim.record || { wins: 0, losses: 0 };
  const playoff = sim.playoff;
  const items = [];
  items.push({ label: "Regular season wins", points: record.wins * 2 });
  if (playoff?.playoffWins) items.push({ label: "Playoff wins", points: playoff.playoffWins * 8 });
  if (playoff?.champion) items.push({ label: "Championship bonus", points: 150 });
  if (record.losses === 0 && record.wins === 82) items.push({ label: "Undefeated regular season", points: 400 });
  if (playoff?.champion && record.losses === 0) items.push({ label: "Perfect season bonus", points: 200 });
  return { items, total: submission.score || items.reduce((s, i) => s + i.points, 0) };
}

function renderResults(submission, grade, breakdown) {
  const sim = submission.simulation;
  const record = sim.record;
  const playoff = sim.playoff;
  const bd = breakdown || clientBreakdown(submission);
  const gradeClass = `dyn-grade-${(grade?.grade || "F").replace("+", "plus").replace("-", "minus")}`;

  const playoffHtml = playoff
    ? `
      <div class="dyn-playoff panel">
        <h3>Playoffs ${playoff.champion ? "🏆" : ""}</h3>
        ${(playoff.rounds || [])
          .map(
            (r) => `
          <div class="dyn-playoff-round${r.won ? " won" : " lost"}">
            <strong>${escapeHtml(r.round)}</strong>
            <span>vs ${escapeHtml(r.opponent)}</span>
            <span class="dyn-series-result">${escapeHtml(r.result)}</span>
          </div>
        `
          )
          .join("")}
      </div>
    `
    : `<p class="hint">Missed the playoffs at ${record.wins}-${record.losses}.</p>`;

  const storiesHtml = (sim.stories || [])
    .map(
      (s) => `
    <article class="dyn-story">
      <h4>${escapeHtml(s.headline)}</h4>
      <p>${escapeHtml(s.body)}</p>
    </article>
  `
    )
    .join("");

  const lossesHtml = (sim.notableLosses || [])
    .slice(0, 5)
    .map((l) => `<li>Game ${l.game}: Lost to <strong>${escapeHtml(l.opponent)}</strong> (${l.margin} pts)</li>`)
    .join("");

  const scoreItems = (bd?.items || [])
    .map((i) => `<div class="dyn-score-row"><span>${escapeHtml(i.label)}</span><span>+${i.points}</span></div>`)
    .join("");

  return `
    <div class="dyn-results">
      <div class="dyn-grade-banner ${gradeClass}">
        <span class="dyn-grade-letter">${escapeHtml(grade?.grade || "?")}</span>
        <span class="dyn-grade-label">${escapeHtml(grade?.label || "")}</span>
        <span class="dyn-grade-score">${submission.score} pts</span>
      </div>
      <div class="dyn-record panel">
        <h3>Final Record</h3>
        <p class="dyn-record-big">${record.wins}-${record.losses}${playoff?.champion ? " 🏆 CHAMPIONS" : ""}</p>
        <p class="hint">Team strength: ${sim.teamStrength} · Goal: go undefeated!</p>
      </div>
      ${playoffHtml}
      ${lossesHtml ? `<div class="panel"><h3>Notable Losses</h3><ul class="dyn-losses">${lossesHtml}</ul></div>` : ""}
      <div class="dyn-stories panel">
        <h3>Season Stories</h3>
        ${storiesHtml}
      </div>
      <div class="panel dyn-score-breakdown">
        <h3>Score Breakdown</h3>
        ${scoreItems}
        <div class="dyn-score-row dyn-score-total"><span>Total</span><span>${bd?.total || submission.score}</span></div>
      </div>
      <div class="dyn-share-row">
        <button type="button" class="btn-primary" id="dynShareBtn">Share Results</button>
        <button type="button" class="btn-secondary" id="dynCopyBtn">Copy Text</button>
      </div>
      ${!isLoggedIn() ? `<p class="dyn-guest-lb-note">Guest score — not saved to the leaderboard. Create an account to compete tomorrow.</p>` : ""}
    </div>
  `;
}

async function renderLeaderboard(container) {
  try {
    const data = await fetchDynastyLeaderboard();
    const rows = (data.leaderboard || []).slice(0, 15);
    const guestNote = isLoggedIn()
      ? ""
      : `<p class="dyn-guest-lb-note">Sign in to save your score and appear on the leaderboard.</p>`;
    container.innerHTML = `
      <div class="panel dyn-leaderboard">
        <h3>Today's Leaderboard</h3>
        <p class="hint">Resets every 24 hours (UTC) · ${escapeHtml(data.dayKey || "")}</p>
        ${guestNote}
        ${
          rows.length
            ? `
          <ol class="dyn-lb-list">
            ${rows
              .map(
                (r) => `
              <li>
                <span class="dyn-lb-rank">#${r.rank}</span>
                <span class="dyn-lb-user">${escapeHtml(r.displayName || r.username || r.userId.slice(0, 8))}</span>
                <span class="dyn-lb-grade">${escapeHtml(r.grade)}</span>
                <span class="dyn-lb-score">${r.score}</span>
                ${r.champion ? "🏆" : ""}
              </li>
            `
              )
              .join("")}
          </ol>
        `
            : `<p class="hint">Be the first to play today!</p>`
        }
      </div>
    `;
  } catch {
    container.innerHTML = "";
  }
}

function renderSettings() {
  const s = dynastyState.settings;
  return `
    <div class="panel dyn-settings">
      <h3>Settings</h3>
      <label class="dyn-toggle">
        <input type="checkbox" id="dynShowStats" ${s.showStats !== false ? "checked" : ""} />
        <span>Show player stats (off = harder)</span>
      </label>
      <label class="dyn-toggle">
        <input type="checkbox" id="dynSound" ${s.soundEnabled !== false ? "checked" : ""} />
        <span>Sound effects</span>
      </label>
    </div>
  `;
}

function renderFriendsSearch() {
  return `
    <div class="panel dyn-friends">
      <h3>Add Friends</h3>
      <p class="hint">Search by username to compare DynastyDraft scores.</p>
      <div class="dyn-friend-search">
        <input type="text" id="dynFriendQuery" placeholder="Search username…" autocomplete="off" />
        <div id="dynFriendResults" class="dyn-friend-results" role="listbox"></div>
      </div>
    </div>
  `;
}

export function syncTopBar() {
  const statsRow = document.getElementById("topBarStats");
  const streakEl = document.getElementById("topBarStreak");
  const bestEl = document.getElementById("topBarBest");
  if (!statsRow || !streakEl || !bestEl) return;

  if (!isLoggedIn()) {
    statsRow.classList.add("hidden");
    return;
  }

  statsRow.classList.remove("hidden");
  const streak = dynastyState.streak?.current || 0;
  const best = dynastyState.best || {};
  streakEl.textContent = `${streak}🔥`;
  bestEl.textContent = `${best.grade || "—"} (${best.score || 0})`;
}

export async function mountGame({ onAuthRequired } = {}) {
  const root = document.getElementById("gameRoot");
  if (!root) return;

  root.innerHTML = `<div class="dynasty-loading panel"><p>Loading today's challenge…</p></div>`;

  try {
    const data = await fetchDynastyToday();
    dynastyState.challenge = data.challenge;
    dynastyState.settings = data.settings || { showStats: true, soundEnabled: true };
    dynastyState.submission = data.submission;
    dynastyState.streak = data.streak || { current: 0, best: 0 };
    dynastyState.best = data.best || { score: 0, grade: "F" };
    dynastyState.picks = [];
    dynastyState.assignments = {};
    dynastyState.selectedLineupSlot = null;
    dynastyState.currentRound = 0;
    dynastyState.phase = data.submission ? "results" : "dashboard";
    dynastyState.playError = null;

    if (!data.submission && !challengeIsValid(dynastyState.challenge)) {
      await ensureChallengeFresh();
      if (!challengeIsValid(dynastyState.challenge)) {
        dynastyState.playError = "Hard-refresh the page to load today's challenge.";
      }
    }
  } catch (e) {
    root.innerHTML = `<div class="panel"><p class="error">${escapeHtml(e.message)}</p></div>`;
    return;
  }

  await paintGame(root, { onAuthRequired });
}

async function paintGame(root, { onAuthRequired } = {}) {
  let mainContent = "";

  if (dynastyState.phase === "dashboard") {
    mainContent = renderDashboard({ onAuthRequired });
  } else if (dynastyState.phase === "spin") {
    mainContent = renderSpinPhase();
  } else if (dynastyState.phase === "pick") {
    mainContent = renderPickPhase();
  } else if (dynastyState.phase === "review") {
    mainContent = renderReviewPhase();
  } else if (dynastyState.phase === "results" && dynastyState.submission) {
    mainContent = renderResults(dynastyState.submission, { grade: dynastyState.submission.grade, label: "" }, null);
  }

  root.innerHTML = `
    ${dynastyState.phase === "dashboard" || dynastyState.phase === "results" ? renderSettings() : ""}
    ${mainContent}
    <div id="dynLeaderboardMount"></div>
    ${isLoggedIn() && (dynastyState.phase === "dashboard" || dynastyState.phase === "results") ? renderFriendsSearch() : ""}
  `;

  syncTopBar();
  bindGameEvents(root, { onAuthRequired });
  await renderLeaderboard(root.querySelector("#dynLeaderboardMount"));
}

async function runSpinAnimation(root, { onAuthRequired } = {}) {
  if (!challengeIsValid(dynastyState.challenge)) {
    const ok = await ensureChallengeFresh();
    if (!ok) {
      dynastyState.playError = "Couldn't load today's spins. Hard-refresh the page.";
      dynastyState.phase = "dashboard";
      await paintGame(root, { onAuthRequired });
      return;
    }
  }

  const round = getRoundConfig(dynastyState.currentRound);
  if (!round) {
    dynastyState.playError = "Today's challenge is out of date. Refresh and try again.";
    dynastyState.phase = "dashboard";
    await paintGame(root, { onAuthRequired });
    return;
  }

  const teams = [...new Set(dynastyState.challenge.rounds.map((r) => r.teamName))];
  const years = ["1968", "1984", "1996", "2008", "2016", "2024", "2026"];
  const mods = [...new Set(dynastyState.challenge.rounds.map((r) => r.modifierLabel))];

  dynastyState.spinning = true;
  playSound("spin");
  await paintGame(root, { onAuthRequired });

  const steps = 14;
  for (let i = 0; i < steps; i++) {
    dynastyState.spinDisplay = {
      team: teams[Math.floor(Math.random() * teams.length)],
      year: years[Math.floor(Math.random() * years.length)],
      mod: mods[Math.floor(Math.random() * mods.length)],
    };
    await paintGame(root, { onAuthRequired });
    await new Promise((r) => setTimeout(r, 90 + i * 8));
  }

  dynastyState.spinDisplay = {
    team: round.teamName,
    year: round.yearsLabel,
    mod: round.modifierLabel,
  };
  dynastyState.spinning = false;
  playSound("win");
  await paintGame(root, { onAuthRequired });

  await new Promise((r) => setTimeout(r, 2500));

  dynastyState.phase = "pick";
  dynastyState.playersCache = await loadRosterForRound(dynastyState.currentRound);
  await paintGame(root, { onAuthRequired });
}

async function enterSpinPhase(root, { onAuthRequired } = {}) {
  dynastyState.phase = "spin";
  dynastyState.spinDisplay = null;
  dynastyState.spinning = false;
  await paintGame(root, { onAuthRequired });
}

async function handlePlayClick(root, { onAuthRequired } = {}) {
  dynastyState.playError = null;
  try {
    const ok = await ensureChallengeFresh();
    if (!ok) {
      dynastyState.playError = "Couldn't load today's challenge. Hard-refresh or restart the server.";
      await paintGame(root, { onAuthRequired });
      return;
    }
    dynastyState.currentRound = 0;
    dynastyState.picks = [];
    dynastyState.assignments = {};
    dynastyState.selectedLineupSlot = null;
    await enterSpinPhase(root, { onAuthRequired });
  } catch (e) {
    dynastyState.playError = e.message || "Something went wrong starting the draft.";
    dynastyState.phase = "dashboard";
    await paintGame(root, { onAuthRequired });
  }
}

function bindGameEvents(root, { onAuthRequired } = {}) {
  if (!root.dataset.gameBound) {
    root.dataset.gameBound = "1";
    root.addEventListener("click", (e) => {
      if (e.target.closest("#dynPlayBtn")) {
        e.preventDefault();
        void handlePlayClick(root, { onAuthRequired });
      }
      if (e.target.closest("#dynSpinBtn")) {
        e.preventDefault();
        if (!dynastyState.spinning && !dynastyState.spinDisplay) {
          void runSpinAnimation(root, { onAuthRequired });
        }
      }
    });
  }

  root.querySelector("#dynSpinBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (!dynastyState.spinning && !dynastyState.spinDisplay) {
      void runSpinAnimation(root, { onAuthRequired });
    }
  });

  root.querySelectorAll("[data-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const player = dynastyState.playersCache.find((p) => p.id === btn.dataset.pick);
      if (!player) return;
      dynastyState.pendingPlayer = player;
      playSound("pick");
      paintGame(root, { onAuthRequired });
    });
  });

  root.querySelectorAll("[data-assign-slot]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const slot = btn.dataset.assignSlot;
      const player = dynastyState.pendingPlayer;
      if (!player || !slot) return;
      if (!assignPlayerToSlot(slot, player.id)) return;

      dynastyState.picks.push({
        roundIndex: dynastyState.currentRound,
        round: getRoundConfig(dynastyState.currentRound),
        player,
        initialSlot: slot,
      });
      dynastyState.pendingPlayer = null;
      dynastyState.currentRound += 1;

      if (dynastyState.currentRound >= 6) {
        dynastyState.phase = "review";
        await paintGame(root, { onAuthRequired });
        return;
      }

      dynastyState.phase = "spin";
      dynastyState.spinDisplay = null;
      dynastyState.spinning = false;
      await enterSpinPhase(root, { onAuthRequired });
    });
  });

  root.querySelector("#dynCancelPos")?.addEventListener("click", () => {
    dynastyState.pendingPlayer = null;
    paintGame(root, { onAuthRequired });
  });

  root.querySelectorAll("[data-lineup-slot]").forEach((btn) => {
    btn.addEventListener("click", () => {
      handleLineupSlotClick(btn.dataset.lineupSlot);
      paintGame(root, { onAuthRequired });
    });
  });

  root.querySelector("#dynSubmitLineup")?.addEventListener("click", async () => {
    if (!allSlotsFilled()) return;
    const lineup = {};
    for (const s of SLOTS) {
      const playerId = dynastyState.assignments[s];
      const pick = getPickByPlayerId(playerId);
      if (!pick) return;
      lineup[s] = { playerId, roundIndex: pick.roundIndex };
    }

    const btn = root.querySelector("#dynSubmitLineup");
    btn.disabled = true;
    btn.textContent = "Simulating…";
    try {
      playSound("submit");
      const result = await submitDynastyLineup(lineup);
      dynastyState.submission = result.submission;
      dynastyState.phase = "results";
      await paintGame(root, { onAuthRequired });
    } catch (e) {
      alert(e.message || "Submit failed");
      await paintGame(root, { onAuthRequired });
    }
  });

  root.querySelector("#dynGuestSignUp")?.addEventListener("click", () => onAuthRequired?.("register"));

  root.querySelector("#dynShowStats")?.addEventListener("change", async (e) => {
    dynastyState.settings.showStats = e.target.checked;
    dynastyState.players = {};
    if (isLoggedIn()) {
      await updateDynastySettings({ showStats: e.target.checked });
    }
    if (dynastyState.phase === "pick") {
      dynastyState.playersCache = await loadRosterForRound(dynastyState.currentRound);
      await paintGame(root, { onAuthRequired });
    }
  });

  root.querySelector("#dynSound")?.addEventListener("change", async (e) => {
    dynastyState.settings.soundEnabled = e.target.checked;
    if (isLoggedIn()) {
      await updateDynastySettings({ soundEnabled: e.target.checked });
    }
  });

  root.querySelector("#dynShareBtn")?.addEventListener("click", () => {
    const text = dynastyState.submission?.shareText || "DynastyDraft results!";
    if (navigator.share) {
      navigator.share({ title: "DynastyDraft", text }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text);
      alert("Copied to clipboard!");
    }
  });

  root.querySelector("#dynCopyBtn")?.addEventListener("click", () => {
    const text = dynastyState.submission?.shareText || "";
    navigator.clipboard?.writeText(text);
    alert("Copied!");
  });

  const friendInput = root.querySelector("#dynFriendQuery");
  const friendResults = root.querySelector("#dynFriendResults");
  let friendTimer = null;
  friendInput?.addEventListener("input", () => {
    clearTimeout(friendTimer);
    friendTimer = setTimeout(async () => {
      const q = friendInput.value.trim();
      if (q.length < 2) {
        friendResults.innerHTML = "";
        return;
      }
      try {
        const data = await searchFriendCandidates(q);
        friendResults.innerHTML =
          (data.results || [])
            .map(
              (user) => `
          <button type="button" class="dyn-friend-result" data-send-request="${escapeHtml(user.id)}" ${user.pending || user.isFriend ? "disabled" : ""}>
            ${escapeHtml(user.displayName || user.username)} @${escapeHtml(user.username || "")}
            <span class="friend-action">${user.isFriend ? "Friends" : user.pending ? "Pending" : "Add"}</span>
          </button>
        `
            )
            .join("") || `<p class="hint">No users found</p>`;

        friendResults.querySelectorAll("[data-send-request]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            if (btn.disabled) return;
            try {
              await sendFriendRequest(btn.dataset.sendRequest);
              btn.disabled = true;
              btn.querySelector(".friend-action").textContent = "Pending";
            } catch (e) {
              alert(e.message);
            }
          });
        });
      } catch {
        friendResults.innerHTML = "";
      }
    }, 300);
  });
}
