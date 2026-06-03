import https from "https";
import { fetchEbayBrowseActive, fetchEbaySold } from "./ebay-browse.mjs";
import {
  buildExactImageQuery,
  listingMatchesCardExactly,
  listingMatchesCardBroadly,
  normalizeScoutCard,
} from "./card-image.mjs";
import { buildCardTitle } from "./card-title.mjs";

export { buildCardTitle };

function inTitle(title, value) {
  if (!value) return true;
  return title.toLowerCase().includes(String(value).toLowerCase());
}

export function buildQuery(card) {
  const title = (card.title || "").trim() || buildCardTitle(card);
  const extras = [
    inTitle(title, card.player) ? "" : card.player,
    inTitle(title, card.year) ? "" : card.year,
    inTitle(title, card.set) ? "" : card.set,
    card.cardNumber && !title.includes(card.cardNumber)
      ? `#${card.cardNumber}`
      : "",
    inTitle(title, card.parallel) ? "" : card.parallel,
    card.serial && !title.includes(card.serial) ? `/${card.serial}` : "",
    card.gradingCompany && card.grade
      ? `${card.gradingCompany} ${card.grade}`
      : card.grade && !/\b(psa|bgs|sgc|cgc)\b/i.test(title)
        ? `PSA ${card.grade}`
        : "",
    card.notes,
  ]
    .filter(Boolean)
    .join(" ");

  const query = [title, extras].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return query || "basketball card";
}

function encodeQuery(q) {
  return encodeURIComponent(q).replace(/%20/g, "+");
}

export function buildMarketLinks(cardOrQuery, cardMeta = {}) {
  const query =
    typeof cardOrQuery === "string" ? cardOrQuery : buildQuery(cardOrQuery);
  const certNumber =
    cardMeta.certNumber ||
    (typeof cardOrQuery === "object" ? cardOrQuery.certNumber : null);
  const q = encodeQuery(query);
  const qSpaces = encodeURIComponent(query);

  return [
    {
      id: "ebay-sold",
      name: "eBay Sold",
      icon: "🛒",
      description: "Completed sales on eBay",
      url: `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Complete=1&LH_Sold=1&_sop=13&_sacat=0`,
    },
    {
      id: "ebay-active",
      name: "eBay Buy It Now",
      icon: "🏷️",
      description: "Current listings",
      url: `https://www.ebay.com/sch/i.html?_nkw=${q}&_sop=15&LH_BIN=1`,
    },
    {
      id: "amazon",
      name: "Amazon",
      icon: "📦",
      description: "Active listings & collectibles",
      url: `https://www.amazon.com/s?k=${qSpaces}&i=sporting`,
    },
    {
      id: "amazon-used",
      name: "Amazon Used",
      icon: "♻️",
      description: "Used / collectible offers",
      url: `https://www.amazon.com/s?k=${qSpaces}&i=sporting&rh=p_90%3A8308921011`,
    },
    {
      id: "130point",
      name: "130point",
      icon: "📊",
      description: "Sports card sold comp search",
      url: `https://130point.com/sales/?q=${qSpaces}`,
    },
    {
      id: "comc",
      name: "COMC",
      icon: "🃏",
      description: "Check Out My Cards marketplace",
      url: `https://www.comc.com/Cards/Basketball,sn,i100,=${qSpaces}`,
    },
    {
      id: "myslabs",
      name: "MySlabs",
      icon: "💎",
      description: "Graded slab marketplace",
      url: `https://myslabs.com/search?q=${qSpaces}`,
    },
    {
      id: "alt",
      name: "ALT",
      icon: "📈",
      description: "Liquid auction marketplace",
      url: `https://app.alt.xyz/search?q=${qSpaces}`,
    },
    {
      id: "heritage",
      name: "Heritage Auctions",
      icon: "🔨",
      description: "Auction house realized prices",
      url: `https://sports.ha.com/c/search-results.zx?term=${qSpaces}&si=2`,
    },
    {
      id: "goldin",
      name: "Goldin",
      icon: "🏆",
      description: "High-end auction comps",
      url: `https://goldin.co/search?q=${qSpaces}`,
    },
    {
      id: "pricecharting",
      name: "PriceCharting",
      icon: "💰",
      description: "Basketball card price guide",
      url: `https://www.pricecharting.com/search-products?q=${qSpaces}&type=basketball-cards`,
    },
    {
      id: "psa-cert",
      name: "PSA Cert Verify",
      icon: "✅",
      description: "Verify graded cert numbers",
      url: `https://www.psacard.com/cert/${certNumber || ""}`,
      hidden: !certNumber,
    },
  ].filter((l) => !l.hidden);
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { Accept: "application/json" } }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Failed to parse response from ${url}`));
          }
        });
      })
      .on("error", reject);
  });
}

function penniesToUsd(pennies) {
  if (pennies == null || pennies === "") return null;
  const n = Number(pennies);
  return Number.isFinite(n) ? n / 100 : null;
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stats(prices) {
  if (!prices.length) return null;
  const sum = prices.reduce((a, b) => a + b, 0);
  return {
    count: prices.length,
    low: Math.min(...prices),
    high: Math.max(...prices),
    average: sum / prices.length,
    median: median(prices),
  };
}

function ebayConfigFrom(config) {
  return {
    clientId: config.ebayClientId || config.ebayAppId,
    clientSecret: config.ebayClientSecret,
  };
}

export async function fetchPriceCharting(token, query) {
  if (!token) return { configured: false, products: [] };

  const url = `https://www.pricecharting.com/api/products?t=${encodeURIComponent(token)}&q=${encodeURIComponent(query)}`;
  const json = await httpsGet(url);

  if (json.status !== "success") {
    return {
      configured: true,
      error: json["error-message"] || "PriceCharting lookup failed",
      products: [],
    };
  }

  const products = (json.products || []).slice(0, 8).map((p) => ({
    id: p.id,
    name: p["product-name"],
    set: p["console-name"],
    loose: penniesToUsd(p["loose-price"]),
    graded9: penniesToUsd(p["graded-price"]),
    psa10: penniesToUsd(p["manual-only-price"]),
    bgs10: penniesToUsd(p["bgs-10-price"]),
    new: penniesToUsd(p["new-price"]),
    url: p.id ? `https://www.pricecharting.com/game/${p.id}` : null,
    source: "pricecharting",
    sourceName: "PriceCharting",
    sourceIcon: "💰",
    listingType: "guide",
  }));

  return { configured: true, products };
}

function tierFromValue(usd) {
  if (usd == null) return { tier: "Unknown", emoji: "❓", color: "#94a3b8" };
  if (usd >= 10000) return { tier: "Hall of Fame", emoji: "👑", color: "#fbbf24" };
  if (usd >= 1000) return { tier: "All-Star", emoji: "⭐", color: "#a78bfa" };
  if (usd >= 100) return { tier: "Starter", emoji: "🔥", color: "#f97316" };
  if (usd >= 10) return { tier: "Role Player", emoji: "🏀", color: "#38bdf8" };
  return { tier: "Bench", emoji: "📋", color: "#64748b" };
}

function buildPriceVariation(sold, active) {
  const soldMed = sold?.stats?.median;
  const activeMed = active?.stats?.median;
  const soldLow = sold?.stats?.low;
  const soldHigh = sold?.stats?.high;
  const activeLow = active?.stats?.low;
  const activeHigh = active?.stats?.high;

  if (!soldMed && !activeMed) return null;

  const allPrices = [
    soldLow,
    soldHigh,
    activeLow,
    activeHigh,
    soldMed,
    activeMed,
  ].filter((p) => p != null && p > 0);

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
    soldRange: soldLow != null && soldHigh != null ? { low: soldLow, high: soldHigh } : null,
    activeRange:
      activeLow != null && activeHigh != null ? { low: activeLow, high: activeHigh } : null,
    spread,
    spreadPct,
    activeVsSoldPct: delta,
    label,
  };
}

function statsFromListingItems(items) {
  const prices = items.map((i) => i.price).filter((p) => p != null && p > 0);
  return stats(prices);
}

function filterExactEbaySource(card, source) {
  if (!source || source.error) return source;

  const rawItems = source.items || [];
  const totalFetched = source.totalFetched ?? rawItems.length;
  const exactItems = totalFetched
    ? rawItems.filter((item) =>
        listingMatchesCardExactly(card, item, { requireImage: false })
      )
    : [];
  const broadItems = totalFetched
    ? rawItems.filter((item) => listingMatchesCardBroadly(card, item))
    : [];

  const compItems = exactItems.length
    ? exactItems
    : broadItems.length
      ? broadItems
      : rawItems;
  const usedBroadFallback = !exactItems.length && broadItems.length > 0;

  return {
    ...source,
    items: compItems,
    stats: statsFromListingItems(compItems),
    exactMatch: exactItems.length > 0,
    broadFallback: usedBroadFallback,
    totalFetched,
    exactCount: exactItems.length,
    broadCount: broadItems.length,
  };
}

function estimateFromSources(sold, active, priceCharting) {
  const candidates = [];
  if (sold?.stats?.median) candidates.push(sold.stats.median);
  if (priceCharting?.products?.length) {
    const p = priceCharting.products[0];
    const vals = [p.psa10, p.graded9, p.loose, p.new].filter(Boolean);
    if (vals.length) candidates.push(Math.max(...vals));
  }
  if (!candidates.length && active?.stats?.median) candidates.push(active.stats.median);

  if (!candidates.length) return { estimate: null, confidence: "low", basis: [] };

  const estimate = median(candidates);
  const basis = [];
  if (sold?.stats?.median) {
    if (sold.broadFallback) {
      basis.push(
        `eBay sold median (${sold.broadCount || sold.stats.count} similar ${(sold.broadCount || sold.stats.count) === 1 ? "listing" : "listings"} — exact match unavailable)`
      );
    } else {
      basis.push(
        sold.exactCount != null
          ? `eBay sold median (${sold.exactCount} exact ${sold.exactCount === 1 ? "match" : "matches"})`
          : "eBay sold median"
      );
    }
  }
  if (priceCharting?.products?.length) basis.push("PriceCharting guide");
  if (!sold?.stats?.median && active?.stats?.median) {
    basis.push(
      active.exactCount != null
        ? `eBay active median (${active.exactCount} exact ${active.exactCount === 1 ? "match" : "matches"})`
        : "eBay Browse API — active listing median (proxy)"
    );
  }

  let confidence = "medium";
  if (sold?.stats?.count >= 5) confidence = "high";
  else if (sold?.stats?.count >= 2) confidence = "medium";
  else confidence = "low";

  return { estimate, confidence, basis };
}

export async function scoutCard(cardInput, config) {
  const card = normalizeScoutCard(cardInput);
  if (!card.title) card.title = buildCardTitle(card);
  const query = buildExactImageQuery(card) || buildQuery(card);
  const links = buildMarketLinks(query, card);

  const ebayCfg = ebayConfigFrom(config);

  const [soldRaw, activeRaw, priceCharting] = await Promise.all([
    fetchEbaySold(ebayCfg, query),
    fetchEbayBrowseActive(ebayCfg, query),
    fetchPriceCharting(config.priceChartingToken, query),
  ]);

  const sold = filterExactEbaySource(card, soldRaw);
  const active = filterExactEbaySource(card, activeRaw);

  const valuation = estimateFromSources(sold, active, priceCharting);
  const tier = tierFromValue(valuation.estimate);

  const heat =
    sold?.stats?.median && active?.stats?.median
      ? active.stats.median / sold.stats.median
      : null;

  const priceVariation = buildPriceVariation(sold, active);

  return {
    query,
    card,
    valuation: {
      ...valuation,
      tier,
      heat: heat
        ? {
            ratio: heat,
            label:
              heat > 1.15
                ? "Sellers asking above recent sales"
                : heat < 0.9
                  ? "Potential buy — below sold comps"
                  : "Market in line with recent sales",
          }
        : null,
      priceVariation,
    },
    sources: {
      ebaySold: sold,
      ebayActive: active,
      priceCharting,
    },
    marketLinks: links,
    setup: {
      ebay: !ebayCfg.clientId,
      ebayOAuth: !ebayCfg.clientSecret,
      priceCharting: !config.priceChartingToken,
    },
  };
}
