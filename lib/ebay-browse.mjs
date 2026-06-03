import https from "https";

const MARKETPLACE = "EBAY_US";
const CATEGORY_SPORTS_CARDS = "261328";
const BROWSE_SCOPE = "https://api.ebay.com/oauth/api_scope";
const INSIGHTS_SCOPE = "https://api.ebay.com/oauth/api_scope/buy.marketplace.insights";

let tokenCache = { browse: null, browseExpires: 0, insights: null, insightsExpires: 0 };

function request({ method, url, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers,
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        let json = null;
        try {
          json = data ? JSON.parse(data) : null;
        } catch {
          json = { raw: data };
        }
        resolve({ status: res.statusCode, json, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

export async function getApplicationToken(clientId, clientSecret, scope = BROWSE_SCOPE) {
  if (!clientId || !clientSecret) return null;

  const isInsights = scope.includes("marketplace.insights");
  const cacheKey = isInsights ? "insights" : "browse";
  const expKey = isInsights ? "insightsExpires" : "browseExpires";

  if (tokenCache[cacheKey] && Date.now() < tokenCache[expKey] - 60_000) {
    return tokenCache[cacheKey];
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`;

  const { status, json } = await request({
    method: "POST",
    url: "https://api.ebay.com/identity/v1/oauth2/token",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  });

  if (status !== 200 || !json?.access_token) {
    const msg = json?.error_description || json?.error || `OAuth failed (${status})`;
    throw new Error(msg);
  }

  tokenCache[cacheKey] = json.access_token;
  tokenCache[expKey] = Date.now() + (json.expires_in || 7200) * 1000;
  return tokenCache[cacheKey];
}

function mapBrowseItems(itemSummaries = []) {
  return itemSummaries.map((item) => ({
    id: item.itemId || item.legacyItemId || null,
    title: item.title || "",
    price: item.price?.value != null ? Number(item.price.value) : null,
    currency: item.price?.currency || "USD",
    url: item.itemWebUrl || item.itemAffiliateWebUrl || "",
    image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || null,
    condition: item.condition || null,
    endTime: item.itemEndDate || null,
    seller: item.seller?.username || null,
    buyingOptions: item.buyingOptions || [],
    source: "ebay-active",
    sourceName: "eBay",
    sourceIcon: "🛒",
    listingType: "active",
  }));
}

function statsFromItems(items) {
  const prices = items.map((i) => i.price).filter((p) => p != null && p > 0);
  if (!prices.length) return null;
  const sum = prices.reduce((a, b) => a + b, 0);
  const sorted = [...prices].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  return {
    count: prices.length,
    low: Math.min(...prices),
    high: Math.max(...prices),
    average: sum / prices.length,
    median,
  };
}

export async function browseSearchActive(token, query) {
  const params = new URLSearchParams({
    q: query,
    category_ids: CATEGORY_SPORTS_CARDS,
    limit: "25",
    sort: "price",
    filter: "buyingOptions:{FIXED_PRICE|AUCTION}",
  });

  const { status, json } = await request({
    method: "GET",
    url: `https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE,
      Accept: "application/json",
    },
  });

  if (status !== 200) {
    const msg =
      json?.errors?.[0]?.message ||
      json?.error_description ||
      `Browse API error (${status})`;
    return { error: msg, items: [], stats: null };
  }

  const items = mapBrowseItems(json.itemSummaries).slice(0, 20);
  return { items, stats: statsFromItems(items), total: json.total };
}

function mapInsightsItems(sales = []) {
  return sales.map((sale) => ({
    id: sale.itemId || sale.legacyItemId || null,
    title: sale.title || "",
    price:
      sale.lastSoldPrice?.value != null
        ? Number(sale.lastSoldPrice.value)
        : sale.price?.value != null
          ? Number(sale.price.value)
          : null,
    currency:
      sale.lastSoldPrice?.currency || sale.price?.currency || "USD",
    url: sale.itemWebUrl || "",
    image: sale.image?.imageUrl || null,
    endTime: sale.lastSoldDate || null,
    condition: sale.condition || null,
    source: "ebay-sold",
    sourceName: "eBay Sold",
    sourceIcon: "📊",
    listingType: "sold",
  }));
}

export async function browseGetItem(token, itemId) {
  const encoded = encodeURIComponent(itemId);
  const { status, json } = await request({
    method: "GET",
    url: `https://api.ebay.com/buy/browse/v1/item/${encoded}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE,
      Accept: "application/json",
    },
  });

  if (status !== 200) {
    const msg = json?.errors?.[0]?.message || `Item lookup failed (${status})`;
    return { error: msg };
  }

  return {
    id: json.itemId,
    title: json.title,
    price: json.price?.value != null ? Number(json.price.value) : null,
    currency: json.price?.currency || "USD",
    url: json.itemWebUrl || "",
    image: json.image?.imageUrl || null,
    condition: json.condition || null,
    conditionDescription: json.conditionDescription || null,
    seller: json.seller?.username || null,
    sellerFeedback: json.seller?.feedbackPercentage || null,
    description: json.shortDescription || json.description || null,
    buyingOptions: json.buyingOptions || [],
    itemLocation: json.itemLocation?.city || json.itemLocation?.country || null,
    source: "ebay-active",
    sourceName: "eBay",
    sourceIcon: "🛒",
  };
}

export async function fetchListingDetail(config, itemId) {
  const { clientId, clientSecret } = config;
  if (!clientId || !clientSecret || !itemId) {
    return { error: "eBay credentials or item ID missing" };
  }
  const token = await getApplicationToken(clientId, clientSecret);
  return browseGetItem(token, itemId);
}

export async function marketplaceInsightsSold(token, query) {
  const params = new URLSearchParams({
    q: query,
    category_ids: CATEGORY_SPORTS_CARDS,
    limit: "25",
  });

  const { status, json } = await request({
    method: "GET",
    url: `https://api.ebay.com/buy/marketplace-insights/v1/item_sales/search?${params}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE,
      Accept: "application/json",
    },
  });

  if (status === 403 || status === 401) {
    return {
      unavailable: true,
      reason: "approval_required",
      error:
        "eBay sold-price API requires Marketplace Insights approval on your eBay developer account.",
      items: [],
      stats: null,
    };
  }

  if (status !== 200) {
    const msg =
      json?.errors?.[0]?.message ||
      json?.error_description ||
      `Marketplace Insights error (${status})`;
    return { unavailable: true, reason: "api_error", error: msg, items: [], stats: null };
  }

  const raw = json.itemSales || json.itemSummaries || [];
  const items = mapInsightsItems(raw).slice(0, 20);
  return {
    unavailable: false,
    items,
    stats: statsFromItems(items),
    total: json.total,
  };
}

export const SOLD_DEPRECATION_NOTE =
  "eBay retired the old Finding API for sold items. Live sold comps need Marketplace Insights access.";

export async function fetchEbayBrowseActive(config, query) {
  const { clientId, clientSecret } = config;
  if (!clientId || !clientSecret) {
    return {
      configured: false,
      api: "browse",
      items: [],
      stats: null,
      setup:
        "Add EBAY_CLIENT_SECRET (Cert ID) to .env alongside EBAY_APP_ID, then restart the server.",
    };
  }

  try {
    const token = await getApplicationToken(clientId, clientSecret);
    const result = await browseSearchActive(token, query);
    if (result.error) {
      return { configured: true, api: "browse", error: result.error, items: [], stats: null };
    }
    return {
      configured: true,
      api: "browse",
      items: result.items,
      stats: result.stats,
    };
  } catch (e) {
    return { configured: true, api: "browse", error: e.message, items: [], stats: null };
  }
}

export async function fetchEbaySold(config, query) {
  const { clientId, clientSecret } = config;
  if (!clientId || !clientSecret) {
    return {
      configured: false,
      api: "marketplace-insights",
      items: [],
      stats: null,
      note: SOLD_DEPRECATION_NOTE,
      setup:
        "Add EBAY_CLIENT_SECRET to .env. Sold comps may still require eBay Marketplace Insights approval.",
    };
  }

  try {
    const token = await getApplicationToken(clientId, clientSecret, INSIGHTS_SCOPE);
    const result = await marketplaceInsightsSold(token, query);
    if (result.unavailable) {
      return {
        configured: true,
        api: "marketplace-insights",
        unavailable: true,
        reason: result.reason,
        error: result.error,
        note: SOLD_DEPRECATION_NOTE,
        items: [],
        stats: null,
      };
    }
    return {
      configured: true,
      api: "marketplace-insights",
      unavailable: false,
      items: result.items,
      stats: result.stats,
    };
  } catch (e) {
    return {
      configured: true,
      api: "marketplace-insights",
      unavailable: true,
      error: e.message,
      note: SOLD_DEPRECATION_NOTE,
      items: [],
      stats: null,
    };
  }
}
