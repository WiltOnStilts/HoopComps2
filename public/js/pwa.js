let deferredPrompt = null;
let swReloadTriggered = false;

export function initPwa() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              reg.waiting?.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        setInterval(() => reg.update(), 60 * 60 * 1000);
      })
      .catch(() => {});

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (swReloadTriggered) return;
      swReloadTriggered = true;
      window.location.reload();
    });
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
