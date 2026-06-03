/** Persist and resume in-progress scout wizard sessions */

import { buildCardTitle } from "./card-title.js";
import { scanFingerprint } from "./card-fingerprint.js";
import { resolveLastScoutData } from "./scout-cache.js";

const DRAFT_PHOTO_KEY = "hoopcomps.scoutDraftPhoto";

export function persistDraftPhoto(url) {
  try {
    if (url) sessionStorage.setItem(DRAFT_PHOTO_KEY, url);
    else sessionStorage.removeItem(DRAFT_PHOTO_KEY);
  } catch {
    /* sessionStorage full — photo stays in memory only */
  }
}

export function loadDraftPhoto() {
  try {
    return sessionStorage.getItem(DRAFT_PHOTO_KEY) || null;
  } catch {
    return null;
  }
}

export function clearDraftPhoto() {
  persistDraftPhoto(null);
}

export function draftHasContent(draft) {
  const card = draft?.card || {};
  return Boolean(
    card.player?.trim() ||
      card.title?.trim() ||
      card.year?.trim() ||
      card.set?.trim() ||
      card.cardNumber?.trim() ||
      card.parallel?.trim()
  );
}

export function draftIsUnfinished(draft) {
  if (!draftHasContent(draft)) return false;
  if (draft.complete) return false;
  return true;
}

export function shouldPreferDraft(state) {
  const draft = state?.scoutDraft;
  if (!draftIsUnfinished(draft)) return false;
  const last = state?.lastScout;
  if (!last?.at) return true;
  const draftAt = new Date(draft.updatedAt || 0).getTime();
  const lastAt = new Date(last.at || 0).getTime();
  if (Number.isNaN(draftAt)) return false;
  if (Number.isNaN(lastAt)) return true;
  return draftAt >= lastAt;
}

export function getResumeScoutAction(state) {
  if (shouldPreferDraft(state)) {
    const card = state.scoutDraft.card || {};
    const label = buildCardTitle(card) || card.player?.trim() || "your card";
    return {
      mode: "draft",
      label: "Continue unfinished scout",
      hint: `Pick up where you left off — ${label}`,
    };
  }
  if (resolveLastScoutData(state)) {
    const card = state.lastScout.card || {};
    const label = buildCardTitle(card) || card.player?.trim() || "last scout";
    return {
      mode: "report",
      label: "View last scout report",
      hint: label,
    };
  }
  return null;
}

export function canResumeScout(state) {
  return Boolean(getResumeScoutAction(state));
}

export function normalizeScoutDraft(draft) {
  if (!draft || typeof draft !== "object") return null;
  const card = { ...(draft.card || {}) };
  return {
    card,
    stepIndex: Number.isFinite(draft.stepIndex) ? Math.max(0, draft.stepIndex) : 0,
    updatedAt: draft.updatedAt || new Date().toISOString(),
    complete: Boolean(draft.complete),
  };
}

export function draftMatchesCard(draft, card) {
  if (!draft?.card || !card) return false;
  return scanFingerprint(draft.card) === scanFingerprint(card);
}
