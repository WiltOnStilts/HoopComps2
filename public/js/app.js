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
 handleScoutRewards,
 getCoins,
 registerUniqueScan,
 takePendingDailyEvents,
 finalizeDailyNotifications,
 peekPendingDailyEvents,
} from "./storage.js";
import {
 formatUsd,
 escapeHtml,
 formToCard,
 renderScoutResults,
 clearScoutResults,
 setAddToCollectionAvailable,
 setupResultTabs,
} from "./scout-ui.js";
import { initListingModal } from "./listings-ui.js";
import { initPwa } from "./pwa.js";
import {
  initScoutWizard,
  fillScoutWizard,
  resetScoutWizard,
  cardFromScoutForm,
  validateScoutCard,
  getPendingScoutPhotoUrl,
  clearPendingScoutPhoto,
} from "./scout-wizard.js";
import {
 loadStoredSession,
 restoreSessionFromServer,
 isLoggedIn,
 getCurrentUser,
 register,
 login,
 resetPassword,
 logout,
 refreshCloudState,
 fetchCloudState,
 scheduleCloudSync,
 fetchLeaderboard,
 setAuthChangeHandler,
 pushCloudState,
} from "./auth.js";
import { mergeLocalAndCloud } from "./state-merge.js";
import { renderProfileSocial, renderCommunityChat, initSocialUI, openFriendModal } from "./social-ui.js";
import { renderCommunityFriends, initCommunityFriendsUI } from "./community-friends-ui.js";
import { renderCodDayEngagement, initCodDayUI } from "./cod-day-ui.js";
import { resolveCollectionImage } from "./card-image.js";
import { uniqueScoutCount } from "./card-fingerprint.js";
import { COINS_HELP_TEXT, COINS_PER_UNIQUE_SCAN, shouldShowDailyNotifications } from "./economy.js";
import { renderShop, updateProfileAvatarMount, disposeShopAvatarPreview } from "./shop-ui.js";
import { renderAvatarStudio, disposeAvatarStudio } from "./avatar-studio-ui.js";
import { showDailyNotificationQueue } from "./daily-notifications.js";
import { maybeShowPushPermissionPrompt, syncPendingPushSubscription, initPushSettingsUI, renderPushSettings } from "./push-notifications.js";
import { maybeShowInstallGuide, initInstallGuideUI } from "./install-guide.js";
import { isStandaloneApp } from "./pwa.js";

const APP_NAME = "HoopComps";

let state = loadState();
let health = { ebayConfigured: false, ebayTip: "", ebaySetupCommand: "", ebaySignupUrl: "" };
let lastScoutData = state.lastScout?.data || null;
let lastScoutCard = state.lastScout?.card || null;
let cardOfDayData = null;
let profileFormSavedSnapshot = null;
let cloudPushPromise = null;
let scoutPageWasHidden = false;
let collectionSearchQuery = "";
let collectionSortMode = "recent";

 function resetScoutSession() {
  resetScoutWizard($("scoutForm"));
  clearScoutResults();
  clearPendingScoutPhoto();
  lastScoutData = null;
  lastScoutCard = null;
}

function filterAndSortCollection(coll, { search, sort }) {
  let items = [...coll];
  const q = search?.trim().toLowerCase();
  if (q) {
    items = items.filter((item) => {
      const card = item.card || {};
      const haystack = [
        card.title,
        card.player,
        card.set,
        card.parallel,
        card.notes,
        card.year,
        card.cardNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  items.sort((a, b) => {
    switch (sort) {
      case "value-desc":
        return (b.estimatedValue ?? -1) - (a.estimatedValue ?? -1);
      case "value-asc":
        return (a.estimatedValue ?? Number.POSITIVE_INFINITY) - (b.estimatedValue ?? Number.POSITIVE_INFINITY);
      case "title-asc":
        return (a.card?.title || "").localeCompare(b.card?.title || "", undefined, { sensitivity: "base" });
      case "title-desc":
        return (b.card?.title || "").localeCompare(a.card?.title || "", undefined, { sensitivity: "base" });
      case "added":
        return new Date(b.addedAt || 0) - new Date(a.addedAt || 0);
      case "recent":
      default:
        return (
          new Date(b.lastScoutedAt || b.addedAt || 0) - new Date(a.lastScoutedAt || a.addedAt || 0)
        );
    }
  });

  return items;
}

function collectionImageHtml(item) {
  const image = resolveCollectionImage(item);
  if (image?.url) {
    const safeSrc = image.url.startsWith("data:")
      ? image.url.replace(/"/g, "&quot;")
      : escapeHtml(image.url);
    return `<img src="${safeSrc}" alt="" loading="lazy" />`;
  }
  return `<span class="collection-card-placeholder" aria-hidden="true">🃏</span>`;
}

function collectionImageSourceLabel(item) {
  const image = resolveCollectionImage(item);
  if (!image?.url) return "No image yet";
  if (item.userPhotoUrl || image.source === "Your photo") return "Your photo";
  return image.source || "eBay exact match";
}

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

const VIEWS = ["dashboard", "community", "scout", "collection", "profile", "shop", "avatar", "about"];

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
 if (view === "community") renderCommunity();
 if (view === "collection") renderCollection();
 if (view === "profile") {
   void (async () => {
     if (!health?.pushEnabled) await checkHealth();
     renderProfile();
     await renderProfileSocial(state);
   })();
 }
 if (view === "shop") renderShopView();
 else disposeShopAvatarPreview();
 if (view === "avatar") renderAvatarStudioView();
 else disposeAvatarStudio();
 window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderShopView() {
 renderShop(state, {
 onNavigate: navigate,
 onChange: (next) => {
 state = next;
 updateHeaderStats();
 renderProfile();
 },
 });
}

function renderAvatarStudioView() {
 renderAvatarStudio(state, {
 onChange: (next) => {
 state = next;
 updateHeaderStats();
 updateProfileAvatarMount(state);
 },
 });
}

function ebayTipHtml() {
 if (health.ebayConfigured) return "";
 return ` ${escapeHtml(health.ebayTip)} — Get a free App ID, then run ${escapeHtml(health.ebaySetupCommand)} `;
}

function updateHeaderStats() {
 const coins = getCoins(state);
 const streak = state.streak ?? 0;
 if ($("headerCoins")) $("headerCoins").textContent = String(coins);
 if ($("headerStreak")) $("headerStreak").textContent = `${streak}🔥`;
 if ($("scoutCoins")) $("scoutCoins").textContent = String(coins);
 $("scoutStreak").textContent = `${streak}🔥`;
 const help = $("coinsHelpText");
 if (help) help.textContent = COINS_HELP_TEXT;
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

 loadLeaderboard();
}

async function renderCommunity() {
 await loadCardOfDay();
 await renderCodDayEngagement({ openAuthModal });
 await renderCommunityFriends();
 await renderCommunityChat();
}

 async function loadLeaderboard() {
 const el = $("leaderboardList");
 if (!el) return;
 const entries = await fetchLeaderboard();
 if (!entries.length) {
   const scoutCount = uniqueScoutCount(state);
   const optedIn = Boolean(state.profile?.publicLeaderboard);
   if (!isLoggedIn()) {
     el.innerHTML =
       scoutCount > 0
         ? `<p class="muted-text">Sign in to sync your ${scoutCount} scan${scoutCount === 1 ? "" : "s"} and join the leaderboard.</p>`
         : `<p class="muted-text">Sign in and opt in on Profile to compete on the leaderboard.</p>`;
   } else if (optedIn && scoutCount > 0) {
     el.innerHTML = `<p class="muted-text">Syncing your scans to the cloud…</p>`;
     void pushLocalToCloud();
   } else if (optedIn) {
     el.innerHTML = `<p class="muted-text">Scout different cards to rank on the leaderboard.</p>`;
   } else {
     el.innerHTML = `<p class="muted-text">Turn on “Show my scans on the public leaderboard” in Profile, then save.</p>`;
   }
   return;
 }
 el.innerHTML = entries
 .map(
 (e, i) => `
 
 #${i + 1} 
 ${escapeHtml(e.name)} 
 ${e.scoutCount} unique scan${e.scoutCount === 1 ? "" : "s"} · ${e.streak ?? 0}🔥 streak
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
    document.body.classList.add("mobile-signed-in");
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
 document.body.classList.remove("mobile-signed-in");
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
 const titles = {
   register: "Create account",
   login: "Sign in",
   reset: "Set your password",
 };
 const hints = {
   register: "Sync your collection across phones, tablets, and desktop — free.",
   login: "Sync your collection across phones, tablets, and desktop — free.",
   reset: "Choose a password for this email. Your saved cards on this device will upload automatically.",
 };
 const buttons = {
   register: "Create account",
   login: "Sign in",
   reset: "Save password & sign in",
 };
 $("authModalTitle").textContent = titles[mode] || "Sign in";
 $("authModalHint").textContent = hints[mode] || hints.login;
 $("authSubmitBtn").textContent = buttons[mode] || "Sign in";
 $("authSubmitBtn").dataset.mode = mode;
 document.querySelector(".auth-name-field")?.classList.toggle("hidden", mode !== "register");
 document.querySelector(".auth-confirm-field")?.classList.toggle("hidden", mode !== "reset");
 $("authForgotBtn")?.classList.toggle("hidden", mode !== "login");
 $("authPassword").autocomplete = mode === "register" || mode === "reset" ? "new-password" : "current-password";
 $("authEmail").autocomplete = mode === "login" ? "username email" : "email";
 if (mode === "reset") {
   $("authSwitchText").innerHTML = `Remember it now? <a href="#" data-auth-switch="login">Sign in</a>`;
 } else if (mode === "register") {
   $("authSwitchText").innerHTML = `Already have an account? <a href="#" data-auth-switch="login">Sign in</a>`;
 } else {
   $("authSwitchText").innerHTML = `New here? <a href="#" data-auth-switch="register">Create free account</a>`;
 }
 $("authError").textContent = "";
}

function closeAuthModal() {
 $("authModal")?.classList.add("hidden");
 document.body.classList.remove("modal-open");
}

async function maybeShowDailyLoginNotifications() {
 if (!isLoggedIn()) return;
 if (!shouldShowDailyNotifications(state)) {
 takePendingDailyEvents();
 return;
 }

 const events = takePendingDailyEvents();
 if (!events.length) return;

 await showDailyNotificationQueue(events);
 state = finalizeDailyNotifications(state);
 updateHeaderStats();
 renderProfile();
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
 $("cowPollPanel")?.classList.add("hidden");
 $("cowConversation")?.classList.add("hidden");
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
 $("cowPollPanel")?.classList.remove("hidden");
 $("cowConversation")?.classList.remove("hidden");

 const est = scout?.valuation?.estimate ?? savedEstimate;
 $("cowEstimate").textContent = est != null ? formatUsd(est) : "—";

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
 const visible = filterAndSortCollection(coll, {
   search: collectionSearchQuery,
   sort: collectionSortMode,
 });

 $("collectionTotalValue").textContent = total > 0 ? formatUsd(total) : "—";
 $("collectionSummary").textContent =
 coll.length === 0
 ? "Scout a card, then add it from your scout report."
 : `${valued} of ${coll.length} cards have estimated values`;

 const hint = $("collectionResultsHint");
 if (hint) {
   if (!coll.length) {
     hint.textContent = "";
   } else if (collectionSearchQuery.trim()) {
     hint.textContent = `Showing ${visible.length} of ${coll.length} cards`;
   } else {
     hint.textContent = `${coll.length} card${coll.length === 1 ? "" : "s"} in your collection`;
   }
 }

 const list = $("collectionList");
 if (!coll.length) {
 list.innerHTML = `<div class="empty-collection"><span>📦</span><p>Your collection is empty</p></div>`;
 return;
 }

 if (!visible.length) {
 list.innerHTML = `<div class="empty-collection"><span>🔎</span><p>No cards match your search.</p></div>`;
 return;
 }

 list.innerHTML = visible
 .map((item) => {
 const title = item.card?.title || "Untitled card";
 const tier = item.tier;
 const qty = item.quantity || 1;
 const valueHtml =
   item.estimatedValue != null
     ? qty > 1
       ? `<p class="collection-card-value">${formatUsd(item.estimatedValue * qty)} <span class="collection-qty-note">${formatUsd(item.estimatedValue)} each · ×${qty}</span></p>`
       : `<p class="collection-card-value">${formatUsd(item.estimatedValue)}</p>`
     : `<p class="collection-card-value unpriced">No estimate</p>`;
 return `
 <article class="collection-card" data-id="${escapeHtml(item.id)}">
   <div class="collection-card-image">${collectionImageHtml(item)}</div>
   <div class="collection-card-body">
     <h4>${escapeHtml(title)}</h4>
     ${valueHtml}
     <p class="collection-card-meta">${escapeHtml(collectionImageSourceLabel(item))}${tier ? ` · ${tier.emoji} ${escapeHtml(tier.tier)}` : ""}</p>
   </div>
   <div class="collection-card-actions">
     <button type="button" class="btn-secondary btn-xs" data-action="scout-again" data-id="${escapeHtml(item.id)}">Re-scout</button>
     <button type="button" class="btn-ghost btn-xs" data-action="remove" data-id="${escapeHtml(item.id)}">Remove</button>
   </div>
 </article>
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
 fillScoutWizard($("scoutForm"), item.card);
 });
 });
}

function renderProfile() {
 $("profileName").textContent = state.profile?.displayName || "Scout";
 if ($("profileCoins")) $("profileCoins").textContent = String(getCoins(state));
 if ($("profileCoinsStat")) $("profileCoinsStat").textContent = String(getCoins(state));
 if ($("profileStreakInline")) $("profileStreakInline").textContent = String(state.streak ?? 0);
 $("profileStreak").textContent = state.streak ?? 0;
 if ($("profileFreezes")) $("profileFreezes").textContent = String(state.streakFreezes ?? 0);
 $("profileScouts").textContent = uniqueScoutCount(state);
 if (document.querySelector('[data-view="profile"]')?.classList.contains("active")) {
  updateProfileAvatarMount(state);
 }

 const coll = state.collection || [];
 const total = collectionTotal(state);
 $("profileCollectionValue").textContent = total > 0 ? formatUsd(total) : "—";
 $("profileCardCount").textContent = coll.length;
 $("profileValuedCount").textContent = collectionValuedCount(state);
 void renderPushSettings({
   multiUserEnabled: Boolean(health?.multiUserEnabled),
   pushConfigured: Boolean(health?.pushEnabled),
   pushInitError: health?.pushInitError || null,
   openAuthModal,
 });
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

 const apiSetup = $("apiSetup");
 if (health.ebayConfigured) {
   apiSetup?.removeAttribute("open");
   apiSetup?.classList.add("hidden");
 } else {
   apiSetup?.classList.remove("hidden");
   if (!health.ebayConfigured) apiSetup?.setAttribute("open", "");
 }
 renderAuthUI();
 if (document.querySelector('[data-view="profile"]')?.classList.contains("active")) {
   renderProfile();
 }
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

async function performScout(card) {
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

    const registeredNew = registerUniqueScan(state, card);
    state.lastScout = {
      card: lastScoutCard,
      data: exactData,
      at: new Date().toISOString(),
      isNewScan: registeredNew,
    };
    saveState(state);

    setAddToCollectionAvailable(registeredNew);

    const dupNotice = $("scoutDuplicateNotice");
    if (dupNotice) {
      if (registeredNew) {
        dupNotice.textContent = `+${COINS_PER_UNIQUE_SCAN} coins for a unique scan!`;
        dupNotice.classList.remove("hidden");
      } else {
        dupNotice.textContent =
          "You already scanned this card — only unique cards count toward the leaderboard and coin rewards.";
        dupNotice.classList.remove("hidden");
      }
    }

    handleScoutRewards(state, { isNewScan: registeredNew });
    state = loadState();
    updateHeaderStats();
    renderDashboard();
  } finally {
    scoutBtn.disabled = false;
    btnText.classList.remove("hidden");
    btnLoading.classList.add("hidden");
  }
}

async function handleScoutSubmit(e) {
  e.preventDefault();
  const card = cardFromScoutForm($("scoutForm"));
  const validationError = validateScoutCard(card);
  if (validationError) {
    alert(validationError);
    return;
  }

  try {
    await performScout(card);
  } catch (err) {
    alert(err.message || "Something went wrong");
  }
}

function handleAddToCollection() {
 if (!lastScoutCard) {
 alert("Scout a card first, then add it to your collection.");
 return;
 }
 const estimate = lastScoutData?.valuation?.estimate ?? null;
 const qty = Math.max(1, parseInt($("addCollectionQty")?.value, 10) || 1);
 const result = addToCollection(state, {
 card: lastScoutCard,
 estimatedValue: estimate,
 scoutData: lastScoutData,
 userPhotoUrl: getPendingScoutPhotoUrl(),
 quantity: qty,
 });
 clearPendingScoutPhoto();
 state = loadState();
 updateHeaderStats();
 const btn = $("addToCollectionBtn");
 if (result.merged) {
   btn.textContent = `✓ Now ×${result.quantity} in collection`;
 } else {
   btn.textContent = qty > 1 ? `✓ Added ×${qty} to collection` : "✓ Added to collection";
 }
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
 setAddToCollectionAvailable(state.lastScout.isNewScan !== false);
 if (state.lastScout.card) fillScoutWizard($("scoutForm"), state.lastScout.card);
 } else {
 navigate(target);
 }
 });
 });
}

function initCollectionBrowser() {
 $("collectionSearchInput")?.addEventListener("input", (e) => {
   collectionSearchQuery = e.target.value || "";
   renderCollection();
 });
 $("collectionSortSelect")?.addEventListener("change", (e) => {
   collectionSortMode = e.target.value || "recent";
   renderCollection();
 });
}

function initMobileSessionHeader() {
  window.addEventListener(
    "scroll",
    () => {
      if (!document.body.classList.contains("mobile-signed-in")) return;
      if (window.innerWidth > 768) {
        document.body.classList.remove("mobile-header-hidden");
        return;
      }
      document.body.classList.toggle("mobile-header-hidden", window.scrollY > 40);
    },
    { passive: true }
  );
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
   try {
     await pushLocalToCloud();
   } catch (err) {
     alert(err.message || "Could not save profile to cloud");
     return;
   }
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
 refreshSocialPanels();
 await maybeShowDailyLoginNotifications();
 await syncPendingPushSubscription();
 renderProfile();
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
 $("authForgotBtn")?.addEventListener("click", () => openAuthModal("reset"));

 $("authForm")?.addEventListener("submit", async (e) => {
 e.preventDefault();
 const mode = $("authSubmitBtn")?.dataset.mode || "login";
 const email = $("authEmail").value.trim().toLowerCase();
 const password = $("authPassword").value;
 const confirmPassword = $("authPasswordConfirm")?.value || "";
 const displayName = $("authDisplayName")?.value?.trim();
 $("authError").textContent = "";
 $("authSubmitBtn").disabled = true;
 try {
 const guestState = {
   ...state,
   collection: [...(state.collection || [])],
   profile: { ...state.profile },
   scannedCards: { ...(state.scannedCards || {}) },
 };
 if (mode === "register") {
 await register({ email, password, displayName, guestState });
 } else if (mode === "reset") {
 if (password !== confirmPassword) {
 throw new Error("Passwords do not match");
 }
 await resetPassword({ email, newPassword: password, confirmPassword, guestState });
 } else {
 await login({ email, password, guestState });
 }
 } catch (err) {
 $("authError").textContent = err.message;
 if (mode === "login" && /password/i.test(err.message)) {
   $("authForgotBtn")?.classList.remove("hidden");
 }
 } finally {
 $("authSubmitBtn").disabled = false;
 }
 });

 document.addEventListener("click", (e) => {
 const sw = e.target.closest("[data-auth-switch]");
 if (sw) openAuthModal(sw.dataset.authSwitch);
 });
}

function updateCloudSyncStatus(result, err) {
 const el = $("cloudSyncStatus");
 if (!el) return;
 if (!isLoggedIn()) {
   el.classList.add("hidden");
   return;
 }
 if (err) {
   el.textContent =
     err.status === 401
       ? "Cloud session expired — sign in again to upload your collection."
       : err.message || "Could not save to cloud — check your connection and try Save profile.";
   el.classList.remove("hidden");
   el.classList.add("sync-error");
   return;
 }
 if (result?.cardCount != null) {
   el.textContent = `${result.cardCount} card${result.cardCount === 1 ? "" : "s"} saved to cloud`;
   el.classList.remove("hidden", "sync-error");
 }
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
 const hasScans = uniqueScoutCount(state) > 0;
 const hasContact = Boolean(state.profile?.username?.trim() || state.profile?.phone?.trim());
 if (!hasCards && !optedIn && !hasContact && !hasScans) return false;

 if (cloudPushPromise) return cloudPushPromise;

 cloudPushPromise = (async () => {
   try {
     const result = await pushCloudState(state, { publicLeaderboard: optedIn });
     updateCloudSyncStatus(result);
     await loadCardOfDay();
     await loadLeaderboard();
     return true;
   } catch (err) {
     updateCloudSyncStatus(null, err);
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
 } else {
   state = replaceState(localSnapshot);
   updateHeaderStats();
   renderDashboard();
   renderCollection();
   renderProfile();
 }

 if ((state.collection?.length || 0) > 0 || state.profile?.publicLeaderboard || uniqueScoutCount(state) > 0) {
   await pushLocalToCloud();
 }
}

async function bootstrapSession() {
  await restoreSessionFromServer();
  renderAuthUI();

  if (isLoggedIn()) {
    await reconcileCloudState();
  } else {
    state = replaceState(state);
  }

  renderAuthUI();
  refreshSocialPanels();
  await maybeShowDailyLoginNotifications();
  await syncPendingPushSubscription();
}

async function refreshSocialPanels() {
  await renderProfileSocial(state);
  await renderCodDayEngagement({ openAuthModal });
  await renderCommunityFriends();
  await renderCommunityChat();
}

function setupSessionPersistence() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      scoutPageWasHidden = true;
      return;
    }
    if (document.visibilityState !== "visible") return;

    if (scoutPageWasHidden) {
      scoutPageWasHidden = false;
      resetScoutSession();
    }

    const coinsBefore = getCoins(state);
    state = replaceState(state);
    const dailyChanged = getCoins(state) !== coinsBefore || peekPendingDailyEvents().length > 0;

    if (dailyChanged) {
      updateHeaderStats();
      renderProfile();
      void maybeShowDailyLoginNotifications();
      if (isLoggedIn()) void pushLocalToCloud();
    }
  });

  window.addEventListener("pageshow", (e) => {
    loadStoredSession();
    state = loadState();
    updateHeaderStats();
    renderDashboard();
    renderProfile();
    renderAuthUI();
    if (e.persisted) {
      resetScoutSession();
    }
    if (!isLoggedIn()) return;
    bootstrapSession();
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
 initCommunityFriendsUI({
   openAuthModal,
   openFriendModal,
   refreshFriends: () => renderCommunityFriends(),
 });
 initCodDayUI({
   openAuthModal,
   refreshEngagement: () => renderCodDayEngagement({ openAuthModal }),
 });
 initPushSettingsUI({
   getMultiUserEnabled: () => Boolean(health?.multiUserEnabled),
   getPushConfigured: () => Boolean(health?.pushEnabled),
   openAuthModal,
 });
 initInstallGuideUI({
   onDismissed: () => {
     if (document.querySelector('[data-view="profile"]')?.classList.contains("active")) {
       renderProfile();
     }
   },
 });
 initScoutWizard($("scoutForm"));
 resetScoutSession();
 $("scoutForm").addEventListener("submit", handleScoutSubmit);
 $("addToCollectionBtn").addEventListener("click", handleAddToCollection);
 $("refreshCollectionBtn").addEventListener("click", refreshCollectionValues);
 $("aiEstimateBtn").addEventListener("click", runAiInsights);
 initProfileForm();
 initCollectionBrowser();
 initMobileSessionHeader();

 updateHeaderStats();
 checkHealth().then(async () => {
   renderDashboard();
   loadCardOfDay();
   loadLeaderboard();
   navigate("dashboard");
   await bootstrapSession();
   if (isStandaloneApp()) {
     void maybeShowPushPermissionPrompt({
       multiUserEnabled: Boolean(health?.multiUserEnabled && health?.pushEnabled),
     });
   } else {
     void maybeShowInstallGuide();
   }
 });
}

init();
