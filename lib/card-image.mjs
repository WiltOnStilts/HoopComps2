/** eBay listing images — only when the listing exactly matches user-entered card info */

import { fetchEbayBrowseActive } from "./ebay-browse.mjs";

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function cardText(card) {
  return norm(
    [card?.title, card?.player, card?.year, card?.set, card?.parallel, card?.serial, card?.notes]
      .filter(Boolean)
      .join(" ")
  );
}

function isBulkListing(title) {
  return (
    /\bpick (your|a|one|from)\b/.test(title) ||
    /\b(you pick|you select|choose your|select your)\b/.test(title) ||
    /\b(complete your set|read description)\b/.test(title) ||
    /\b(lot of|bulk lot|bulk)\b/.test(title) ||
    /\bpyt\b/.test(title) ||
    /\bpick your (card|rookie|player|own)\b/.test(title) ||
    /\bbase\b.*\bpick\b/.test(title)
  );
}

function setMatches(title, setName) {
  const set = norm(setName);
  if (!set) return true;
  if (title.includes(set)) return true;

  const tokens = set.split(/\s+/).filter((token) => token.length >= 3);
  if (!tokens.length) return title.includes(set);
  return tokens.every((token) => title.includes(token));
}

const PARALLEL_TERMS = [
  "45th anniversary",
  "anniversary",
  "silver",
  "gold",
  "prizm",
  "refractor",
  "holo",
  "mojo",
  "wave",
  "disco",
  "genesis",
  "hyper",
  "velocity",
  "fast break",
  "choice",
  "orange",
  "blue",
  "green",
  "purple",
  "black",
  "red",
  "white",
  "pink",
  "teal",
  "auto",
  "autograph",
  "patch",
  "insert",
  "parallel",
];

const TITLE_STOP_WORDS = new Set([
  "card",
  "cards",
  "rc",
  "rookie",
  "rookies",
  "nba",
  "basketball",
  "the",
  "and",
  "for",
  "with",
]);

function hasCardNumber(title, cardNumber) {
  const num = norm(cardNumber).replace(/^#/, "");
  if (!num) return true;

  const patterns = [
    new RegExp(`(?:#|no\\.?\\s*)${num}(?:\\b|[\\s/:]|$)`, "i"),
    new RegExp(`\\bcard\\s+(?:no\\.?\\s*)?${num}\\b`, "i"),
    new RegExp(`\\b${num}\\s*(?:/|$)`, "i"),
  ];
  return patterns.some((pattern) => pattern.test(title));
}

function hasConflictingCardNumber(title, cardNumber) {
  const num = norm(cardNumber).replace(/^#/, "");
  if (!num) return false;

  const matches = [...title.matchAll(/(?:#|no\.?\s*)(\d{1,4})(?=\b|[\s/:]|$)/gi)];
  if (!matches.length) return false;

  return matches.some((match) => match[1] !== num);
}

function yearMatches(title, cardYear) {
  const y = norm(cardYear);
  if (!y) return true;

  const range = y.match(/^(\d{4})\s*[-–]\s*(\d{4})$/);
  if (range) {
    return title.includes(range[1]) && title.includes(range[2]);
  }

  if (/^\d{4}$/.test(y)) return title.includes(y);
  return title.includes(y);
}

function hasConflictingVariant(title, card) {
  const allowed = cardText(card);

  for (const term of PARALLEL_TERMS) {
    if (title.includes(term) && !allowed.includes(term)) return true;
  }

  const serials = title.match(/\/\d+\b/g) || [];
  for (const serial of serials) {
    if (!allowed.includes(serial) && !allowed.includes(serial.slice(1))) return true;
  }

  return false;
}

function titleKeywordsMatch(card, title) {
  const userTitle = norm(card?.title);
  const set = norm(card?.set);
  const required = [];

  if (userTitle) {
    const player = norm(card?.player);
    const cardNumber = norm(card?.cardNumber).replace(/^#/, "");
    const year = norm(card?.year);

    for (const token of userTitle.split(/\s+/)) {
      const bare = token.replace(/^#/, "");
      if (TITLE_STOP_WORDS.has(bare)) continue;
      if (/^\d{4}$/.test(bare) && year.includes(bare)) continue;
      if (cardNumber && bare === cardNumber) continue;
      if (player && player.split(/\s+/).includes(bare)) continue;
      if (set && set.split(/\s+/).includes(bare)) continue;
      if (bare.length > 2) required.push(bare);
    }
  }

  if (set) {
    for (const token of set.split(/\s+/)) {
      if (token.length >= 3 && !required.includes(token)) required.push(token);
    }
  }

  if (!required.length) return true;
  return required.every((token) => title.includes(token));
}

export function normalizeScoutCard(card = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(card)) {
    normalized[key] = typeof value === "string" ? value.trim() : value;
  }
  return normalized;
}

export function listingMatchesCardBroadly(card, listing) {
  card = normalizeScoutCard(card);
  const title = norm(listing?.title);
  if (!title || isBulkListing(title)) return false;

  const player = norm(card?.player);
  if (player) {
    const parts = player.split(/\s+/).filter(Boolean);
    if (!parts.every((part) => title.includes(part))) return false;
  } else {
    return false;
  }

  const set = norm(card?.set);
  if (set && !setMatches(title, set)) return false;

  if (card?.year && !yearMatches(title, card.year)) return false;

  return true;
}

export function listingMatchesCardExactly(card, listing, { requireImage = true } = {}) {
  card = normalizeScoutCard(card);
  const title = norm(listing?.title);
  if (!title) return false;
  if (requireImage && !listing?.image) return false;
  if (isBulkListing(title)) return false;

  const player = norm(card?.player);
  if (player) {
    const parts = player.split(/\s+/).filter(Boolean);
    if (!parts.every((part) => title.includes(part))) return false;
  }

  const set = norm(card?.set);
  if (set && !setMatches(title, set)) return false;

  if (!yearMatches(title, card?.year)) return false;

  const cardNumber = norm(card?.cardNumber).replace(/^#/, "");
  if (cardNumber) {
    if (hasConflictingCardNumber(title, cardNumber)) return false;
    if (!hasCardNumber(title, cardNumber)) return false;
  }

  const parallel = norm(card?.parallel);
  if (parallel) {
    if (!title.includes(parallel)) return false;
  } else if (hasConflictingVariant(title, card)) {
    return false;
  }

  const serial = norm(card?.serial);
  if (serial) {
    const withSlash = serial.startsWith("/") ? serial : `/${serial}`;
    if (!title.includes(withSlash) && !title.includes(serial.replace(/^\//, ""))) return false;
  }

  const gradingCompany = norm(card?.gradingCompany);
  if (gradingCompany && !title.includes(gradingCompany)) return false;

  const grade = norm(card?.grade);
  if (grade && !title.includes(grade)) return false;

  const notes = norm(card?.notes);
  if (notes) {
    const noteParts = notes.split(/\s+/).filter((part) => part.length > 3);
    if (noteParts.length && !noteParts.every((part) => title.includes(part))) return false;
  }

  if (!titleKeywordsMatch(card, title)) return false;

  return true;
}

export function filterExactListingItems(card, items = [], { requireImage = false } = {}) {
  return items.filter((item) => listingMatchesCardExactly(card, item, { requireImage }));
}

export function pickBestListingImage(card, items = []) {
  const exact = items.filter((item) => listingMatchesCardExactly(card, item));
  if (!exact.length) return null;

  const best = exact[0];
  return {
    url: best.image,
    source: best.sourceName || "eBay",
    listingTitle: best.title || null,
    listingUrl: best.url || null,
    exactMatch: true,
  };
}

export function buildExactImageQuery(card) {
  const parts = [];

  if (card?.year?.trim()) parts.push(card.year.trim());
  if (card?.set?.trim()) parts.push(card.set.trim());
  if (card?.player?.trim()) parts.push(card.player.trim());
  if (card?.cardNumber?.trim()) parts.push(`#${card.cardNumber.replace(/^#/, "")}`);
  if (card?.parallel?.trim()) parts.push(card.parallel.trim());
  if (card?.serial?.trim()) {
    const serial = card.serial.trim();
    parts.push(serial.startsWith("/") ? serial : `/${serial}`);
  }
  if (card?.gradingCompany?.trim()) parts.push(card.gradingCompany.trim());
  if (card?.grade?.trim()) parts.push(card.grade.trim());

  const userTitle = norm(card?.title);
  if (userTitle) {
    const player = norm(card?.player);
    const cardNumber = norm(card?.cardNumber).replace(/^#/, "");
    const set = norm(card?.set);
    const extras = userTitle.split(/\s+/).filter((token) => {
      const bare = token.replace(/^#/, "");
      if (TITLE_STOP_WORDS.has(bare)) return false;
      if (/^\d{4}$/.test(bare)) return false;
      if (player && player.split(/\s+/).includes(bare)) return false;
      if (cardNumber && bare === cardNumber) return false;
      if (set && bare === set) return false;
      return bare.length > 2;
    });
    for (const word of extras) {
      if (!parts.some((part) => norm(part).includes(word))) parts.push(word);
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export async function fetchExactEbayImage(card, config) {
  const query = buildExactImageQuery(card);
  if (!query) return null;

  const ebayCfg = {
    clientId: config.ebayClientId || config.ebayAppId,
    clientSecret: config.ebayClientSecret,
  };

  const result = await fetchEbayBrowseActive(ebayCfg, query);
  return pickBestListingImage(card, result?.items || []);
}

export function pickImageFromScout(card, scout) {
  if (!scout) return null;

  const active = scout.sources?.ebayActive?.items || [];
  const sold = scout.sources?.ebaySold?.items || [];
  return pickBestListingImage(card, [...sold, ...active]);
}

export function resolveCardImage({
  card,
  userPhotoUrl,
  imageUrl,
  imageSource,
  imageListingTitle,
  scout,
}) {
  if (userPhotoUrl) {
    return {
      url: userPhotoUrl,
      source: "Your photo",
      listingTitle: null,
      exactMatch: false,
    };
  }

  if (imageUrl && imageSource === "photo") {
    return {
      url: imageUrl,
      source: "Your photo",
      listingTitle: null,
      exactMatch: false,
    };
  }

  if (imageUrl && imageListingTitle) {
    const saved = listingMatchesCardExactly(card, { title: imageListingTitle, image: imageUrl });
    if (saved) {
      return {
        url: imageUrl,
        source: imageSource || "collection",
        listingTitle: imageListingTitle,
        exactMatch: true,
      };
    }
  }

  return pickImageFromScout(card, scout);
}
