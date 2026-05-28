/** Web Push — first-visit permission prompt + subscription sync */

import { authFetch, isLoggedIn } from "./auth.js";

const PROMPT_KEY = "hoopPushPromptV1";
const PENDING_SUB_KEY = "hoopPendingPushSub";

function supportsPush() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "PushManager" in window &&
    "serviceWorker" in navigator
  );
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
      <p class="muted-text push-prompt-note">You can change this later in your browser or device settings.</p>
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
  if (!supportsPush() || !multiUserEnabled) return;
  if (localStorage.getItem(PROMPT_KEY)) {
    if (localStorage.getItem(PROMPT_KEY) === "granted") {
      await ensurePushSubscription();
    }
    return;
  }
  if (promptInFlight) return;
  promptInFlight = true;

  try {
    const decision = await showPushPromptModal();
    if (decision === "deny") {
      localStorage.setItem(PROMPT_KEY, "denied");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      localStorage.setItem(PROMPT_KEY, "granted");
      await ensurePushSubscription();
    } else {
      localStorage.setItem(PROMPT_KEY, "denied");
    }
  } finally {
    promptInFlight = false;
  }
}
