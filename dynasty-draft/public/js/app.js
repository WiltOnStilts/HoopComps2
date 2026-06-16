import {
  loadStoredSession,
  restoreSessionFromServer,
  isLoggedIn,
  getCurrentUser,
  register,
  login,
  logout,
  setAuthChangeHandler,
} from "./auth.js";
import { mountGame, syncTopBar } from "./game-ui.js";

function $(id) {
  return document.getElementById(id);
}

function openAuthModal(mode = "login") {
  $("authModal")?.classList.remove("hidden");
  document.body.classList.add("modal-open");
  $("authModalTitle").textContent = mode === "register" ? "Create account" : "Sign in";
  $("authSubmitBtn").dataset.mode = mode;
  $("authUsernameField")?.classList.toggle("hidden", mode !== "register");
  $("authSwitchText").innerHTML =
    mode === "register"
      ? `<button type="button" class="btn-secondary auth-switch-btn" data-auth-switch="login">Already have an account? Sign in</button>`
      : `<button type="button" class="btn-secondary auth-switch-btn" data-auth-switch="register">New here? Create account</button>`;
  const pw = $("authPassword");
  if (pw) pw.autocomplete = mode === "register" ? "new-password" : "current-password";
  $("authError").textContent = "";
}

function closeAuthModal() {
  $("authModal")?.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function renderAuthUI() {
  const user = getCurrentUser();
  const pill = $("authStatusPill");
  const btn = $("authHeaderBtn");
  if (!pill || !btn) return;

  if (user) {
    pill.textContent = user.displayName || user.username || "Player";
    pill.classList.remove("hidden");
    btn.textContent = "Sign out";
    btn.dataset.action = "logout";
  } else {
    pill.classList.add("hidden");
    btn.textContent = "Sign in";
    btn.dataset.action = "login";
  }
}

async function refreshGame() {
  await mountGame({ onAuthRequired: (mode) => openAuthModal(mode || "login") });
  syncTopBar();
}

async function init() {
  loadStoredSession();
  await restoreSessionFromServer();
  renderAuthUI();
  await refreshGame();

  setAuthChangeHandler(() => {
    renderAuthUI();
    void refreshGame();
  });

  $("authHeaderBtn")?.addEventListener("click", async () => {
    if ($("authHeaderBtn").dataset.action === "logout") {
      await logout();
      return;
    }
    openAuthModal("login");
  });

  $("authModalClose")?.addEventListener("click", closeAuthModal);
  $("authModalBackdrop")?.addEventListener("click", closeAuthModal);

  $("authForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const mode = $("authSubmitBtn").dataset.mode || "login";
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    const username = $("authUsername")?.value.trim();
    $("authError").textContent = "";
    try {
      if (mode === "register") {
        await register({ email, password, username });
      } else {
        await login({ email, password });
      }
      closeAuthModal();
    } catch (err) {
      $("authError").textContent = err.message || "Auth failed";
    }
  });

  document.body.addEventListener("click", (e) => {
    const switcher = e.target.closest("[data-auth-switch]");
    if (switcher) {
      e.preventDefault();
      openAuthModal(switcher.dataset.authSwitch);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void restoreSessionFromServer().then((user) => {
        if (user) renderAuthUI();
      });
    }
  });
}

init();
