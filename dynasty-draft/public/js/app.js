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
  $("authSubmitBtn").textContent = mode === "register" ? "Create account" : "Sign in";
  $("authSubmitBtn").disabled = false;

  const usernameField = $("authUsernameField");
  const usernameInput = $("authUsername");
  const isRegister = mode === "register";
  usernameField?.classList.toggle("hidden", !isRegister);
  if (usernameInput) {
    usernameInput.required = isRegister;
    usernameInput.disabled = !isRegister;
    if (!isRegister) usernameInput.value = "";
  }

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
  renderAuthUI();
  try {
    await restoreSessionFromServer();
    renderAuthUI();
    await refreshGame();
  } catch (err) {
    console.error("DynastyDraft init failed:", err);
    const root = $("gameRoot");
    if (root) {
      root.innerHTML = `<div class="dyn-error-card"><h2>Could not load game</h2><p>${err?.message || "Something went wrong."}</p><button type="button" class="btn-primary" onclick="location.reload()">Reload</button></div>`;
    }
  }

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
    const submitBtn = $("authSubmitBtn");
    $("authError").textContent = "";

    if (!email) {
      $("authError").textContent = "Email is required";
      return;
    }
    if (!password || password.length < 6) {
      $("authError").textContent = "Password must be at least 6 characters";
      return;
    }
    if (mode === "register" && !username) {
      $("authError").textContent = "Username is required";
      return;
    }

    const prevLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = mode === "register" ? "Creating account…" : "Signing in…";
    try {
      if (mode === "register") {
        await register({ email, password, username });
      } else {
        await login({ email, password });
      }
      closeAuthModal();
    } catch (err) {
      $("authError").textContent = err.message || "Auth failed";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = prevLabel;
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
      void restoreSessionFromServer().then(() => {
        renderAuthUI();
      });
    }
  });

  window.addEventListener("online", () => {
    void restoreSessionFromServer().then(() => {
      renderAuthUI();
    });
  });
}

init();
