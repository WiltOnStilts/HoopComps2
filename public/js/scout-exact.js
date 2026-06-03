import {
  listingMatchesCardExactly,
  listingMatchesCardBroadly,
  normalizeScoutCard,
} from "./card-image.js";

function listingStats(items) {
  const prices = items.map((i) => i.price).filter((p) => p != null && p > 0);
  if (!prices.length) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const sum = prices.reduce((a, b) => a + b, 0);
  return {
    count: prices.length,
    low: Math.min(...prices),
    high: Math.max(...prices),
    average: sum / prices.length,
    median,
  };
}

function filterEbaySource(card, source) {
  if (!source || source.error) return source;

  const rawItems = source.items || [];
  const totalFetched = source.totalFetched ?? rawItems.length;
  const exactItems = rawItems.filter((item) =>
    listingMatchesCardExactly(card, item, { requireImage: false })
  );
  const broadItems = rawItems.filter((item) => listingMatchesCardBroadly(card, item));

  const compItems = exactItems.length
    ? exactItems
    : broadItems.length
      ? broadItems
      : rawItems;
  const usedBroadFallback = !exactItems.length && broadItems.length > 0;

  return {
    ...source,
    items: compItems,
    stats: listingStats(compItems),
    exactMatch: exactItems.length > 0,
    broadFallback: usedBroadFallback,
    totalFetched,
    exactCount: exactItems.length,
    broadCount: broadItems.length,
  };
}

function estimateFromSources(sold, active) {
  const candidates = [];
  if (sold?.stats?.median) candidates.push(sold.stats.median);
  if (active?.stats?.median) candidates.push(active.stats.median);
  if (!candidates.length) return { estimate: null, confidence: "low", basis: [] };

  const sorted = [...candidates].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const estimate =
    sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const basis = [];
  if (sold?.stats?.median) {
    if (sold.broadFallback) {
      basis.push(
        `eBay sold median (${sold.broadCount || sold.stats.count} similar listings)`
      );
    } else {
      basis.push(
        `eBay sold median (${sold.exactCount} exact ${sold.exactCount === 1 ? "match" : "matches"})`
      );
    }
  }
  if (active?.stats?.median) {
    if (active.broadFallback) {
      basis.push(
        `eBay active median (${active.broadCount || active.stats.count} similar listings)`
      );
    } else {
      basis.push(
        `eBay active median (${active.exactCount} exact ${active.exactCount === 1 ? "match" : "matches"})`
      );
    }
  }

  let confidence = "low";
  if (sold?.stats?.count >= 5) confidence = "high";
  else if (sold?.stats?.count >= 2 || active?.stats?.count >= 2) confidence = "medium";

  return { estimate, confidence, basis };
}

function buildPriceVariation(sold, active) {
  const soldMed = sold?.stats?.median;
  const activeMed = active?.stats?.median;
  const soldLow = sold?.stats?.low;
  const soldHigh = sold?.stats?.high;
  const activeLow = active?.stats?.low;
  const activeHigh = active?.stats?.high;

  if (!soldMed && !activeMed) return null;

  const allPrices = [soldLow, soldHigh, activeLow, activeHigh, soldMed, activeMed].filter(
    (p) => p != null && p > 0
  );
  if (!allPrices.length) return null;

  const floor = Math.min(...allPrices);
  const ceiling = Math.max(...allPrices);
  const spread = ceiling - floor;
  const spreadPct = floor > 0 ? (spread / floor) * 100 : null;

  let label = "Stable market";
  if (spreadPct != null) {
    if (spreadPct > 80) label = "Wide price spread — grade/condition matters";
    else if (spreadPct > 40) label = "Moderate variation across comps";
    else label = "Tight comp range";
  }

  const delta =
    soldMed && activeMed ? ((activeMed - soldMed) / soldMed) * 100 : null;

  return {
    soldMedian: soldMed,
    activeMedian: activeMed,
    soldRange:
      soldLow != null && soldHigh != null ? { low: soldLow, high: soldHigh } : null,
    activeRange:
      activeLow != null && activeHigh != null ? { low: activeLow, high: activeHigh } : null,
    spread,
    spreadPct,
    activeVsSoldPct: delta,
    label,
  };
}

export function applyExactMatchScout(data) {
  if (!data?.sources) return data;

  const card = normalizeScoutCard(data.card || {});
  const sold = filterEbaySource(card, data.sources.ebaySold);
  const active = filterEbaySource(card, data.sources.ebayActive);
  const valuationCore = estimateFromSources(sold, active);

  return {
    ...data,
    card,
    sources: {
      ...data.sources,
      ebaySold: sold,
      ebayActive: active,
    },
    valuation: {
      ...data.valuation,
      ...valuationCore,
      priceVariation: buildPriceVariation(sold, active),
    },
  };
}
