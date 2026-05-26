/** Merge local browser state with cloud — same rules as server mergeGuestIntoCloud */

import { mergeCollectionByFingerprint, mergedScanFields } from "./card-fingerprint.js";
import { mergedEconomyFields } from "./economy.js";

export function mergeLocalAndCloud(localState, cloudState) {
  if (!cloudState) return localState;
  if (!localState) return cloudState;

  const mergedProfile = {
    ...(localState.profile || {}),
    ...(cloudState.profile || {}),
  };

  const scan = mergedScanFields(cloudState, localState);
  const economy = mergedEconomyFields(cloudState, localState);

  if (!localState.collection?.length) {
    return {
      ...cloudState,
      profile: mergedProfile,
      ...scan,
      ...economy,
      collection: mergeCollectionByFingerprint(cloudState.collection || []),
    };
  }
  if (!cloudState.collection?.length) {
    return {
      ...localState,
      profile: mergedProfile,
      ...scan,
      ...economy,
      collection: mergeCollectionByFingerprint(localState.collection || []),
    };
  }

  const collection = mergeCollectionByFingerprint([
    ...(cloudState.collection || []),
    ...(localState.collection || []),
  ]);

  return {
    ...cloudState,
    ...economy,
    ...scan,
    profile: mergedProfile,
    collection,
    lastScout: localState.lastScout || cloudState.lastScout,
  };
}
