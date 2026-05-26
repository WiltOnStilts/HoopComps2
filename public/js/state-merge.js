/** Merge local browser state with cloud — same rules as server mergeGuestIntoCloud */

import { mergeCollectionByFingerprint, mergedScanFields } from "./card-fingerprint.js";

export function mergeLocalAndCloud(localState, cloudState) {
  if (!cloudState) return localState;
  if (!localState) return cloudState;

  const mergedProfile = {
    ...(localState.profile || {}),
    ...(cloudState.profile || {}),
  };

  const scan = mergedScanFields(cloudState, localState);

  if (!localState.collection?.length) {
    return {
      ...cloudState,
      profile: mergedProfile,
      ...scan,
      collection: mergeCollectionByFingerprint(cloudState.collection || []),
    };
  }
  if (!cloudState.collection?.length) {
    return {
      ...localState,
      profile: mergedProfile,
      ...scan,
      collection: mergeCollectionByFingerprint(localState.collection || []),
    };
  }

  const collection = mergeCollectionByFingerprint([
    ...(cloudState.collection || []),
    ...(localState.collection || []),
  ]);

  return {
    ...cloudState,
    xp: Math.max(cloudState.xp || 0, localState.xp || 0),
    level: Math.max(cloudState.level || 1, localState.level || 1),
    streak: Math.max(cloudState.streak || 0, localState.streak || 0),
    ...scan,
    profile: mergedProfile,
    collection,
    lastScout: localState.lastScout || cloudState.lastScout,
  };
}
