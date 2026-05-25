/** Merge local browser state with cloud — same rules as server mergeGuestIntoCloud */

export function mergeLocalAndCloud(localState, cloudState) {
  if (!cloudState) return localState;
  if (!localState) return cloudState;

  const mergedProfile = {
    ...(localState.profile || {}),
    ...(cloudState.profile || {}),
  };

  if (!localState.collection?.length) {
    return { ...cloudState, profile: mergedProfile };
  }
  if (!cloudState.collection?.length) {
    return { ...localState, profile: mergedProfile };
  }

  const cloudIds = new Set(cloudState.collection.map((c) => c.id));
  const merged = [...cloudState.collection];
  for (const item of localState.collection) {
    if (!cloudIds.has(item.id)) merged.unshift(item);
  }

  return {
    ...cloudState,
    xp: Math.max(cloudState.xp || 0, localState.xp || 0),
    level: Math.max(cloudState.level || 1, localState.level || 1),
    streak: Math.max(cloudState.streak || 0, localState.streak || 0),
    scoutCount: Math.max(cloudState.scoutCount || 0, localState.scoutCount || 0),
    profile: mergedProfile,
    collection: merged,
    lastScout: localState.lastScout || cloudState.lastScout,
  };
}
