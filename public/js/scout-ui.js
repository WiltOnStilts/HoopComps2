import { formatUsd, escapeHtml } from "./utils.js";
import { renderListingsInApp, renderGuideInApp, renderAllComps } from "./listings-ui.js";
import { applyExactMatchScout } from "./scout-exact.js";

export { formatUsd, escapeHtml };

export function formToCard(form) {
  const fd = new FormData(form);
  return Object.fromEntries(fd.entries());
}

export function fillScoutForm(form, card) {
  if (!card || !form) return;
  for (const [key, value] of Object.entries(card)) {
    const el = form.elements.namedItem(key);
    if (el && value != null) el.value = value;
  }
}

export function renderValuationHero(el, data) {
  const v = data.valuation;
  const estimateText =
    v.estimate != null ? formatUsd(v.estimate) : "Scout a card to see in-app comps";

  el.innerHTML = `
    <div class="tier-badge" style="color: ${v.tier.color}; border-color: ${v.tier.color}">
      <span>${v.tier.emoji}</span>
      <span>${v.tier.tier}</span>
    </div>
    <div class="estimate-block">
      <h3>${estimateText}</h3>
      <p class="sub">${v.basis?.length ? `Based on: ${v.basis.join(", ")}` : "Tap listings below for in-app comps"}</p>
      <span class="confidence ${v.confidence}">${v.confidence} confidence</span>
      ${v.heat ? `<div class="heat-banner">📡 ${v.heat.label}</div>` : ""}
    </div>
  `;
}

export function renderStatsRow(el, data, ebayTipHtml) {
  const sold = data.sources.ebaySold?.stats;
  const active = data.sources.ebayActive?.stats;

  if (!sold && !active) {
    el.innerHTML = `
      <div class="alert-box" style="grid-column: 1/-1">
        ${ebayTipHtml || "Configure eBay keys for live comps."} All results stay on this site once loaded.
      </div>
    `;
    return;
  }

  const filteredOut =
    (sold?.totalFetched ?? sold?.items?.length ?? 0) -
      (sold?.exactCount ?? sold?.items?.length ?? 0) +
    ((active?.totalFetched ?? active?.items?.length ?? 0) -
      (active?.exactCount ?? active?.items?.length ?? 0));

  el.innerHTML = `
    ${filteredOut > 0 ? `<div class="alert-box info-box" style="grid-column: 1/-1">Filtered out ${filteredOut} non-matching eBay listing${filteredOut === 1 ? "" : "s"}. Only exact matches to your card details are shown.</div>` : ""}
    <div class="mini-stat"><span class="label">Sold median</span><span class="val">${formatUsd(sold?.median)}</span></div>
    <div class="mini-stat"><span class="label">Active median</span><span class="val">${formatUsd(active?.median)}</span></div>
    <div class="mini-stat"><span class="label">High</span><span class="val">${formatUsd(sold?.high ?? active?.high)}</span></div>
    <div class="mini-stat"><span class="label">Exact comps</span><span class="val">${(sold?.exactCount ?? sold?.count ?? 0) + (active?.exactCount ?? active?.count ?? 0)}</span></div>
  `;
}

export function renderMarketLinks(container, links) {
  if (!links?.length) {
    container.innerHTML = `<p class="muted-text">No marketplace links available.</p>`;
    return;
  }
  container.innerHTML = `
    <p class="comps-intro">Compare prices across eBay, Amazon, and specialty marketplaces. Links open in a new tab.</p>
    <div class="market-grid">${links
      .map(
        (l) => `
      <a class="market-link" href="${escapeHtml(l.url)}" target="_blank" rel="noopener">
        <span class="icon">${l.icon}</span>
        <span class="name">${escapeHtml(l.name)}</span>
        <span class="desc">${escapeHtml(l.description)}</span>
      </a>`
      )
      .join("")}</div>
  `;
}

export function renderPriceVariationPanel(el, pv) {
  if (!el) return;
  if (!pv) {
    el.innerHTML = "";
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  const floor = Math.min(
    pv.soldRange?.low ?? pv.soldMedian ?? Infinity,
    pv.activeRange?.low ?? pv.activeMedian ?? Infinity
  );
  const ceiling = Math.max(
    pv.soldRange?.high ?? pv.soldMedian ?? 0,
    pv.activeRange?.high ?? pv.activeMedian ?? 0
  );
  const range = ceiling - floor || 1;
  const soldPos = pv.soldMedian ? ((pv.soldMedian - floor) / range) * 100 : null;
  const activePos = pv.activeMedian ? ((pv.activeMedian - floor) / range) * 100 : null;

  el.innerHTML = `
    <h4 class="pv-title">Price variation</h4>
    <p class="pv-label">${escapeHtml(pv.label)}</p>
    <div class="pv-bar-wrap">
      <div class="pv-bar">
        ${soldPos != null ? `<div class="pv-dot sold" style="left:${Math.min(98, Math.max(2, soldPos))}%" title="Sold median"></div>` : ""}
        ${activePos != null ? `<div class="pv-dot active" style="left:${Math.min(98, Math.max(2, activePos))}%" title="Active median"></div>` : ""}
      </div>
      <div class="pv-legend">
        ${pv.soldRange ? `<span> Sold ${formatUsd(pv.soldRange.low)}–${formatUsd(pv.soldRange.high)}</span>` : ""}
        ${pv.activeRange ? `<span> Active ${formatUsd(pv.activeRange.low)}–${formatUsd(pv.activeRange.high)}</span>` : ""}
      </div>
    </div>
    <div class="pv-stats">
      <span>Sold median: <strong>${formatUsd(pv.soldMedian)}</strong></span>
      <span>Active median: <strong>${formatUsd(pv.activeMedian)}</strong></span>
      ${pv.activeVsSoldPct != null ? `<span>Δ ${pv.activeVsSoldPct > 0 ? "+" : ""}${Math.round(pv.activeVsSoldPct)}%</span>` : ""}
    </div>
  `;
}

export function renderScoutResults(data, { ebayTipBanner }) {
  const exactData = applyExactMatchScout(data);
  const panel = document.getElementById("resultsPanel");
  const empty = document.getElementById("scoutEmptyState");
  panel.classList.remove("hidden");
  empty?.classList.add("hidden");

  document.getElementById("queryDisplay").textContent = `Search: "${exactData.query}"`;
  renderValuationHero(document.getElementById("valuationHero"), exactData);
  renderStatsRow(document.getElementById("statsRow"), exactData, ebayTipBanner);

  renderListingsInApp(document.getElementById("tab-sold"), exactData.sources.ebaySold, {
    soldTab: true,
  });
  renderListingsInApp(document.getElementById("tab-active"), exactData.sources.ebayActive);
  renderGuideInApp(document.getElementById("tab-guide"), exactData.sources.priceCharting);
  renderMarketLinks(document.getElementById("tab-markets"), exactData.marketLinks);
  renderAllComps(document.getElementById("tab-all"), exactData);
  renderPriceVariationPanel(
    document.getElementById("priceVariationPanel"),
    exactData.valuation?.priceVariation
  );

  const addBtn = document.getElementById("addToCollectionBtn");
  if (addBtn) {
    addBtn.dataset.ready = "1";
    addBtn.disabled = false;
  }

  return exactData;
}

export function setupResultTabs() {
  document.querySelectorAll("#resultsPanel .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const parent = tab.closest("#resultsPanel");
      parent.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      parent.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
    });
  });
}
