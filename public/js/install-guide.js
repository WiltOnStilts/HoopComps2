/** Home Screen install guide — first visit modal + Profile fallback */

import { isStandaloneApp } from "./pwa.js";

const INSTALL_GUIDE_KEY = "hoopInstallGuideV2";
const LEGACY_INSTALL_GUIDE_KEYS = ["hoopInstallGuideV1"];

function clearLegacyInstallGuideKeys() {
  for (const key of LEGACY_INSTALL_GUIDE_KEYS) {
    localStorage.removeItem(key);
  }
}

clearLegacyInstallGuideKeys();

function $(id) {
  return document.getElementById(id);
}

export function isMobileInstallTarget() {
  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && window.innerWidth < 900)
  );
}

function isIosDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent);
}

export function hasDeclinedInstallGuide() {
  return localStorage.getItem(INSTALL_GUIDE_KEY) === "dismissed";
}

export function shouldShowInstallGuideInProfile() {
  return isMobileInstallTarget() && !isStandaloneApp();
}

export function shouldOfferInstallGuideOnFirstVisit() {
  return (
    isMobileInstallTarget() &&
    !isStandaloneApp() &&
    !localStorage.getItem(INSTALL_GUIDE_KEY)
  );
}

function installStepsMarkup() {
  if (isIosDevice()) {
    return `
      <ol class="install-guide-steps">
        <li>Tap the <strong>Share</strong> button in Safari (square with an arrow pointing up).</li>
        <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
        <li>Tap <strong>Add</strong> in the top corner.</li>
        <li>Open <strong>HoopComps</strong> from your home screen.</li>
      </ol>
    `;
  }
  if (isAndroidDevice()) {
    return `
      <ol class="install-guide-steps">
        <li>Tap the <strong>menu</strong> (⋮) in Chrome, or Share in other browsers.</li>
        <li>Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.</li>
        <li>Confirm to add HoopComps to your home screen.</li>
        <li>Open <strong>HoopComps</strong> from your home screen.</li>
      </ol>
    `;
  }
  return `
    <ol class="install-guide-steps">
      <li>Use your browser menu to <strong>Add to Home Screen</strong> or <strong>Install</strong>.</li>
      <li>Open HoopComps from your home screen for the best experience.</li>
    </ol>
  `;
}

function ensureInstallGuideModal() {
  let modal = document.getElementById("installGuideModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "installGuideModal";
  modal.className = "listing-modal install-guide-modal hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-panel install-guide-panel">
      <div class="install-guide-icon" aria-hidden="true">📲</div>
      <h2>Add HoopComps to your home screen</h2>
      <p class="hint install-guide-lead">Install the app for faster access, streak reminders, and Card of the Day alerts.</p>
      <div id="installGuideModalSteps"></div>
      <p class="muted-text install-guide-note">After installing, open HoopComps from your home screen — we'll ask about notifications there.</p>
      <div class="install-guide-actions">
        <button type="button" class="btn-scout" id="installGuideModalOk">Got it</button>
        <button type="button" class="btn-secondary" id="installGuideModalDismiss">Not now</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function closeInstallGuideModal() {
  $("installGuideModal")?.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

export function markInstallGuideDismissed() {
  localStorage.setItem(INSTALL_GUIDE_KEY, "dismissed");
  onInstallGuideDismissed?.();
}

function markInstallGuideSeen() {
  if (!localStorage.getItem(INSTALL_GUIDE_KEY)) {
    localStorage.setItem(INSTALL_GUIDE_KEY, "seen");
  }
}

export function markInstalledFromStandalone() {
  localStorage.setItem(INSTALL_GUIDE_KEY, "installed");
}

export function showInstallGuideModal() {
  return new Promise((resolve) => {
    const modal = ensureInstallGuideModal();
    const stepsEl = modal.querySelector("#installGuideModalSteps");
    if (stepsEl) stepsEl.innerHTML = installStepsMarkup();

    const okBtn = modal.querySelector("#installGuideModalOk");
    const dismissBtn = modal.querySelector("#installGuideModalDismiss");
    const backdrop = modal.querySelector(".modal-backdrop");

    const finish = (decision) => {
      okBtn?.removeEventListener("click", onOk);
      dismissBtn?.removeEventListener("click", onDismiss);
      backdrop?.removeEventListener("click", onDismiss);
      closeInstallGuideModal();
      resolve(decision);
    };

    const onOk = () => void finish("ok");
    const onDismiss = () => void finish("dismiss");

    okBtn?.addEventListener("click", onOk);
    dismissBtn?.addEventListener("click", onDismiss);
    backdrop?.addEventListener("click", onDismiss);

    document.body.classList.add("modal-open");
    modal.classList.remove("hidden");
  });
}

let installGuideInFlight = false;
let onInstallGuideDismissed = null;

export async function maybeShowInstallGuide() {
  if (!shouldOfferInstallGuideOnFirstVisit()) return;

  if (installGuideInFlight) return;
  installGuideInFlight = true;

  try {
    const decision = await showInstallGuideModal();
    if (decision === "dismiss") {
      markInstallGuideDismissed();
    } else {
      markInstallGuideSeen();
    }
  } finally {
    installGuideInFlight = false;
  }
}

export function renderInstallGuideProfile() {
  const panel = $("pushSettingsPanel");
  const title = $("profileSetupTitle");
  const hint = $("pushSettingsHint");
  const status = $("pushSettingsStatus");
  const stepsWrap = $("installGuideProfileSteps");
  const pushBtn = $("enablePushBtn");
  if (!panel) return;

  panel.classList.remove("hidden");
  if (title) title.textContent = "Add to Home Screen";
  if (hint) {
    hint.textContent = "Install HoopComps on your phone for the full app experience.";
  }
  if (status) {
    status.textContent = "Follow these steps, then open HoopComps from your home screen.";
  }
  if (stepsWrap) {
    stepsWrap.innerHTML = installStepsMarkup();
    stepsWrap.classList.remove("hidden");
  }
  if (pushBtn) {
    pushBtn.classList.add("hidden");
    pushBtn.disabled = true;
  }

  const profileBtn = $("profileInstallGuideBtn");
  if (profileBtn) {
    profileBtn.classList.remove("hidden");
    profileBtn.disabled = false;
    profileBtn.textContent = "Show steps again";
  }
}

export function hideInstallGuideProfile() {
  const stepsWrap = $("installGuideProfileSteps");
  const pushBtn = $("enablePushBtn");
  const profileBtn = $("profileInstallGuideBtn");
  const title = $("profileSetupTitle");

  stepsWrap?.classList.add("hidden");
  if (stepsWrap) stepsWrap.innerHTML = "";
  pushBtn?.classList.remove("hidden");
  profileBtn?.classList.add("hidden");
  if (title) title.textContent = "Notifications";
}

export function initInstallGuideUI({ onDismissed } = {}) {
  onInstallGuideDismissed = onDismissed ?? null;
  $("profileInstallGuideBtn")?.addEventListener("click", () => {
    void showInstallGuideModal();
  });
}
