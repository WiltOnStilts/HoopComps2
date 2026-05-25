import {
 loadState,
 saveState,
 replaceState,
 onStateChange,
 addToCollection,
 removeFromCollection,
 updateCollectionEntry,
 collectionTotal,
 collectionValuedCount,
 awardXp,
} from "./storage.js";
import {
 formatUsd,
 escapeHtml,
 formToCard,
 fillScoutForm,
 renderScoutResults,
 setupResultTabs,
} from "./scout-ui.js";
import { initListingModal } from "./listings-ui.js";
import { initPwa } from "./pwa.js";
import {
 loadStoredSession,
 isLoggedIn,
 getCurrentUser,
 register,
 login,
  logout,
 refreshCloudState,
 fetchCloudState,
 scheduleCloudSync,
 fetchLeaderboard,
 setAuthChangeHandler,
 pushCloudState,
} from "./auth.js";
import { mergeLocalAndCloud } from "./state-merge.js";
import { renderProfileSocial, initSocialUI } from "./social-ui.js";

const APP_NAME = "HoopComps";

let state = loadState();
let health = { ebayConfigured: false, ebayTip: "", ebaySetupCommand: "", ebaySignupUrl: "" };
let lastScoutData = state.lastScout?.data || null;
let lastScoutCard = state.lastScout?.card || null;
let cardOfDayData = null;
let profileFormSavedSnapshot = null;
let cloudPushPromise = null;

function getProfileFormValues() {
 return {
 displayName: $("profileNameInput")?.value.trim() || "Scout",
 favoritePlayer: $("profileFavoritePlayer")?.value.trim() || "",
 favoriteTeam: $("profileFavoriteTeam")?.value.trim() || "",
 collectorStyle: $("profileCollectorStyle")?.value || "investor",
 publicLeaderboard: Boolean($("profilePublicLb")?.checked),
 };
}

function profileFormValuesEqual(a, b) {
 return (
 a.displayName === b.displayName &&
 a.favoritePlayer === b.favoritePlayer &&
 a.favoriteTeam === b.favoriteTeam &&
 a.collectorStyle === b.collectorStyle &&
 a.publicLeaderboard === b.publicLeaderboard
 );
}

function syncProfileSaveButton() {
 const btn = $("saveProfileBtn");
 if (!btn) return;
 const current = getProfileFormValues();
 if (!profileFormSavedSnapshot) {
 profileFormSavedSnapshot = current;
 }
 btn.disabled = profileFormValuesEqual(current, profileFormSavedSnapshot);
}

function captureProfileFormSnapshot() {
 profileFormSavedSnapshot = getProfileFormValues();
 syncProfileSaveButton();
}

const VIEWS = ["dashboard", "scout", "collection", "profile", "about"];

function $(id) {
 return document.getElementById(id);
}

function navigate(view) {
 if (!VIEWS.includes(view)) view = "dashboard";
 document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
 document.querySelector(`[data-view="${view}"]`)?.classList.add("active");
 document.querySelectorAll(".nav-item, .desktop-nav-item").forEach((n) => {
 n.classList.toggle("active", n.dataset.nav === view);
 });
 if (view === "dashboard") renderDashboard();
 if (view === "collection") renderCollection();
 if (view === "profile") renderProfile();
 window.scrollTo({ top: 0, behavior: "smooth" });
}

function ebayTipHtml() {
 if (health.ebayConfigured) return "";
 return ` ${escapeHtml(health.ebayTip)} — Get a free App ID, then run ${escapeHtml(health.ebaySetupCommand)} `;
}

function updateHeaderStats() {
 $("scoutLevel").textContent = state.level ?? 1;
 $("scoutXp").textContent = state.xp ?? 0;
 $("scoutStreak").textContent = `${state.streak ?? 0}🔥`;
 const total = collectionTotal(state);
 const pill = $("collectionValuePill");
 if (pill) {
 pill.textContent = total > 0 ? formatUsd(total) : "—";
 }
}

function renderEbayBanner(containerId) {
 const el = $(containerId);
 if (!el) return;
 if (health.ebayConfigured) {
 el.classList.add("hidden");
 el.innerHTML = "";
 return;
 }
 el.classList.remove("hidden");
 el.innerHTML = `
 
 💡 
 
 ${escapeHtml(health.ebayTip)} 
 
 Sign up free at developer.ebay.com,
 then restart: ${escapeHtml(health.ebaySetupCommand)} 
 
 
 
 `;
}

function renderDashboard() {
 renderEbayBanner("dashboardEbayBanner");
 const total = collectionTotal(state);
 const coll = state.collection || [];
 const valued = collectionValuedCount(state);

 $("dashCollectionValue").textContent = total > 0 ? formatUsd(total) : "—";
 $("dashCardCount").textContent = coll.length;
 $("dashValuedCount").textContent = `${valued} / ${coll.length} priced`;

 const last = state.lastScout;
 const lastEl = $("dashLastScout");
 if (last?.data) {
 const est = last.data.valuation?.estimate;
 lastEl.innerHTML = `
 ${escapeHtml(last.card?.title || last.data.query)} 
 ${est != null ? formatUsd(est) : "View report"} 
 `;
 $("dashLastScoutCard").classList.remove("disabled");
 } else {
 lastEl.textContent = "No scouts yet — try your first card!";
 $("dashLastScoutCard").classList.add("disabled");
 }

 loadCardOfDay();
 loadLeaderboard();
}

async function loadLeaderboard() {
 const el = $("leaderboardList");
 if (!el) return;
 const entries = await fetchLeaderboard();
 if (!entries.length) {
   const cardCount = state.collection?.length || 0;
   const optedIn = Boolean(state.profile?.publicLeaderboard);
   if (!isLoggedIn()) {
     el.innerHTML =
       cardCount > 0
         ? `<p class="muted-text">Sign in to upload your ${cardCount} card${cardCount === 1 ? "" : "s"} and join the leaderboard.</p>`
         : `<p class="muted-text">Sign in and opt in on Profile to compete on the leaderboard.</p>`;
   } else if (optedIn && cardCount > 0) {
     el.innerHTML = `<p class="muted-text">Syncing your collection to the cloud…</p>`;
     void pushLocalToCloud();
   } else if (optedIn) {
     el.innerHTML = `<p class="muted-text">Add cards to your collection to rank on the leaderboard.</p>`;
   } else {
     el.innerHTML = `<p class="muted-text">Turn on “Show my collection value on the public leaderboard” in Profile, then save.</p>`;
   }
   return;
 }
 el.innerHTML = entries
 .map(
 (e, i) => `
 
 #${i + 1} 
 ${escapeHtml(e.name)} 
 ${e.cardCount} cards · Lv ${e.level} 
 ${formatUsd(e.total)} 
 `
 )
 .join("");
}

function renderAuthUI() {
  loadStoredSession();
  const btn = $("authHeaderBtn");
  const pill = $("authStatusPill");
  const user = getCurrentUser();
  const signedIn = isLoggedIn();

  if (signedIn) {
    if (btn) btn.textContent = "Sign out";
    $("profileAuthBtn").textContent = "Sign out";
    if (pill) {
      pill.classList.remove("hidden");
      pill.textContent = user?.displayName || user?.email?.split("@")[0] || "Signed in";
      pill.style.cursor = "default";
    }
 $("publicLeaderboardRow")?.classList.remove("hidden");
 $("profilePublicLb").checked = Boolean(state.profile?.publicLeaderboard);
 $("mobileAuthHint")?.classList.add("hidden");
 } else {
 if (btn) btn.textContent = "Sign in";
 $("profileAuthBtn").textContent = "Sign in";
 if (pill) {
 pill.classList.add("hidden");
 }
 $("publicLeaderboardRow")?.classList.add("hidden");
 if (health.multiUserEnabled) {
 $("mobileAuthHint")?.classList.remove("hidden");
 } else {
 $("mobileAuthHint")?.classList.add("hidden");
 }
 }

 if (health.multiUserEnabled === false) {
 $("authHint")?.classList.remove("hidden");
 }
}

function openAuthModal(mode = "login") {
 $("authModal")?.classList.remove("hidden");
 document.body.classList.add("modal-open");
 $("authModalTitle").textContent = mode === "register" ? "Create account" : "Sign in";
 $("authSubmitBtn").textContent = mode === "register" ? "Create account" : "Sign in";
 $("authSubmitBtn").dataset.mode = mode;
 document.querySelector(".auth-name-field")?.classList.toggle("hidden", mode !== "register");
 $("authSwitchText").innerHTML =
 mode === "register"
 ? `Already have an account? Sign in `
 : `New here? Create free account `;
 $("authError").textContent = "";
}

function closeAuthModal() {
 $("authModal")?.classList.add("hidden");
 document.body.classList.remove("modal-open");
}

function applyCloudState(nextState) {
 state = replaceState(nextState);
 lastScoutData = state.lastScout?.data || null;
 lastScoutCard = state.lastScout?.card || null;
 updateHeaderStats();
 renderDashboard();
 renderCollection();
 renderProfile();
 renderAuthUI();
 if (state.lastScout?.card) fillScoutForm($("scoutForm"), state.lastScout.card);
 $("profileNameInput").value = state.profile?.displayName || "";
 $("profileFavoritePlayer").value = state.profile?.favoritePlayer || "";
 $("profileFavoriteTeam").value = state.profile?.favoriteTeam || "";
 $("profileCollectorStyle").value = state.profile?.collectorStyle || "investor";
 $("profilePublicLb").checked = Boolean(state.profile?.publicLeaderboard);
 captureProfileFormSnapshot();
}

async function loadCardOfDay() {
 try {
 const res = await fetch("/api/card-of-day");
 cardOfDayData = await res.json();
 renderCardOfDay(cardOfDayData);
 } catch {
 $("cowTitle").textContent = "Card spotlight unavailable";
 $("cowSub").textContent = "Start the server to load today's featured card.";
 }
}

function renderCardOfDay(data) {
 const badge = $("cowBadge");
 const dayLabel = data?.dayLabel || data?.weekLabel || "Today";

 if (!data?.card) {
 if (badge) badge.textContent = "🏆 Card of the Day";
 $("cowTitle").textContent = data?.headline || "Card of the Day";
 $("cowSub").textContent = `${dayLabel} · ${data?.profileHint || "Featured collectors"}`;
 const ownerEl = $("cowOwner");
 if (ownerEl) {
 ownerEl.textContent = "";
 ownerEl.classList.add("hidden");
 }
 $("cowBlurb").textContent = data?.blurb || "Check back soon for today's spotlight card.";
 $("cowEstimate").textContent = "—";
 renderCardOfDayImage(null, null);
 const varEl = $("cowVariation");
 if (varEl) {
 varEl.innerHTML = "";
 varEl.classList.add("hidden");
 }
 return;
 }

 const { card, profileHint, scout, possessionLabel, headline, blurb, savedEstimate, cardImage } = data;

 if (badge) badge.textContent = "🏆 Card of the Day";

 $("cowTitle").textContent = headline || card.title;

 const ownerEl = $("cowOwner");
 if (ownerEl) {
 if (possessionLabel) {
 ownerEl.textContent = possessionLabel;
 ownerEl.classList.remove("hidden");
 } else {
 ownerEl.textContent = "";
 ownerEl.classList.add("hidden");
 }
 }

 renderCardOfDayImage(card, cardImage);

 $("cowSub").textContent = `${dayLabel} · ${profileHint}`;
 $("cowBlurb").textContent = blurb || "";

 const est = scout?.valuation?.estimate ?? savedEstimate;
 $("cowEstimate").textContent = est != null ? formatUsd(est) : "Scout for value";

 const pv = scout?.valuation?.priceVariation;
 const varEl = $("cowVariation");
 if (pv && varEl) {
 varEl.innerHTML = renderPriceVariationHtml(pv);
 varEl.classList.remove("hidden");
 } else if (varEl) {
 varEl.innerHTML = "";
 varEl.classList.add("hidden");
 }
}

function renderCardOfDayImage(card, cardImage) {
 const imgEl = $("cowImage");
 const placeholderEl = $("cowImagePlaceholder");
 const captionEl = $("cowImageCaption");
 if (!imgEl || !placeholderEl) return;

 const url = cardImage?.url;
 if (url) {
 imgEl.src = url;
 imgEl.alt = card?.title ? `${card.title} card photo` : "Card of the Day";
 imgEl.classList.remove("hidden");
 placeholderEl.classList.add("hidden");

 if (captionEl) {
 const source = cardImage.source || "Marketplace";
 const listing = cardImage.listingTitle;
 const listingSnippet =
 listing && listing.length > 72 ? `${listing.slice(0, 69)}…` : listing;
 captionEl.textContent = listingSnippet
 ? `Exact eBay match · ${listingSnippet}`
 : cardImage?.exactMatch
 ? "Exact eBay match"
 : source === "collection"
 ? "Photo saved from collector's entry"
 : `Photo via ${source}`;
 captionEl.classList.remove("hidden");
 }

 imgEl.onerror = () => {
 imgEl.classList.add("hidden");
 placeholderEl.classList.remove("hidden");
 if (captionEl) {
 captionEl.textContent = "Card photo unavailable";
 captionEl.classList.remove("hidden");
 }
 };
 } else {
 imgEl.removeAttribute("src");
 imgEl.classList.add("hidden");
 placeholderEl.classList.remove("hidden");
 if (captionEl) {
 captionEl.textContent = "";
 captionEl.classList.add("hidden");
 }
 }
}

function renderPriceVariationHtml(pv) {
 if (!pv) return "";
 const soldPct = pv.soldMedian && pv.spread ? ((pv.soldMedian - (pv.soldRange?.low ?? pv.soldMedian)) / pv.spread) * 100 : 50;
 const activePct = pv.activeMedian && pv.spread ? ((pv.activeMedian - (pv.soldRange?.low ?? pv.activeMedian)) / pv.spread) * 100 : 50;

 return `
 ${escapeHtml(pv.label)} 
 
 
 Sold ${formatUsd(pv.soldMedian)} 
 
 
 Active ${formatUsd(pv.activeMedian)} 
 
 
 ${pv.spreadPct != null ? ` Spread: ${Math.round(pv.spreadPct)}% · Active vs sold: ${pv.activeVsSoldPct != null ? (pv.activeVsSoldPct > 0 ? "+" : "") + Math.round(pv.activeVsSoldPct) + "%" : "—"} ` : ""}
 `;
}

function renderCollection() {
 renderEbayBanner("collectionEbayBanner");
 const coll = state.collection || [];
 const total = collectionTotal(state);
 const valued = collectionValuedCount(state);

 $("collectionTotalValue").textContent = total > 0 ? formatUsd(total) : "—";
 $("collectionSummary").textContent =
 coll.length === 0
 ? "Add cards from a scout report or manually below."
 : `${valued} of ${coll.length} cards have estimated values`;

 const list = $("collectionList");
 if (!coll.length) {
 list.innerHTML = ` 📦 Your collection is empty `;
 return;
 }

 list.innerHTML = coll
 .map((item) => {
 const title = item.card?.title || "Untitled card";
 const tier = item.tier;
 return `
 
 
 ${escapeHtml(title)} 
 ${escapeHtml([item.card?.player, item.card?.year, item.card?.parallel].filter(Boolean).join(" · "))} 
 ${tier ? ` ${tier.emoji} ${tier.tier} ` : ""}
 
 
 Est. value 
 ${formatUsd(item.estimatedValue)} 
 
 
 Re-scout 
 Remove 
 
 
 `;
 })
 .join("");

 list.querySelectorAll("[data-action=remove]").forEach((btn) => {
 btn.addEventListener("click", () => {
 removeFromCollection(state, btn.dataset.id);
 state = loadState();
 renderCollection();
 updateHeaderStats();
 renderDashboard();
 renderProfile();
 });
 });

 list.querySelectorAll("[data-action=scout-again]").forEach((btn) => {
 btn.addEventListener("click", () => {
 const item = state.collection.find((c) => c.id === btn.dataset.id);
 if (!item) return;
 navigate("scout");
 fillScoutForm($("scoutForm"), item.card);
 });
 });
}

function renderProfile() {
 $("profileName").textContent = state.profile?.displayName || "Scout";
 $("profileLevel").textContent = state.level ?? 1;
 const levelStat = $("profileLevelStat");
 if (levelStat) levelStat.textContent = state.level ?? 1;
 $("profileXp").textContent = state.xp ?? 0;
 $("profileStreak").textContent = state.streak ?? 0;
 $("profileScouts").textContent = state.scoutCount ?? 0;

 const coll = state.collection || [];
 const total = collectionTotal(state);
 $("profileCollectionValue").textContent = total > 0 ? formatUsd(total) : "—";
 $("profileCardCount").textContent = coll.length;
 $("profileValuedCount").textContent = collectionValuedCount(state);
 renderProfileSocial(state);
}

async function checkHealth() {
 try {
 const res = await fetch("/api/health");
 health = await res.json();
 document.title = APP_NAME;
 const h1 = document.querySelector(".logo-text h1");
 if (h1) h1.textContent = APP_NAME;
 const tagline = document.querySelector(".logo-text p");
 if (tagline && health.tagline) tagline.textContent = health.tagline;
 const setupBody = $("apiSetupBody");
 if (setupBody && health.ebayTip) setupBody.textContent = health.ebayTip;

 if (health.ebayAppIdSet && !health.ebayClientSecretSet) {
 const secretBanner = `
 
 🔑 
 
 Add your eBay Cert ID (Client Secret) 
 Copy the Cert ID from developer.ebay.com → Keys into EBAY_CLIENT_SECRET in.env, then restart the server. 
 
 `;
 for (const id of ["dashboardEbayBanner", "scoutEbayBanner", "collectionEbayBanner"]) {
 const el = $(id);
 if (el) {
 el.classList.remove("hidden");
 el.innerHTML = secretBanner;
 }
 }
 } else {
 renderEbayBanner("dashboardEbayBanner");
 renderEbayBanner("scoutEbayBanner");
 renderEbayBanner("collectionEbayBanner");
 }

 if (!health.ebayConfigured) $("apiSetup")?.setAttribute("open", "");
 renderAuthUI();
 } catch {
 health.ebayTip =
 "Tip: Set EBAY_APP_ID and EBAY_CLIENT_SECRET for live prices (free at developer.ebay.com)";
 health.ebaySetupCommand =
 "EBAY_APP_ID=your_app_id EBAY_CLIENT_SECRET=your_cert_id node server.mjs";
 health.ebaySignupUrl = "https://developer.ebay.com/my/keys";
 }
}

async function runScout(card) {
 const res = await fetch("/api/scout", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(card),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error || "Scout failed");
 return data;
}

async function handleScoutSubmit(e) {
 e.preventDefault();
 const card = formToCard($("scoutForm"));
 const scoutBtn = $("scoutBtn");
 const btnText = scoutBtn.querySelector(".btn-text");
 const btnLoading = scoutBtn.querySelector(".btn-loading");

 scoutBtn.disabled = true;
 btnText.classList.add("hidden");
 btnLoading.classList.remove("hidden");

 try {
 const data = await runScout(card);
 const exactData = renderScoutResults(data, {
 ebayTipBanner: health.ebayConfigured ? null : ebayTipHtml(),
 });
 lastScoutData = exactData;
 lastScoutCard = exactData.card || card;

 state.lastScout = { card: lastScoutCard, data: exactData, at: new Date().toISOString() };
 state.scoutCount = (state.scoutCount || 0) + 1;
 saveState(state);

 const addBtn = $("addToCollectionBtn");
 addBtn.disabled = false;

 const compBonus =
 exactData.sources.ebaySold?.stats?.count || exactData.sources.ebayActive?.stats?.count
 ? 15
 : 0;
 awardXp(state, 25 + compBonus);
 state = loadState();
 updateHeaderStats();
 renderDashboard();
 } catch (err) {
 alert(err.message || "Something went wrong");
 } finally {
 scoutBtn.disabled = false;
 btnText.classList.remove("hidden");
 btnLoading.classList.add("hidden");
 }
}

function handleAddToCollection() {
 if (!lastScoutCard) {
 alert("Scout a card first, then add it to your collection.");
 return;
 }
 const estimate = lastScoutData?.valuation?.estimate ?? null;
 addToCollection(state, {
 card: lastScoutCard,
 estimatedValue: estimate,
 scoutData: lastScoutData,
 });
 state = loadState();
 updateHeaderStats();
 const btn = $("addToCollectionBtn");
 btn.textContent = "✓ Added to collection";
 setTimeout(() => {
 btn.textContent = "+ Add to collection";
 }, 2000);
 renderDashboard();
 loadCardOfDay();
}

async function runAiInsights() {
 const coll = state.collection || [];
 const panel = $("aiInsightsPanel");
 const content = $("aiInsightsContent");
 const btn = $("aiEstimateBtn");

 if (!coll.length) {
 alert("Add cards to your collection first.");
 return;
 }

 btn.disabled = true;
 btn.textContent = "Analyzing…";
 panel.classList.remove("hidden");
 content.innerHTML = ` Running AI portfolio analysis across ${coll.length} cards… `;

 try {
 const res = await fetch("/api/collection/ai-insights", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ entries: coll }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error || "Analysis failed");

 let html = ` ${escapeHtml(data.summary)} `;

 if (data.aiNarrative) {
 html += ` ${escapeHtml(data.aiNarrative).replace(/\n/g, " ")} `;
 }

 if (data.insights?.length) {
 html += ` ${data.insights
 .map(
 (i) =>
 ` ${escapeHtml(i.title)} ${escapeHtml(i.text)} `
 )
 .join("")} `;
 }

 if (data.topCards?.length) {
 html += ` Top holdings ${data.topCards
 .map((c) => ` ${escapeHtml(c.title)} — ${formatUsd(c.estimate)} `)
 .join("")} `;
 }

 if (data.recommendations?.length) {
 html += ` Recommendations ${data.recommendations
 .map((r) => ` ${escapeHtml(r)} `)
 .join("")} `;
 }

 html += ` Analysis mode: ${data.mode === "openai" ? "OpenAI enhanced" : "Smart market heuristics"} `;
 content.innerHTML = html;
 } catch (err) {
 content.innerHTML = ` ${escapeHtml(err.message)} `;
 } finally {
 btn.disabled = false;
 btn.textContent = "🤖 AI collection insight";
 }
}
async function refreshCollectionValues() {
 const coll = state.collection || [];
 if (!coll.length) return;

 const btn = $("refreshCollectionBtn");
 btn.disabled = true;
 btn.textContent = "Estimating…";

 try {
 const res = await fetch("/api/collection/estimate", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ entries: coll }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error || "Estimate failed");

 for (const item of data.items) {
 const patch = { lastScoutedAt: new Date().toISOString() };
 if (item.estimate != null) patch.estimatedValue = item.estimate;
 if (item.tier) patch.tier = item.tier;
 updateCollectionEntry(state, item.id, patch);
 }
 state = loadState();
 renderCollection();
 renderProfile();
 updateHeaderStats();
 renderDashboard();

 if (data.total != null) {
 $("collectionTotalValue").textContent = formatUsd(data.total);
 }
 } catch (err) {
 alert(err.message || "Could not refresh values");
 } finally {
 btn.disabled = false;
 btn.textContent = "Refresh all values";
 }
}

function handleManualAdd(e) {
 e.preventDefault();
 const card = formToCard($("manualAddForm"));
 if (!card.title?.trim()) return;

 const manualVal = parseFloat($("manualValue").value);
 addToCollection(state, {
 card,
 estimatedValue: Number.isFinite(manualVal) ? manualVal : null,
 });
 state = loadState();
 $("manualAddForm").reset();
 renderCollection();
 updateHeaderStats();
 renderDashboard();
 renderProfile();
}

function initNavigation() {
 document.querySelectorAll("[data-nav]").forEach((el) => {
 el.addEventListener("click", (e) => {
 e.preventDefault();
 navigate(el.dataset.nav);
 });
 });

 document.querySelectorAll("[data-goto]").forEach((el) => {
 el.addEventListener("click", (e) => {
 e.preventDefault();
 const target = el.dataset.goto;
 if (target === "last-scout" && state.lastScout?.data) {
 navigate("scout");
 lastScoutData = state.lastScout.data;
 lastScoutCard = state.lastScout.card;
 renderScoutResults(state.lastScout.data, {
 ebayTipBanner: health.ebayConfigured ? null : ebayTipHtml(),
 });
 if (state.lastScout.card) fillScoutForm($("scoutForm"), state.lastScout.card);
 } else {
 navigate(target);
 }
 });
 });
}

function initProfileForm() {
 $("profileNameInput").value = state.profile?.displayName || "";
 $("profileFavoritePlayer").value = state.profile?.favoritePlayer || "";
 $("profileFavoriteTeam").value = state.profile?.favoriteTeam || "";
 $("profileCollectorStyle").value = state.profile?.collectorStyle || "investor";
 $("profilePublicLb").checked = Boolean(state.profile?.publicLeaderboard);
 captureProfileFormSnapshot();

 for (const id of [
 "profileNameInput",
 "profileFavoritePlayer",
 "profileFavoriteTeam",
 "profileCollectorStyle",
 "profilePublicLb",
 ]) {
 $(id)?.addEventListener("input", syncProfileSaveButton);
 $(id)?.addEventListener("change", syncProfileSaveButton);
 }

 $("saveProfileBtn").addEventListener("click", async () => {
 state.profile = state.profile || {};
 state.profile.displayName = $("profileNameInput").value.trim() || "Scout";
 state.profile.favoritePlayer = $("profileFavoritePlayer").value.trim();
 state.profile.favoriteTeam = $("profileFavoriteTeam").value.trim();
 state.profile.collectorStyle = $("profileCollectorStyle").value;
 state.profile.publicLeaderboard = $("profilePublicLb")?.checked || false;
 saveState(state);
 captureProfileFormSnapshot();
 renderProfile();
 updateHeaderStats();
 if (isLoggedIn()) {
   await pushLocalToCloud();
 }
 loadLeaderboard();
 });
}

function initAuth() {
 loadStoredSession();

 onStateChange((s) => {
 if (isLoggedIn()) {
 scheduleCloudSync(s, { publicLeaderboard: s.profile?.publicLeaderboard });
 }
 });

 setAuthChangeHandler(async ({ user, state: cloudState, mode }) => {
 if (mode === "logout") {
 closeAuthModal();
 renderAuthUI();
 return;
 }
 if (cloudState) applyCloudState(cloudState);
 closeAuthModal();
 renderAuthUI();
 await pushLocalToCloud();
 loadLeaderboard();
 loadCardOfDay();
 renderProfileSocial(state);
 });

 $("authHeaderBtn")?.addEventListener("click", () => {
 if (isLoggedIn()) {
 logout();
 return;
 }
 openAuthModal("login");
 });

 $("profileAuthBtn")?.addEventListener("click", () => {
 if (isLoggedIn()) {
 logout();
 return;
 }
 openAuthModal("login");
 });

 $("mobileAuthHint")?.addEventListener("click", () => openAuthModal("login"));

 $("authModal")?.querySelector(".modal-backdrop")?.addEventListener("click", closeAuthModal);
 $("authModalClose")?.addEventListener("click", closeAuthModal);

 $("authForm")?.addEventListener("submit", async (e) => {
 e.preventDefault();
 const mode = $("authSubmitBtn")?.dataset.mode || "login";
 const email = $("authEmail").value.trim();
 const password = $("authPassword").value;
 const displayName = $("authDisplayName")?.value?.trim();
 $("authError").textContent = "";
 $("authSubmitBtn").disabled = true;
 try {
 const guestState = loadState();
 if (mode === "register") {
 await register({ email, password, displayName, guestState });
 } else {
 await login({ email, password, guestState });
 }
 } catch (err) {
 $("authError").textContent = err.message;
 } finally {
 $("authSubmitBtn").disabled = false;
 }
 });

 document.addEventListener("click", (e) => {
 const sw = e.target.closest("[data-auth-switch]");
 if (sw) openAuthModal(sw.dataset.authSwitch);
 });
}

function promptCloudSync() {
 const cardCount = state.collection?.length || 0;
 $("authError").textContent =
   cardCount > 0
     ? `Sign in again to upload your ${cardCount} saved card${cardCount === 1 ? "" : "s"} to the cloud.`
     : "Sign in again to sync your profile to the cloud.";
 openAuthModal("login");
}

async function pushLocalToCloud() {
 if (!isLoggedIn()) return false;
 const hasCards = (state.collection?.length || 0) > 0;
 const optedIn = Boolean(state.profile?.publicLeaderboard);
 if (!hasCards && !optedIn) return false;

 if (cloudPushPromise) return cloudPushPromise;

 cloudPushPromise = (async () => {
   try {
     await pushCloudState(state, { publicLeaderboard: optedIn });
     await loadCardOfDay();
     await loadLeaderboard();
     return true;
   } catch (err) {
     if (err.status === 401) {
       logout();
       renderAuthUI();
       promptCloudSync();
     }
     return false;
   } finally {
     cloudPushPromise = null;
   }
 })();

 return cloudPushPromise;
}

async function reconcileCloudState() {
 if (!isLoggedIn()) return;

 const localSnapshot = {
   ...state,
   collection: [...(state.collection || [])],
   profile: { ...state.profile },
 };

 const cloudResult = await fetchCloudState();

 if (cloudResult.unauthorized) {
   logout();
   renderAuthUI();
   if (localSnapshot.collection.length) {
     promptCloudSync();
   }
   return;
 }

 if (cloudResult.state) {
   const merged = mergeLocalAndCloud(localSnapshot, cloudResult.state);
   applyCloudState(merged);
 }

 if ((state.collection?.length || 0) > 0 || state.profile?.publicLeaderboard) {
   await pushLocalToCloud();
 }
}

async function bootstrapSession() {
  loadStoredSession();
  renderAuthUI();

  if (isLoggedIn()) {
    await reconcileCloudState();
  }

  renderAuthUI();
  renderProfileSocial(state);
}

function setupSessionPersistence() {
  window.addEventListener("pageshow", async () => {
    loadStoredSession();
    renderAuthUI();
    if (!isLoggedIn()) return;
    await reconcileCloudState();
    renderAuthUI();
    renderDashboard();
    renderCollection();
    renderProfile();
  });

  window.addEventListener("online", () => {
    if (!isLoggedIn()) return;
    reconcileCloudState();
  });
}

function init() {
  loadStoredSession();
  initNavigation();
 initPwa();
  initAuth();
  setupSessionPersistence();
  setupResultTabs();
 initListingModal();
 initSocialUI({ getState: () => state, openAuthModal });
 $("scoutForm").addEventListener("submit", handleScoutSubmit);
 $("addToCollectionBtn").addEventListener("click", handleAddToCollection);
 $("refreshCollectionBtn").addEventListener("click", refreshCollectionValues);
 $("aiEstimateBtn").addEventListener("click", runAiInsights);
 $("manualAddForm").addEventListener("submit", handleManualAdd);
 $("cowScoutBtn")?.addEventListener("click", () => {
 if (!cardOfDayData?.card) return;
 navigate("scout");
 fillScoutForm($("scoutForm"), cardOfDayData.card);
 $("scoutForm").requestSubmit();
 });
 initProfileForm();

 updateHeaderStats();
 checkHealth().then(async () => {
 await bootstrapSession();
 renderDashboard();
 loadCardOfDay();
 loadLeaderboard();
 navigate("dashboard");
 });
}

init();
