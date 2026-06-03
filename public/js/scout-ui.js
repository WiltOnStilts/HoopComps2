import { formatUsd, escapeHtml } from "./utils.js";
import { renderSoldCompsInApp, renderActiveCompsInApp, renderAllComps } from "./listings-ui.js";
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
        ${ebayTipHtml || "Configure eBay keys for live comps."}
      </div>
    `;
    return;
  }

  const filteredOut =
    (sold?.totalFetched ?? 0) - (sold?.exactCount ?? sold?.items?.length ?? 0) +
    (active?.totalFetched ?? 0) - (active?.exactCount ?? active?.items?.length ?? 0);

  const exactTotal =
    (sold?.exactCount ?? sold?.count ?? 0) + (active?.exactCount ?? active?.count ?? 0);

  el.innerHTML = `
    ${filteredOut > 0 ? `<div class="alert-box info-box" style="grid-column: 1/-1">Filtered out ${filteredOut} non-matching listing${filteredOut === 1 ? "" : "s"}. Only exact matches to your card are shown.</div>` : ""}
    <div class="mini-stat"><span class="label">Sold median</span><span class="val">${formatUsd(sold?.median)}</span></div>
    <div class="mini-stat"><span class="label">Active median</span><span class="val">${formatUsd(active?.median)}</span></div>
    <div class="mini-stat"><span class="label">High</span><span class="val">${formatUsd(sold?.high ?? active?.high)}</span></div>
    <div class="mini-stat"><span class="label">Exact comps</span><span class="val">${exactTotal}</span></div>
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

  renderSoldCompsInApp(document.getElementById("tab-sold"), exactData);
  renderActiveCompsInApp(document.getElementById("tab-active"), exactData);
  renderAllComps(document.getElementById("tab-all"), exactData);
  renderPriceVariationPanel(
    document.getElementById("priceVariationPanel"),
    exactData.valuation?.priceVariation
  );

  const addBtn = document.getElementById("addToCollectionBtn");
  if (addBtn) {
    addBtn.disabled = true;
    delete addBtn.dataset.ready;
    addBtn.classList.add("hidden");
    addBtn.classList.remove("btn-collection-locked");
  }
  document.querySelector(".add-qty-field")?.classList.add("hidden");
  const statusEl = document.getElementById("addToCollectionStatus");
  statusEl?.classList.add("hidden");
  if (statusEl) statusEl.textContent = "";

  return exactData;
}

export function setAddToCollectionAvailable(available) {
  const addBtn = document.getElementById("addToCollectionBtn");
  const qtyField = document.querySelector(".add-qty-field");
  if (addBtn) {
    if (available) {
      addBtn.classList.remove("hidden");
      if (!addBtn.classList.contains("btn-collection-locked")) {
        addBtn.disabled = false;
        addBtn.dataset.ready = "1";
      }
    } else {
      addBtn.disabled = true;
      delete addBtn.dataset.ready;
      addBtn.classList.add("hidden");
    }
  }
  if (qtyField) {
    qtyField.classList.toggle("hidden", !available);
  }
}

export function updateAddToCollectionState({ inCollection, sessionUsed }) {
  const addBtn = document.getElementById("addToCollectionBtn");
  const qtyField = document.querySelector(".add-qty-field");
  const statusEl = document.getElementById("addToCollectionStatus");

  if (!addBtn) return;

  addBtn.classList.remove("hidden");
  addBtn.textContent = "+ Add to collection";
  addBtn.classList.toggle("btn-collection-locked", Boolean(inCollection || sessionUsed));
  addBtn.disabled = Boolean(inCollection || sessionUsed);
  delete addBtn.dataset.ready;

  if (qtyField) {
    qtyField.classList.toggle("hidden", Boolean(inCollection || sessionUsed));
  }

  if (statusEl) {
    if (inCollection) {
      statusEl.textContent = "already in collection";
      statusEl.classList.remove("hidden");
    } else if (sessionUsed) {
      statusEl.textContent = "";
      statusEl.classList.add("hidden");
      statusEl.classList.remove("add-to-collection-status--ok");
    } else {
      statusEl.textContent = "";
      statusEl.classList.add("hidden");
      statusEl.classList.remove("add-to-collection-status--ok");
    }
  }
}

export function clearScoutResults() {
  const panel = document.getElementById("resultsPanel");
  const empty = document.getElementById("scoutEmptyState");
  panel?.classList.add("hidden");
  empty?.classList.remove("hidden");
  const addBtn = document.getElementById("addToCollectionBtn");
  if (addBtn) {
    addBtn.disabled = true;
    delete addBtn.dataset.ready;
    addBtn.classList.add("hidden");
  }
  document.querySelector(".add-qty-field")?.classList.add("hidden");
  const dupNotice = document.getElementById("scoutDuplicateNotice");
  dupNotice?.classList.add("hidden");
  if (dupNotice) dupNotice.textContent = "";
  const statusEl = document.getElementById("addToCollectionStatus");
  statusEl?.classList.add("hidden");
  if (statusEl) statusEl.textContent = "";
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
