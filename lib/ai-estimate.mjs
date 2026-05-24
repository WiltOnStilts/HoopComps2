import https from "https";

function formatUsd(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function tierLabel(usd) {
  if (usd == null) return "Unknown";
  if (usd >= 10000) return "Hall of Fame";
  if (usd >= 1000) return "All-Star";
  if (usd >= 100) return "Starter";
  if (usd >= 10) return "Role Player";
  return "Bench";
}

function buildHeuristicInsights(entries, scoutResults) {
  const items = entries.map((entry, i) => {
    const scout = scoutResults[i];
    const est = scout?.valuation?.estimate ?? entry.estimatedValue ?? null;
    return {
      id: entry.id,
      title: entry.card?.title || "Untitled",
      player: entry.card?.player,
      estimate: est,
      tier: scout?.valuation?.tier?.tier || tierLabel(est),
      confidence: scout?.valuation?.confidence || "low",
      heat: scout?.valuation?.heat?.label,
      soldMedian: scout?.sources?.ebaySold?.stats?.median,
      activeMedian: scout?.sources?.ebayActive?.stats?.median,
    };
  });

  const valued = items.filter((i) => i.estimate != null);
  const total = valued.reduce((s, i) => s + i.estimate * (entries.find((e) => e.id === i.id)?.quantity || 1), 0);
  const sorted = [...valued].sort((a, b) => b.estimate - a.estimate);
  const topCard = sorted[0];
  const avgValue = valued.length ? total / valued.length : 0;

  const tierBreakdown = {};
  for (const item of valued) {
    tierBreakdown[item.tier] = (tierBreakdown[item.tier] || 0) + 1;
  }

  const overAsked = items.filter(
    (i) => i.soldMedian && i.activeMedian && i.activeMedian / i.soldMedian > 1.12
  );
  const underMarket = items.filter(
    (i) => i.soldMedian && i.activeMedian && i.activeMedian / i.soldMedian < 0.88
  );

  const paragraphs = [];

  if (!entries.length) {
    return {
      summary: "Your collection is empty — scout your first card to unlock AI portfolio insights.",
      insights: [],
      recommendations: ["Add cards from Scout reports or manually in Collection."],
      total: null,
      items,
      mode: "heuristic",
    };
  }

  paragraphs.push(
    `Your portfolio of ${entries.length} card${entries.length === 1 ? "" : "s"} is estimated at ${formatUsd(total)} across ${valued.length} priced item${valued.length === 1 ? "" : "s"}.`
  );

  if (topCard) {
    paragraphs.push(
      `Your top holding is "${topCard.title}" at ${formatUsd(topCard.estimate)} (${topCard.tier} tier) — it represents ${total > 0 ? Math.round((topCard.estimate / total) * 100) : 0}% of total value.`
    );
  }

  if (avgValue > 0) {
    paragraphs.push(
      `Average card value sits at ${formatUsd(avgValue)}. ${tierBreakdown["Hall of Fame"] || tierBreakdown["All-Star"] ? "You have premium-tier cards in the mix." : "Most of your holdings are in the accessible / mid-range market."}`
    );
  }

  const insights = [];
  if (overAsked.length) {
    insights.push({
      type: "warning",
      title: "Sellers asking above sold comps",
      text: `${overAsked.length} card${overAsked.length === 1 ? "" : "s"} show active listings above recent sold medians — market may be cooling or listings are optimistic.`,
    });
  }
  if (underMarket.length) {
    insights.push({
      type: "opportunity",
      title: "Potential buy zone",
      text: `${underMarket.length} card${underMarket.length === 1 ? "" : "s"} have active asks below sold comps — worth watching for deals.`,
    });
  }

  const lowConf = items.filter((i) => i.confidence === "low" && i.estimate != null);
  if (lowConf.length) {
    insights.push({
      type: "info",
      title: "Thin comp data",
      text: `${lowConf.length} estimate${lowConf.length === 1 ? "" : "s"} rely on limited sold/active data — scout again with more specific titles for tighter ranges.`,
    });
  }

  const recommendations = [];
  if (valued.length < entries.length) {
    recommendations.push("Run Refresh all values to price cards missing estimates.");
  }
  if (topCard && topCard.estimate / total > 0.6 && valued.length > 2) {
    recommendations.push("Portfolio is concentrated in one card — consider diversifying across players/sets.");
  }
  recommendations.push("Verify high-value cards against eBay sold and 130point before selling.");

  return {
    summary: paragraphs.join(" "),
    insights,
    recommendations,
    total: valued.length ? total : null,
    topCards: sorted.slice(0, 5),
    tierBreakdown,
    items,
    mode: "heuristic",
  };
}

function openAiRequest(apiKey, messages) {
  const body = JSON.stringify({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.4,
    max_tokens: 800,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode !== 200) {
              reject(new Error(json.error?.message || `OpenAI error (${res.statusCode})`));
              return;
            }
            resolve(json.choices?.[0]?.message?.content || "");
          } catch {
            reject(new Error("Failed to parse OpenAI response"));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function generateCollectionInsights(entries, scoutResults, config = {}) {
  const heuristic = buildHeuristicInsights(entries, scoutResults);

  const apiKey = config.openAiKey || process.env.OPENAI_API_KEY;
  if (!apiKey || !entries.length) {
    return heuristic;
  }

  const cardList = heuristic.items
    .slice(0, 20)
    .map(
      (i) =>
        `- ${i.title}: ${formatUsd(i.estimate)} (${i.tier}, ${i.confidence} confidence)${i.heat ? ` — ${i.heat}` : ""}`
    )
    .join("\n");

  try {
    const aiText = await openAiRequest(apiKey, [
      {
        role: "system",
        content:
          "You are a basketball card market analyst. Give concise, actionable portfolio insights. Use USD. Be direct — no fluff. Structure: 2-3 sentence summary, then 3 bullet insights, then 2 recommendations.",
      },
      {
        role: "user",
        content: `Analyze this basketball card collection:\nTotal estimated: ${formatUsd(heuristic.total)}\nCards:\n${cardList}`,
      },
    ]);

    return {
      ...heuristic,
      mode: "openai",
      aiNarrative: aiText,
      summary: aiText.split("\n")[0] || heuristic.summary,
    };
  } catch (e) {
    return { ...heuristic, aiError: e.message };
  }
}
