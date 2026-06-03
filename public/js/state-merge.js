/** Merge local browser state with cloud — union collections, never drop cards */

import { mergeCollectionByFingerprint, mergedScanFields } from "./card-fingerprint.js";
import { mergedEconomyFields } from "./economy.js";

function stateTimestamp(state) {
  const raw = state?.stateUpdatedAt;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function pickNewerProfile(localState, cloudState) {
  const localTs = stateTimestamp(localState);
  const cloudTs = stateTimestamp(cloudState);
  const localProfile = localState?.profile || {};
  const cloudProfile = cloudState?.profile || {};

  if (localTs > cloudTs) {
    return { ...cloudProfile, ...localProfile };
  }
  if (cloudTs > localTs) {
    return { ...localProfile, ...cloudProfile };
  }
  return { ...localProfile, ...cloudProfile };
}

function mergeScoutDraft(localState, cloudState) {
  const local = localState?.scoutDraft;
  const cloud = cloudState?.scoutDraft;
  if (!local) return cloud || null;
  if (!cloud) return local || null;
  const localTs = new Date(local.updatedAt || 0).getTime();
  const cloudTs = new Date(cloud.updatedAt || 0).getTime();
  if (Number.isNaN(localTs)) return cloud;
  if (Number.isNaN(cloudTs)) return local;
  return localTs >= cloudTs ? local : cloud;
}

export function mergeLocalAndCloud(localState, cloudState) {
  if (!cloudState) return localState;
  if (!localState) return cloudState;

  const mergedProfile = pickNewerProfile(localState, cloudState);
  const scan = mergedScanFields(cloudState, localState);
  const economy = mergedEconomyFields(cloudState, localState);

  const collection = mergeCollectionByFingerprint([
    ...(cloudState.collection || []),
    ...(localState.collection || []),
  ]);

  const localTs = stateTimestamp(localState);
  const cloudTs = stateTimestamp(cloudState);
  const base = localTs >= cloudTs ? { ...cloudState, ...localState } : { ...localState, ...cloudState };

  const lastScout =
    localTs >= cloudTs
      ? localState.lastScout || cloudState.lastScout
      : cloudState.lastScout || localState.lastScout;

  const scoutResultCache = {
    ...(cloudState.scoutResultCache || {}),
    ...(localState.scoutResultCache || {}),
  };

  const scoutDraft = mergeScoutDraft(localState, cloudState);

  return {
    ...base,
    ...economy,
    ...scan,
    profile: mergedProfile,
    collection,
    lastScout,
    scoutResultCache,
    scoutDraft,
    stateUpdatedAt:
      localTs >= cloudTs
        ? localState.stateUpdatedAt || cloudState.stateUpdatedAt
        : cloudState.stateUpdatedAt || localState.stateUpdatedAt,
  };
}
