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
  $("authNameField")?.classList.toggle("hidden", mode !== "register");
  $("authUsernameField")?.classList.toggle("hidden", mode !== "register");
  $("authSwitchText").innerHTML =
    mode === "register"
      ? `Already have an account? <a href="#" data-auth-switch="login">Sign in</a>`
      : `New here? <a href="#" data-auth-switch="register">Create account</a>`;
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
  await mountGame({ onAuthRequired: () => openAuthModal("login") });
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
    const displayName = $("authDisplayName")?.value.trim();
    const username = $("authUsername")?.value.trim();
    $("authError").textContent = "";
    try {
      if (mode === "register") {
        await register({ email, password, displayName, username });
      } else {
        await login({ email, password });
      }
      closeAuthModal();
    } catch (err) {
      $("authError").textContent = err.message || "Auth failed";
    }
  });

  document.body.addEventListener("click", (e) => {
    const link = e.target.closest("[data-auth-switch]");
    if (link) {
      e.preventDefault();
      openAuthModal(link.dataset.authSwitch);
    }
  });
}

init();
