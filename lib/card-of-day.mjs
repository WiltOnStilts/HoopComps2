/** Card of the Day — weighted fair rotation with shop boosts */

import { resolveCardImage, fetchExactEbayImage } from "./card-image.mjs";
import {
  pickWeightedUser,
  buildUserCodWeights,
  getCodBoostPercentForDay,
} from "./economy.mjs";
import { getDayKey } from "./day-key.mjs";

export function extractCodBoostForDay(state, dayKey = getDayKey()) {
  return getCodBoostPercentForDay(state, dayKey);
}

function dayIndex() {
  const now = new Date();
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor(utc / (24 * 60 * 60 * 1000));
}

function dayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function stableSortKey(entry) {
  return `${entry.userId}:${entry.entryId || entry.card.title}`;
}

function possessiveLabel(ownerName, card) {
  const player = card.player?.trim();
  const first = ownerName.split(/\s+/)[0] || ownerName;
  if (player) return `${first}'s ${player} card`;
  return `${first}'s card`;
}

/** Round-robin across collectors so the same user is not featured back-to-back */
export function buildFairCardRotation(pool, spotlightUserIds = []) {
  const eligible = pool.filter((entry) => entry.card?.title?.trim());
  if (!eligible.length) return [];

  const byUser = new Map();
  for (const entry of eligible) {
    if (!byUser.has(entry.userId)) byUser.set(entry.userId, []);
    byUser.get(entry.userId).push(entry);
  }

  for (const cards of byUser.values()) {
    cards.sort((a, b) => stableSortKey(a).localeCompare(stableSortKey(b)));
  }

  let userOrder = spotlightUserIds.filter((id) => byUser.has(id) && byUser.get(id).length);
  if (!userOrder.length) {
    userOrder = [...byUser.keys()].sort();
  }

  const indices = Object.fromEntries(userOrder.map((id) => [id, 0]));
  const rotation = [];
  let progressed = true;

  while (progressed) {
    progressed = false;
    for (const userId of userOrder) {
      const cards = byUser.get(userId);
      const index = indices[userId];
      if (index < cards.length) {
        rotation.push({ pick: cards[index], spotlightUserId: userId });
        indices[userId] += 1;
        progressed = true;
      }
    }
  }

  return rotation;
}

function pickCardForDay(spotlightUserIds, communityCards, dayIdx, userBoosts = {}) {
  const pool = communityCards.filter(
    (entry) => entry.card?.title?.trim() && spotlightUserIds.includes(entry.userId)
  );

  const rotationPool = pool.length ? pool : communityCards.filter((entry) => entry.card?.title?.trim());
  if (!rotationPool.length) return null;

  const byUser = new Map();
  for (const entry of rotationPool) {
    if (!byUser.has(entry.userId)) byUser.set(entry.userId, []);
    byUser.get(entry.userId).push(entry);
  }

  for (const cards of byUser.values()) {
    cards.sort((a, b) => stableSortKey(a).localeCompare(stableSortKey(b)));
  }

  let userOrder = spotlightUserIds.filter((id) => byUser.has(id) && byUser.get(id).length);
  if (!userOrder.length) {
    userOrder = [...byUser.keys()].sort();
  }

  const boostMap = {};
  for (const userId of userOrder) {
    boostMap[userId] = userBoosts[userId] ?? 0;
  }

  const weights = buildUserCodWeights(userOrder, byUser, boostMap);
  const featuredUserId = pickWeightedUser(weights, dayIdx) || userOrder[dayIdx % userOrder.length];

  const userCards = byUser.get(featuredUserId) || [];
  if (!userCards.length) return null;

  const cardSlot = userCards[dayIdx % userCards.length];
  return { pick: cardSlot, spotlightUserId: featuredUserId };
}

export function pickCardOfDay(spotlightUserIds = [], communityCards = [], userBoosts = {}) {
  const dayIdx = dayIndex();
  const label = dayLabel();
  const selection = pickCardForDay(spotlightUserIds, communityCards, dayIdx, userBoosts);

  if (!selection) {
    return {
      card: null,
      dayLabel: label,
      weekLabel: label,
      source: "none",
      userId: null,
      ownerName: null,
      entryId: null,
      headline: "Card of the Day",
      possessionLabel: null,
      profileHint: "Spotlight collector collections",
      blurb: "Today's spotlight card will appear when a featured collector has cards saved to the cloud.",
      spotlightStats: {
        collectorCount: spotlightUserIds.length,
        cardsInPool: 0,
      },
    };
  }

  const { pick, spotlightUserId } = selection;
  const userPool = communityCards.filter((entry) => entry.userId === spotlightUserId);
  const player = pick.card.player?.trim();
  const headline = player ? `${player} card` : pick.card.title;

  return {
    card: pick.card,
    dayLabel: label,
    weekLabel: label,
    source: "spotlight",
    userId: pick.userId,
    ownerName: pick.ownerName,
    entryId: pick.entryId,
    spotlightUserId,
    headline,
    possessionLabel: possessiveLabel(pick.ownerName, pick.card),
    profileHint: `Featured collector · ${pick.ownerName}`,
    blurb: `"${pick.card.title}" — today's Card of the Day from ${pick.ownerName}'s cloud collection (${userPool.length} card${userPool.length === 1 ? "" : "s"} tracked).`,
    spotlightStats: {
      collectorCount: spotlightUserIds.length,
      cardsInPool: userPool.length,
      featuredCollector: pick.ownerName,
    },
    savedEstimate: pick.estimatedValue,
    imageUrl: pick.imageUrl || null,
    imageSource: pick.imageSource || null,
    imageListingTitle: pick.imageListingTitle || null,
    userPhotoUrl: pick.userPhotoUrl || null,
  };
}

export async function getCardOfDayWithScout(
  scoutFn,
  config,
  communityCards = [],
  spotlightUserIds = [],
  userBoosts = {}
) {
  const pick = pickCardOfDay(spotlightUserIds, communityCards, userBoosts);

  if (!pick.card) {
    return { ...pick, scout: null, cardImage: null };
  }

  let cardImage = resolveCardImage({
    card: pick.card,
    userPhotoUrl: pick.userPhotoUrl,
    imageUrl: pick.imageUrl,
    imageSource: pick.imageSource,
    imageListingTitle: pick.imageListingTitle,
  });

  try {
    const scout = await scoutFn(pick.card, config);
    if (!cardImage?.url) {
      cardImage = resolveCardImage({ card: pick.card, scout });
    }
    if (!cardImage?.url) {
      cardImage = await fetchExactEbayImage(pick.card, config);
    }
    return { ...pick, scout, cardImage: cardImage || null };
  } catch (e) {
    return { ...pick, scout: null, error: e.message, cardImage: cardImage || null };
  }
}
