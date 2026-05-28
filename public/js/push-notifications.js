/** Web Push — subscription sync + notification prompts (standalone app only) */

import { authFetch, isLoggedIn } from "./auth.js";
import { isStandaloneApp } from "./pwa.js";
import {
  shouldShowInstallGuideInProfile,
  renderInstallGuideProfile,
  hideInstallGuideProfile,
  markInstalledFromStandalone,
  showInstallGuideModal,
  markInstallGuideDismissed,
} from "./install-guide.js";

const PROMPT_KEY = "hoopPushPromptV2";
const STANDALONE_PROMPT_KEY = "hoopPushPromptStandaloneV2";
const PENDING_SUB_KEY = "hoopPendingPushSub";
const LEGACY_PROMPT_KEYS = ["hoopPushPromptV1", "hoopPushPromptStandaloneV1"];

function clearLegacyPromptKeys() {
  for (const key of LEGACY_PROMPT_KEYS) {
    localStorage.removeItem(key);
  }
}

clearLegacyPromptKeys();

function $(id) {
  return document.getElementById(id);
}

function supportsPush() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "PushManager" in window &&
    "serviceWorker" in navigator
  );
}

function isIosDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Why push may be unavailable — null means ready to enable. */
export function getPushBlockReason() {
  if (isIosDevice() && !isStandaloneApp()) return "ios_needs_install";
  if (!("Notification" in window)) return "unsupported";
  if (!("serviceWorker" in navigator)) return "unsupported";
  if (!("PushManager" in window)) return "unsupported";
  return null;
}

function showIosInstallHelp() {
  void showInstallGuideModal().then((decision) => {
    if (decision === "dismiss") markInstallGuideDismissed();
  });
}

export function getTimezoneOffsetMinutes() {
  return -new Date().getTimezoneOffset();
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

function subscriptionToJson(subscription) {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint,
    keys: json.keys,
  };
}

async function fetchVapidPublicKey() {
  const res = await fetch("/api/push/vapid-public-key");
  const data = await res.json();
  if (!res.ok || !data.publicKey) throw new Error(data.error || "Push is unavailable");
  return data.publicKey;
}

async function waitForServiceWorkerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.ready;
}

export async function ensurePushSubscription() {
  if (!supportsPush()) return false;
  if (Notification.permission !== "granted") return false;

  try {
    const registration = await waitForServiceWorkerRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const publicKey = await fetchVapidPublicKey();
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const payload = subscriptionToJson(subscription);
    if (!isLoggedIn()) {
      localStorage.setItem(PENDING_SUB_KEY, JSON.stringify(payload));
      return true;
    }

    await authFetch("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({
        subscription: payload,
        timezoneOffsetMinutes: getTimezoneOffsetMinutes(),
      }),
    });
    localStorage.removeItem(PENDING_SUB_KEY);
    return true;
  } catch {
    return false;
  }
}

export async function syncPendingPushSubscription() {
  if (!supportsPush() || Notification.permission !== "granted" || !isLoggedIn()) return;
  const pending = localStorage.getItem(PENDING_SUB_KEY);
  if (pending) {
    try {
      await authFetch("/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          subscription: JSON.parse(pending),
          timezoneOffsetMinutes: getTimezoneOffsetMinutes(),
        }),
      });
      localStorage.removeItem(PENDING_SUB_KEY);
      return;
    } catch {
      /* fall through to ensure */
    }
  }
  await ensurePushSubscription();
}

function ensurePromptModal() {
  let modal = document.getElementById("pushPromptModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "pushPromptModal";
  modal.className = "listing-modal push-prompt-modal hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-panel push-prompt-panel">
      <div class="push-prompt-icon" aria-hidden="true">🔔</div>
      <h2>Allow notifications?</h2>
      <p class="hint push-prompt-copy">
        Get reminders to keep your streak, alerts when your card is featured, and friend updates — like a text, but from HoopComps.
      </p>
      <p class="muted-text push-prompt-note">You can also turn these on anytime from Profile.</p>
      <div class="push-prompt-actions">
        <button type="button" class="btn-scout" id="pushPromptAllow">Allow</button>
        <button type="button" class="btn-secondary" id="pushPromptDeny">Not now</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function closePushPromptModal() {
  document.getElementById("pushPromptModal")?.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function showPushPromptModal() {
  return new Promise((resolve) => {
    const modal = ensurePromptModal();
    const allowBtn = modal.querySelector("#pushPromptAllow");
    const denyBtn = modal.querySelector("#pushPromptDeny");
    const backdrop = modal.querySelector(".modal-backdrop");

    const finish = (decision) => {
      allowBtn?.removeEventListener("click", onAllow);
      denyBtn?.removeEventListener("click", onDeny);
      backdrop?.removeEventListener("click", onDeny);
      closePushPromptModal();
      resolve(decision);
    };

    const onAllow = () => void finish("allow");
    const onDeny = () => void finish("deny");

    allowBtn?.addEventListener("click", onAllow);
    denyBtn?.addEventListener("click", onDeny);
    backdrop?.addEventListener("click", onDeny);

    document.body.classList.add("modal-open");
    modal.classList.remove("hidden");
  });
}

let promptInFlight = false;

export async function maybeShowPushPermissionPrompt({ multiUserEnabled = true } = {}) {
  if (!isStandaloneApp()) return;
  if (!supportsPush() || !multiUserEnabled) return;

  markInstalledFromStandalone();

  if (Notification.permission === "granted") {
    localStorage.setItem(PROMPT_KEY, "granted");
    localStorage.setItem(STANDALONE_PROMPT_KEY, "granted");
    await ensurePushSubscription();
    return;
  }
  if (Notification.permission === "denied") {
    localStorage.setItem(PROMPT_KEY, "denied");
    localStorage.setItem(STANDALONE_PROMPT_KEY, "denied");
    return;
  }

  if (localStorage.getItem(STANDALONE_PROMPT_KEY)) return;
  if (promptInFlight) return;
  promptInFlight = true;

  try {
    const decision = await showPushPromptModal();
    if (decision === "deny") {
      localStorage.setItem(STANDALONE_PROMPT_KEY, "denied");
      localStorage.setItem(PROMPT_KEY, "denied");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      localStorage.setItem(STANDALONE_PROMPT_KEY, "granted");
      localStorage.setItem(PROMPT_KEY, "granted");
      await ensurePushSubscription();
    } else {
      localStorage.setItem(STANDALONE_PROMPT_KEY, "denied");
      localStorage.setItem(PROMPT_KEY, "denied");
    }
  } finally {
    promptInFlight = false;
  }
}

export function supportsPushNotifications() {
  return supportsPush();
}

async function hasLocalPushSubscription() {
  if (!supportsPush() || Notification.permission !== "granted") return false;
  try {
    const registration = await waitForServiceWorkerRegistration();
    const subscription = await registration.pushManager.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
}

export async function requestPushNotifications({ multiUserEnabled = true, pushConfigured = true } = {}) {
  const blockReason = getPushBlockReason();
  if (blockReason === "ios_needs_install") {
    showIosInstallHelp();
    throw new Error("Add HoopComps to your Home Screen first, then enable notifications.");
  }
  if (blockReason) {
    throw new Error("This browser does not support notifications.");
  }
  if (!multiUserEnabled) {
    throw new Error("Notifications are not available right now. Try again in a moment.");
  }
  if (!pushConfigured) {
    throw new Error("Push notifications are not configured on the server yet.");
  }
  if (!isLoggedIn()) {
    throw new Error("Sign in first to enable notifications on this device.");
  }
  if (Notification.permission === "denied") {
    throw new Error(
      "Notifications are blocked in your browser settings. Open your device settings and allow notifications for HoopComps."
    );
  }

  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      localStorage.setItem(PROMPT_KEY, "denied");
      throw new Error("Notifications were not allowed.");
    }
  }

  localStorage.setItem(PROMPT_KEY, "granted");
  const ok = await ensurePushSubscription();
  if (!ok) {
    throw new Error("Could not register this device for notifications.");
  }
  return true;
}

export async function renderPushSettings({
  multiUserEnabled = true,
  pushConfigured = true,
  openAuthModal,
} = {}) {
  const panel = $("pushSettingsPanel");
  const hint = $("pushSettingsHint");
  const status = $("pushSettingsStatus");
  const btn = $("enablePushBtn");
  if (!panel || !btn) return;

  if (shouldShowInstallGuideInProfile()) {
    renderInstallGuideProfile();
    return;
  }

  hideInstallGuideProfile();
  panel.classList.remove("hidden");

  const blockReason = getPushBlockReason();
  if (blockReason === "ios_needs_install") {
    if (hint) {
      hint.textContent = "On iPhone, notifications work from the app on your Home Screen.";
    }
    if (status) {
      status.textContent =
        'In Safari tap Share → "Add to Home Screen", open HoopComps from your home screen, then enable notifications here.';
    }
    btn.disabled = false;
    btn.textContent = "How to enable on iPhone";
    return;
  }

  if (blockReason) {
    if (hint) hint.textContent = "Push notifications are not supported in this browser.";
    if (status) {
      status.textContent = "Try installing HoopComps on your Home Screen or use Chrome on Android.";
    }
    btn.disabled = true;
    btn.textContent = "Enable notifications";
    return;
  }

  if (!multiUserEnabled) {
    if (hint) {
      hint.textContent = "Notifications will be available once the server finishes connecting.";
    }
    if (status) status.textContent = "";
    btn.disabled = true;
    btn.textContent = "Enable notifications";
    return;
  }

  if (!pushConfigured) {
    if (hint) hint.textContent = "Get streak reminders, Card of the Day alerts, and friend updates on your phone.";
    if (status) status.textContent = "Server push is not configured yet — check back soon.";
    btn.disabled = true;
    btn.textContent = "Enable notifications";
    return;
  }

  if (hint) {
    hint.textContent =
      "Get streak reminders, Card of the Day alerts, and friend updates on your phone.";
  }

  if (!isLoggedIn()) {
    if (status) status.textContent = "Sign in to enable notifications on this device.";
    btn.disabled = false;
    btn.textContent = "Sign in to enable";
    return;
  }

  if (Notification.permission === "denied") {
    if (status) {
      status.textContent =
        "Notifications are blocked. Allow HoopComps in your browser or device notification settings, then tap below to try again.";
    }
    btn.disabled = false;
    btn.textContent = "Try again";
    return;
  }

  const subscribed = await hasLocalPushSubscription();
  if (Notification.permission === "granted" && subscribed) {
    if (status) status.textContent = "Notifications are enabled on this device.";
    btn.disabled = false;
    btn.textContent = "Refresh notifications";
    return;
  }

  if (status) {
    status.textContent = Notification.permission === "granted"
      ? "Permission granted — tap below to finish setup."
      : "Enable alerts for streaks, Card of the Day, and friends.";
  }
  btn.disabled = false;
  btn.textContent = "Enable notifications";
}

let pushSettingsBound = false;

export function initPushSettingsUI({ getMultiUserEnabled, getPushConfigured, openAuthModal } = {}) {
  if (pushSettingsBound) return;
  pushSettingsBound = true;

  $("enablePushBtn")?.addEventListener("click", async () => {
    const btn = $("enablePushBtn");

    if (getPushBlockReason() === "ios_needs_install") {
      showIosInstallHelp();
      return;
    }

    if (!supportsPush()) return;

    if (!isLoggedIn()) {
      openAuthModal?.("login");
      return;
    }

    if (btn) btn.disabled = true;
    try {
      await requestPushNotifications({
        multiUserEnabled: getMultiUserEnabled?.() ?? true,
        pushConfigured: getPushConfigured?.() ?? true,
      });
      await renderPushSettings({
        multiUserEnabled: getMultiUserEnabled?.() ?? true,
        pushConfigured: getPushConfigured?.() ?? true,
        openAuthModal,
      });
    } catch (err) {
      if (err.message) alert(err.message);
      await renderPushSettings({
        multiUserEnabled: getMultiUserEnabled?.() ?? true,
        pushConfigured: getPushConfigured?.() ?? true,
        openAuthModal,
      });
    } finally {
      if (btn && btn.textContent !== "Refresh notifications") {
        btn.disabled = false;
      }
    }
  });
}
