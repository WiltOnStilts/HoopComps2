import { scoutCard } from "./scout.mjs";

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function estimateCollection(entries, config) {
  const items = [];
  let total = 0;
  let valuedCount = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const card = entry.card || entry;
    try {
      const scout = await scoutCard(card, config);
      const estimate = scout.valuation?.estimate ?? null;
      items.push({
        id: entry.id,
        estimate,
        tier: scout.valuation?.tier,
        confidence: scout.valuation?.confidence,
        query: scout.query,
      });
      if (estimate != null) {
        total += estimate * (entry.quantity || 1);
        valuedCount += entry.quantity || 1;
      }
    } catch (e) {
      items.push({
        id: entry.id,
        estimate: entry.estimatedValue ?? null,
        error: e.message,
        tier: null,
      });
      if (entry.estimatedValue != null) {
        total += entry.estimatedValue * (entry.quantity || 1);
        valuedCount += entry.quantity || 1;
      }
    }
    if (i < entries.length - 1) await delay(350);
  }

  return {
    items,
    total: valuedCount ? total : null,
    cardCount: entries.length,
    valuedCount,
  };
}
