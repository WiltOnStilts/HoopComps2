let deferredPrompt = null;

export function initPwa() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  document.getElementById("installAppBtn")?.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    hideInstallBanner();
  });

  document.getElementById("dismissInstallBtn")?.addEventListener("click", hideInstallBanner);
}

function showInstallBanner() {
  document.getElementById("installBanner")?.classList.remove("hidden");
}

function hideInstallBanner() {
  document.getElementById("installBanner")?.classList.add("hidden");
}
