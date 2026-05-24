/** Card of the Day — same spotlight for everyone, from designated collectors only */

import { resolveCardImage, fetchExactEbayImage } from "./card-image.mjs";

const DEFAULT_SPOTLIGHT_EMAILS = ["builtwilt@icloud.com"];

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

export function resolveSpotlightUserIds(findUserByEmail) {
  const ids = new Set();

  for (const id of (process.env.SPOTLIGHT_USER_IDS || "").split(",")) {
    const trimmed = id.trim();
    if (trimmed) ids.add(trimmed);
  }

  const emails = (process.env.SPOTLIGHT_USER_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const fallbackEmails = emails.length ? emails : DEFAULT_SPOTLIGHT_EMAILS;
  for (const email of fallbackEmails) {
    const user = findUserByEmail?.(email);
    if (user?.id) ids.add(user.id);
  }

  return [...ids].sort();
}

function pickCardForDay(spotlightUserIds, communityCards, dayIdx) {
  const pool = communityCards.filter(
    (entry) => entry.card?.title?.trim() && spotlightUserIds.includes(entry.userId)
  );

  if (!pool.length || !spotlightUserIds.length) {
    return null;
  }

  const spotlightUserId = spotlightUserIds[dayIdx % spotlightUserIds.length];
  const userCards = pool
    .filter((entry) => entry.userId === spotlightUserId)
    .sort((a, b) => stableSortKey(a).localeCompare(stableSortKey(b)));

  if (!userCards.length) {
    const usersWithCards = [...new Set(pool.map((entry) => entry.userId))].sort();
    const fallbackUserId = usersWithCards[dayIdx % usersWithCards.length];
    const fallbackCards = pool
      .filter((entry) => entry.userId === fallbackUserId)
      .sort((a, b) => stableSortKey(a).localeCompare(stableSortKey(b)));
    if (!fallbackCards.length) return null;
    return { pick: fallbackCards[dayIdx % fallbackCards.length], spotlightUserId: fallbackUserId };
  }

  const cardSeed = Math.floor(dayIdx / spotlightUserIds.length) + dayIdx;
  const pick = userCards[cardSeed % userCards.length];
  return { pick, spotlightUserId };
}

export function pickCardOfDay(spotlightUserIds = [], communityCards = []) {
  const dayIdx = dayIndex();
  const label = dayLabel();
  const selection = pickCardForDay(spotlightUserIds, communityCards, dayIdx);

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
  };
}

export async function getCardOfDayWithScout(
  scoutFn,
  config,
  communityCards = [],
  spotlightUserIds = []
) {
  const pick = pickCardOfDay(spotlightUserIds, communityCards);

  if (!pick.card) {
    return { ...pick, scout: null, cardImage: null };
  }

  let cardImage = resolveCardImage({
    card: pick.card,
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
