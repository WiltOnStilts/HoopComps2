import { formatUsd, escapeHtml } from "./utils.js";

let modalEl = null;

const SOURCE_CREDITS = [
  { name: "eBay", role: "Sold comps and active listings (Browse API + Marketplace Insights when approved)" },
];

export function initListingModal() {
  if (modalEl) return;
  modalEl = document.getElementById("listingModal");
  if (!modalEl) return;

  modalEl.querySelector("[data-close-modal]")?.addEventListener("click", closeListingModal);
  modalEl.querySelector(".modal-backdrop")?.addEventListener("click", closeListingModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeListingModal();
  });
}

export function closeListingModal() {
  modalEl?.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function formatDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function listingCardHtml(item, index) {
  const typeLabel =
    item.listingType === "sold"
      ? "Sold comp"
      : item.listingType === "active"
        ? "Active listing"
        : "Listing";

  return `
    <button type="button" class="listing-card listing-card-btn" data-listing-index="${index}">
      ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy" />` : '<div class="listing-no-img">🃏</div>'}
      <div class="listing-body">
        <div class="listing-badges">
          <span class="source-badge">${item.sourceIcon || "📦"} ${escapeHtml(item.sourceName || "Source")}</span>
          <span class="type-badge">${typeLabel}</span>
        </div>
        <div class="title">${escapeHtml(item.title || item.name)}</div>
        ${item.condition ? `<p class="listing-meta">${escapeHtml(item.condition)}</p>` : ""}
      </div>
      <div class="listing-side">
        <div class="price">${formatUsd(item.price)}</div>
        <span class="view-hint">Details →</span>
      </div>
    </button>
  `;
}

export function getSoldListings(data) {
  return (data.sources?.ebaySold?.items || []).map((i) => ({
    ...i,
    listingType: "sold",
  }));
}

export function getActiveListings(data) {
  return (data.sources?.ebayActive?.items || []).map((i) => ({
    ...i,
    listingType: "active",
  }));
}

export function flattenScoutListings(data) {
  return [...getSoldListings(data), ...getActiveListings(data)];
}

function attachListingClicks(container, items) {
  container.querySelectorAll("[data-listing-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.listingIndex);
      openListingModal(items[idx]);
    });
  });
}

export function renderListingGrid(container, items, { emptyMessage } = {}) {
  if (!items?.length) {
    container.innerHTML = `<p class="muted-text">${escapeHtml(emptyMessage || "No listings to show.")}</p>`;
    return;
  }
  container.innerHTML = `<div class="listing-grid">${items.map((item, i) => listingCardHtml(item, i)).join("")}</div>`;
  attachListingClicks(container, items);
}

function soldSetupGuide(source) {
  const err = source?.error ? `<p class="muted-text">${escapeHtml(source.error)}</p>` : "";
  return `
    <div class="alert-box info-box sold-setup">
      <p><strong>Sold comps — how to enable</strong></p>
      <p>Your <strong>Sold</strong> tab shows eBay sold prices when Marketplace Insights is approved on your eBay developer account.</p>
      ${err}
      <ol class="setup-steps">
        <li>Confirm <code>EBAY_APP_ID</code> and <code>EBAY_CLIENT_SECRET</code> are in your <code>.env</code> (Production keys).</li>
        <li>Apply for an <a href="https://developer.ebay.com/grow/application-growth-check" target="_blank" rel="noopener">Application Growth Check</a>.</li>
        <li>Request <strong>Marketplace Insights API</strong> access for your basketball card scout.</li>
        <li>Restart the server after approval — sold comps appear here like active listings.</li>
      </ol>
      <p class="muted-text"><strong>Until then:</strong> use <strong>Active</strong> eBay listings as a proxy, or enter sold prices manually when adding to your collection.</p>
    </div>`;
}

function sourceStatusBlock(source, { soldTab = false } = {}) {
  if (source?.unavailable && soldTab) {
    return soldSetupGuide(source);
  }
  if (source?.error) {
    const setup = source.setup ? `<p class="muted-text">${escapeHtml(source.setup)}</p>` : "";
    return `<div class="alert-box">${escapeHtml(source.error)}${setup}</div>`;
  }
  if (!source?.configured && source?.setup) {
    return `<div class="alert-box">${escapeHtml(source.setup)}</div>`;
  }
  return "";
}

function exactMatchEmptyNote(source, sourceLabel = "marketplace") {
  if (source?.totalFetched > 0) {
    return `Found ${source.totalFetched} ${sourceLabel} result(s), but none matched your card details exactly. Add player, year, set, card #, parallel, grade, or serial for tighter comps.`;
  }
  return `No exact ${sourceLabel} matches. Fill in player, year, set, card #, and parallel for tighter comps.`;
}

function renderSourceStatusHtml(sources = []) {
  return sources
    .map((s) => sourceStatusBlock(s.source, s.options))
    .filter(Boolean)
    .join("");
}

export function renderSoldCompsInApp(container, data) {
  const sold = data.sources?.ebaySold;
  const items = getSoldListings(data);
  const status = renderSourceStatusHtml([{ source: sold, options: { soldTab: true } }]);

  if (status && !items.length) {
    container.innerHTML = status;
    return;
  }

  if (!items.length) {
    container.innerHTML =
      status + `<p class="muted-text">${escapeHtml(exactMatchEmptyNote(sold, "eBay sold"))}</p>`;
    return;
  }

  container.innerHTML = status;
  const intro = document.createElement("p");
  intro.className = "comps-intro muted-text";
  intro.textContent =
    "eBay sold comps that exactly match your card.";
  container.appendChild(intro);
  const wrap = document.createElement("div");
  container.appendChild(wrap);
  renderListingGrid(wrap, items);
}

export function renderActiveCompsInApp(container, data) {
  const ebay = data.sources?.ebayActive;
  const items = getActiveListings(data);
  const status = renderSourceStatusHtml([{ source: ebay }]);

  if (status && !items.length) {
    container.innerHTML = status;
    return;
  }

  if (!items.length) {
    container.innerHTML =
      status +
      `<p class="muted-text">${escapeHtml(exactMatchEmptyNote(ebay, "eBay"))}</p>`;
    return;
  }

  container.innerHTML = status;
  const intro = document.createElement("p");
  intro.className = "comps-intro muted-text";
  intro.textContent = "eBay active listings that exactly match your card.";
  container.appendChild(intro);
  const wrap = document.createElement("div");
  container.appendChild(wrap);
  renderListingGrid(wrap, items);
}

/** @deprecated use renderSoldCompsInApp or renderActiveCompsInApp */
export function renderListingsInApp(container, source, options = {}) {
  if (options.soldTab) {
    renderSoldCompsInApp(container, { sources: { ebaySold: source } });
    return;
  }
  renderActiveCompsInApp(container, {
    sources: { ebayActive: source },
  });
}

function creditsFooter() {
  return `
    <div class="sources-credit panel-inner">
      <h4>Sources</h4>
      <p class="muted-text">Comps load inside HoopComps from eBay. Tap a listing for details; open the original site only if you choose.</p>
      <ul class="credit-list">
        ${SOURCE_CREDITS.map(
          (s) =>
            `<li><strong>${escapeHtml(s.name)}</strong> — ${escapeHtml(s.role)}</li>`
        ).join("")}
      </ul>
    </div>`;
}

export function renderAllComps(container, data) {
  const sold = data.sources?.ebaySold;
  const active = data.sources?.ebayActive;

  const sections = [];
  const allItems = [];
  let idx = 0;

  const soldItems = getSoldListings(data);
  if (soldItems.length) {
    sections.push({ title: "eBay sold comps", icon: "📊", items: soldItems });
  } else if (sold?.unavailable || sold?.error || sold?.setup) {
    sections.push({
      title: "eBay sold comps",
      icon: "📊",
      status: sourceStatusBlock(sold, { soldTab: true }),
    });
  } else if (sold) {
    sections.push({
      title: "eBay sold comps",
      icon: "📊",
      status: `<p class="muted-text">${escapeHtml(exactMatchEmptyNote(sold, "eBay sold"))}</p>`,
    });
  }

  const ebayActiveItems = (active?.items || []).map((i) => ({ ...i, listingType: "active" }));
  if (ebayActiveItems.length) {
    sections.push({ title: "eBay active listings", icon: "🛒", items: ebayActiveItems });
  } else if (active) {
    sections.push({
      title: "eBay active listings",
      icon: "🛒",
      status: `<p class="muted-text">${escapeHtml(exactMatchEmptyNote(active, "eBay"))}</p>`,
    });
  }

  if (!sections.some((s) => s.items?.length || s.status)) {
    container.innerHTML = `<p class="muted-text">No in-app comps yet. Scout a card with your eBay keys configured.</p>${creditsFooter()}`;
    return;
  }

  let html = `<p class="comps-intro">Exact eBay matches for your card. Tap any listing for full details.</p>`;

  for (const sec of sections) {
    html += `<div class="comps-section"><h3 class="comps-section-title">${sec.icon} ${escapeHtml(sec.title)}</h3>`;
    if (sec.status) {
      html += sec.status;
    } else {
      html += `<div class="listing-grid section-grid">`;
      for (const item of sec.items) {
        html += listingCardHtml(item, idx);
        allItems.push(item);
        idx += 1;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }

  html += creditsFooter();
  container.innerHTML = html;
  attachListingClicks(container, allItems);
}

async function openListingModal(item) {
  if (!modalEl || !item) return;
  document.body.classList.add("modal-open");
  modalEl.classList.remove("hidden");

  const body = modalEl.querySelector(".modal-body");
  body.innerHTML = `<p class="muted-text">Loading details…</p>`;

  let detail = { ...item };
  const isEbay = item.source?.startsWith("ebay") && item.id;
  if (isEbay) {
    try {
      const res = await fetch(`/api/listing/detail?id=${encodeURIComponent(item.id)}`);
      const extra = await res.json();
      if (res.ok && !extra.error) detail = { ...item, ...extra };
    } catch {
      /* use summary data */
    }
  }

  const title = detail.title || detail.name || "Listing";
  const price = detail.price;

  body.innerHTML = `
    <div class="modal-listing">
      ${detail.image ? `<img class="modal-img" src="${escapeHtml(detail.image)}" alt="" />` : ""}
      <div class="modal-content">
        <div class="listing-badges">
          <span class="source-badge">${detail.sourceIcon || "📦"} ${escapeHtml(detail.sourceName || "Source")}</span>
        </div>
        <h3 id="modalTitle">${escapeHtml(title)}</h3>
        <p class="modal-price">${formatUsd(price)}</p>
        ${detail.condition ? `<p class="detail-row"><span>Condition</span> ${escapeHtml(detail.condition)}</p>` : ""}
        ${detail.seller ? `<p class="detail-row"><span>Seller</span> ${escapeHtml(detail.seller)}${detail.sellerFeedback ? ` (${detail.sellerFeedback}% positive)` : ""}</p>` : ""}
        ${detail.endTime ? `<p class="detail-row"><span>Date</span> ${formatDate(detail.endTime)}</p>` : ""}
        ${detail.itemLocation ? `<p class="detail-row"><span>Location</span> ${escapeHtml(detail.itemLocation)}</p>` : ""}
        ${detail.description ? `<p class="modal-desc">${escapeHtml(detail.description)}</p>` : ""}
        <p class="modal-attribution">Listing from <strong>${escapeHtml(detail.sourceName || "market source")}</strong>. Verify on the original site before buying or selling.</p>
        ${
          detail.url
            ? `<button type="button" class="btn-ghost modal-external" data-external-url="${escapeHtml(detail.url)}">View on ${escapeHtml(detail.sourceName || "source")} (optional)</button>`
            : ""
        }
      </div>
    </div>
  `;

  body.querySelector("[data-external-url]")?.addEventListener("click", (e) => {
    const url = e.currentTarget.dataset.externalUrl;
    if (url && confirm("Open the original listing on the source website?")) {
      window.open(url, "_blank", "noopener");
    }
  });
}
