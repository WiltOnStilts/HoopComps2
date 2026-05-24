import { formatUsd, escapeHtml } from "./utils.js";

let modalEl = null;

const SOURCE_CREDITS = [
  { name: "eBay", role: "Active listings & sold comps (when API allows)" },
  { name: "Amazon", role: "Active collectibles marketplace reference" },
  { name: "PriceCharting", role: "Basketball card price guide" },
  { name: "130point", role: "Industry sold-comp reference" },
  { name: "COMC", role: "Marketplace reference" },
  { name: "ALT / Heritage / Goldin", role: "Auction reference" },
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
      : item.listingType === "guide"
        ? "Price guide"
        : "Active listing";

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
        ${item.set ? `<p class="listing-meta">${escapeHtml(item.set)}</p>` : ""}
      </div>
      <div class="listing-side">
        <div class="price">${formatUsd(item.price ?? item.loose ?? item.psa10)}</div>
        <span class="view-hint">Details →</span>
      </div>
    </button>
  `;
}

function guideToListing(p) {
  const prices = [p.psa10, p.graded9, p.loose, p.new].filter((v) => v != null);
  return {
    ...p,
    title: p.name,
    price: prices.length ? Math.max(...prices) : null,
    listingType: "guide",
  };
}

export function flattenScoutListings(data) {
  const items = [];
  const sold = data.sources?.ebaySold;
  const active = data.sources?.ebayActive;
  const pc = data.sources?.priceCharting;

  if (sold?.items?.length) {
    for (const i of sold.items) items.push({ ...i, listingType: "sold" });
  }
  if (active?.items?.length) {
    for (const i of active.items) items.push({ ...i, listingType: "active" });
  }
  if (pc?.products?.length) {
    for (const p of pc.products) items.push(guideToListing(p));
  }
  return items;
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
      <p>Your app already has a <strong>Sold</strong> tab. It fills automatically when eBay grants <strong>Marketplace Insights</strong> access (sold prices are restricted; active listings use a different API).</p>
      ${err}
      <ol class="setup-steps">
        <li>Confirm <code>EBAY_APP_ID</code> and <code>EBAY_CLIENT_SECRET</code> are in your <code>.env</code> (Production keys).</li>
        <li>Apply for an <a href="https://developer.ebay.com/grow/application-growth-check" target="_blank" rel="noopener">Application Growth Check</a> — required for restricted Buy APIs.</li>
        <li>Request <strong>Marketplace Insights API</strong> access. Say you’re building a basketball card value research tool.</li>
        <li>If approved, restart the server — sold comps appear here like active listings.</li>
      </ol>
      <p class="muted-text"><strong>Until then:</strong> use <strong>Active</strong> as a proxy, add <code>PRICECHARTING_TOKEN</code> for guide values, or enter sold prices manually when adding to your collection.</p>
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
  if (!source?.configured) {
    return `<div class="alert-box">${escapeHtml(source.setup || "Source not configured.")}</div>`;
  }
  return "";
}

export function renderListingsInApp(container, source, options = {}) {
  const status = sourceStatusBlock(source, options);
  if (status && (!source?.items?.length || source?.error || source?.unavailable || !source?.configured)) {
    container.innerHTML = status;
    return;
  }
  if (!source?.items?.length) {
    container.innerHTML =
      status + `<p class="muted-text">${escapeHtml(exactMatchEmptyNote(source))}</p>`;
    return;
  }
  container.innerHTML = status;
  const intro = document.createElement("p");
  intro.className = "comps-intro muted-text";
  intro.textContent = "Showing only listings that exactly match your card details.";
  container.appendChild(intro);
  const wrap = document.createElement("div");
  container.appendChild(wrap);
  renderListingGrid(wrap, source.items, options);
}

export function renderGuideInApp(container, pc) {
  if (!pc?.configured) {
    container.innerHTML = `<div class="alert-box">Add <code>PRICECHARTING_TOKEN</code> for in-app guide prices.</div>`;
    return;
  }
  if (pc.error) {
    container.innerHTML = `<div class="alert-box">${escapeHtml(pc.error)}</div>`;
    return;
  }
  if (!pc.products?.length) {
    container.innerHTML = `<p class="muted-text">No PriceCharting matches for this card.</p>`;
    return;
  }
  const items = pc.products.map(guideToListing);
  renderListingGrid(container, items);
}

function creditsFooter() {
  return `
    <div class="sources-credit panel-inner">
      <h4>Sources credited</h4>
      <p class="muted-text">All comps below are loaded inside HoopComps. We don’t send you away unless you choose “View on original site” in a listing.</p>
      <ul class="credit-list">
        ${SOURCE_CREDITS.map(
          (s) =>
            `<li><strong>${escapeHtml(s.name)}</strong> — ${escapeHtml(s.role)}</li>`
        ).join("")}
      </ul>
    </div>`;
}

function exactMatchEmptyNote(source) {
  if (source?.totalFetched > 0) {
    return `Found ${source.totalFetched} eBay result(s), but none matched your card details exactly. Add player, year, set, card #, parallel, grade, or serial for tighter comps.`;
  }
  return "No exact matches. Fill in player, year, set, card #, and parallel for tighter comps.";
}

export function renderAllComps(container, data) {
  const sold = data.sources?.ebaySold;
  const active = data.sources?.ebayActive;
  const pc = data.sources?.priceCharting;

  const sections = [];
  const allItems = [];

  if (sold?.items?.length) {
    sections.push({
      title: "eBay sold comps",
      icon: "📊",
      items: sold.items.map((i) => ({ ...i, listingType: "sold" })),
    });
  } else if (sold?.unavailable || sold?.error || !sold?.configured) {
    sections.push({
      title: "eBay sold comps",
      icon: "📊",
      status: sourceStatusBlock(sold, { soldTab: true }),
    });
  } else if (sold?.exactMatch) {
    sections.push({
      title: "eBay sold comps",
      icon: "📊",
      status: `<p class="muted-text">${escapeHtml(exactMatchEmptyNote(sold))}</p>`,
    });
  }

  if (active?.items?.length) {
    sections.push({ title: "eBay active listings", icon: "🛒", items: active.items });
  } else if (active?.exactMatch) {
    sections.push({
      title: "eBay active listings",
      icon: "🛒",
      status: `<p class="muted-text">${escapeHtml(exactMatchEmptyNote(active))}</p>`,
    });
  }

  if (pc?.products?.length) {
    sections.push({
      title: "PriceCharting guide",
      icon: "💰",
      items: pc.products.map(guideToListing),
    });
  }

  if (!sections.some((s) => s.items?.length || s.status)) {
    container.innerHTML = `<p class="muted-text">No in-app comps yet. Scout a card with your eBay keys configured.</p>${creditsFooter()}`;
    return;
  }

  let html = `<p class="comps-intro">Showing only listings that exactly match your card details. Tap any card for full details.</p>`;
  let idx = 0;

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
  if (item.id && item.source?.startsWith("ebay") && item.listingType !== "guide") {
    try {
      const res = await fetch(`/api/listing/detail?id=${encodeURIComponent(item.id)}`);
      const extra = await res.json();
      if (res.ok && !extra.error) detail = { ...item, ...extra };
    } catch {
      /* use summary data */
    }
  }

  const title = detail.title || detail.name || "Listing";
  const price = detail.price ?? detail.loose ?? detail.psa10;
  const guideRows =
    detail.listingType === "guide"
      ? `
      ${detail.loose != null ? `<div class="detail-row"><span>Raw</span><strong>${formatUsd(detail.loose)}</strong></div>` : ""}
      ${detail.graded9 != null ? `<div class="detail-row"><span>Graded 9</span><strong>${formatUsd(detail.graded9)}</strong></div>` : ""}
      ${detail.psa10 != null ? `<div class="detail-row"><span>PSA 10</span><strong>${formatUsd(detail.psa10)}</strong></div>` : ""}
      ${detail.bgs10 != null ? `<div class="detail-row"><span>BGS 10</span><strong>${formatUsd(detail.bgs10)}</strong></div>` : ""}
    `
      : "";

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
        ${guideRows}
        <p class="modal-attribution">Data provided by <strong>${escapeHtml(detail.sourceName || "market source")}</strong>. HoopComps aggregates comps for research — verify before buying or selling.</p>
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
