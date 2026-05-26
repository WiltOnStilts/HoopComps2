/** Step-by-step scout form — one card detail at a time */

import { buildCardTitle } from "./card-title.js";
import { formToCard } from "./scout-ui.js";

const STEPS = [
  {
    key: "player",
    label: "Player",
    required: true,
    placeholder: "Luka Dončić",
    inputType: "text",
    info: "The athlete on the front of the card — usually in large print. Use the full name as it appears on the card.",
  },
  {
    key: "year",
    label: "Year",
    required: false,
    placeholder: "2018",
    inputType: "text",
    info: "The season or copyright year, often on the back near the bottom. Example: 2018 for 2018-19 Prizm.",
  },
  {
    key: "set",
    label: "Set",
    required: false,
    placeholder: "Panini Prizm",
    inputType: "text",
    info: "The product line or brand — look on the back. Examples: Panini Prizm, Topps Chrome, Donruss Optic.",
  },
  {
    key: "cardNumber",
    label: "Card #",
    required: false,
    placeholder: "280",
    inputType: "text",
    info: "The card number within the set, usually on the back (e.g. #280). Helps match the exact base card.",
  },
  {
    key: "parallel",
    label: "Parallel",
    required: false,
    placeholder: "Silver Prizm",
    inputType: "text",
    info: "The foil, color, or special version — not every card has one. Examples: Silver, Gold Prizm, Mojo. Leave blank for base.",
  },
  {
    key: "serial",
    label: "Serial",
    required: false,
    placeholder: "/99",
    inputType: "text",
    info: "Numbered cards show how many were made, like /99 or /10. Only fill in if your card is serial-numbered.",
  },
  {
    key: "gradingCompany",
    label: "Grading",
    required: false,
    inputType: "select",
    options: [
      { value: "", label: "Raw (ungraded)" },
      { value: "PSA", label: "PSA" },
      { value: "BGS", label: "BGS" },
      { value: "SGC", label: "SGC" },
      { value: "CGC", label: "CGC" },
    ],
    info: "If the card is in a graded slab, pick the company. Choose Raw if it's in a sleeve or toploader.",
  },
  {
    key: "grade",
    label: "Grade",
    required: false,
    placeholder: "10",
    inputType: "text",
    skipIfRaw: true,
    info: "The numeric grade on the slab — PSA 10, BGS 9.5, etc. Skip for raw cards.",
  },
  {
    key: "certNumber",
    label: "Cert #",
    required: false,
    placeholder: "12345678",
    inputType: "text",
    skipIfRaw: true,
    info: "Certification number on the graded slab. Optional — useful for verify links.",
  },
  {
    key: "notes",
    label: "Notes",
    required: false,
    placeholder: "RC, Auto, Patch",
    inputType: "text",
    info: "Extra keywords buyers use on eBay: RC (rookie), Auto, Patch, SSP. Helps narrow exact comps.",
  },
];

let formEl = null;
let stepIndex = 0;
let activeSteps = [...STEPS];
let pendingScoutPhotoUrl = null;

function readPhotoFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read photo"));
    reader.readAsDataURL(file);
  });
}

function compressPhotoDataUrl(dataUrl, maxWidth = 960) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(img.width, 1));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Could not process photo"));
    img.src = dataUrl;
  });
}

export function getPendingScoutPhotoUrl() {
  return pendingScoutPhotoUrl;
}

export function clearPendingScoutPhoto() {
  pendingScoutPhotoUrl = null;
  const preview = document.getElementById("scoutPhotoPreview");
  const input = document.getElementById("scoutPhotoInput");
  const clearBtn = document.getElementById("scoutPhotoClear");
  if (input) input.value = "";
  if (preview) {
    preview.removeAttribute("src");
    preview.classList.add("hidden");
  }
  clearBtn?.classList.add("hidden");
}

async function handleScoutPhotoSelected(file) {
  if (!file?.type?.startsWith("image/")) {
    alert("Choose a photo image file.");
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    alert("Photo is too large — try another picture under 12 MB.");
    return;
  }
  try {
    const raw = await readPhotoFile(file);
    pendingScoutPhotoUrl = await compressPhotoDataUrl(raw);
    const preview = document.getElementById("scoutPhotoPreview");
    const clearBtn = document.getElementById("scoutPhotoClear");
    if (preview) {
      preview.src = pendingScoutPhotoUrl;
      preview.classList.remove("hidden");
    }
    clearBtn?.classList.remove("hidden");
  } catch (err) {
    alert(err.message || "Could not use that photo");
  }
}

function wireScoutPhotoControls() {
  document.getElementById("scoutPhotoInput")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) void handleScoutPhotoSelected(file);
  });
  document.getElementById("scoutPhotoClear")?.addEventListener("click", () => {
    clearPendingScoutPhoto();
  });
}

function isRaw(values) {
  return !values.gradingCompany?.trim();
}

function computeActiveSteps(values) {
  if (isRaw(values)) {
    return STEPS.filter((s) => !s.skipIfRaw);
  }
  return [...STEPS];
}

function getValues() {
  if (!formEl) return {};
  return formToCard(formEl);
}

function syncBuiltTitle() {
  const values = getValues();
  const built = buildCardTitle(values);
  const title = built || values.title?.trim() || "";
  const hidden = formEl?.elements.namedItem("title");
  if (hidden) hidden.value = title;
  const preview = document.getElementById("scoutReviewQuery");
  if (preview) {
    preview.textContent = title || "Add at least a player name to build your search.";
  }
}

function renderProgress() {
  const el = document.getElementById("scoutWizardProgress");
  if (!el) return;
  const isReview = stepIndex >= activeSteps.length;
  const displayStep = isReview ? activeSteps.length : stepIndex + 1;
  const total = activeSteps.length + 1;
  el.textContent = isReview ? "Review & scout" : `Step ${displayStep} of ${total - 1}`;
}

function showStep(index) {
  const values = getValues();
  activeSteps = computeActiveSteps(values);
  if (index > activeSteps.length) index = activeSteps.length;
  if (index < 0) index = 0;
  stepIndex = index;

  const reviewEl = document.getElementById("scoutWizardReview");
  const onReview = stepIndex >= activeSteps.length;
  const currentKey = onReview ? null : activeSteps[stepIndex]?.key;

  formEl?.querySelectorAll("[data-scout-step]").forEach((el) => {
    if (el.dataset.scoutStep === "review") {
      el.classList.toggle("hidden", !onReview);
      return;
    }
    el.classList.toggle("hidden", el.dataset.scoutStep !== currentKey);
  });

  const backBtn = document.getElementById("scoutWizardBack");
  const nextBtn = document.getElementById("scoutWizardNext");
  const skipBtn = document.getElementById("scoutWizardSkip");
  const submitBtn = document.getElementById("scoutBtn");

  backBtn?.classList.toggle("hidden", stepIndex === 0);
  nextBtn?.classList.toggle("hidden", onReview);
  skipBtn?.classList.toggle("hidden", onReview || activeSteps[stepIndex]?.required);
  submitBtn?.classList.toggle("hidden", !onReview);

  if (onReview) syncBuiltTitle();
  else {
    const step = activeSteps[stepIndex];
    const input = formEl?.elements.namedItem(step?.key);
    if (input && step?.inputType !== "select") {
      requestAnimationFrame(() => input.focus());
    }
  }

  renderProgress();
}

function validateCurrentStep() {
  const step = activeSteps[stepIndex];
  if (!step?.required) return true;
  const input = formEl?.elements.namedItem(step.key);
  const val = input?.value?.trim();
  if (!val) {
    alert(`${step.label} is required — add it to scout this card.`);
    input?.focus();
    return false;
  }
  return true;
}

function goNext() {
  if (!validateCurrentStep()) return;
  const values = getValues();
  activeSteps = computeActiveSteps(values);
  if (stepIndex >= activeSteps.length) return;
  showStep(stepIndex + 1);
}

function goBack() {
  if (stepIndex <= 0) return;
  showStep(stepIndex - 1);
}

function goSkip() {
  const step = activeSteps[stepIndex];
  const input = formEl?.elements.namedItem(step?.key);
  if (input) input.value = "";
  goNext();
}

function toggleInfo(btn) {
  const panel = btn.closest(".scout-wizard-step")?.querySelector(".scout-field-info");
  if (!panel) return;
  const open = !panel.classList.contains("hidden");
  formEl?.querySelectorAll(".scout-field-info").forEach((p) => p.classList.add("hidden"));
  formEl?.querySelectorAll(".field-info-btn").forEach((b) => b.setAttribute("aria-expanded", "false"));
  if (!open) {
    panel.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
  }
}

function buildStepHtml(step) {
  const inputHtml =
    step.inputType === "select"
      ? `<select name="${step.key}" id="scoutInput_${step.key}" class="scout-wizard-input">
          ${step.options
            .map((o) => `<option value="${o.value}">${o.label}</option>`)
            .join("")}
        </select>`
      : `<input
          type="text"
          name="${step.key}"
          id="scoutInput_${step.key}"
          class="scout-wizard-input"
          placeholder="${step.placeholder || ""}"
          autocomplete="off"
        />`;

  return `
    <div class="scout-wizard-step hidden" data-scout-step="${step.key}">
      <div class="scout-field-head">
        <label class="scout-field-label" for="scoutInput_${step.key}">
          ${step.label}${step.required ? ' <span class="req">*</span>' : ""}
        </label>
        <button
          type="button"
          class="field-info-btn"
          aria-label="What is ${step.label}?"
          aria-expanded="false"
          data-info-toggle
        >i</button>
      </div>
      <p class="scout-field-info hidden">${step.info}</p>
      ${inputHtml}
      ${step.placeholder ? `<p class="scout-field-example">Example: ${step.placeholder}</p>` : ""}
    </div>
  `;
}

export function initScoutWizard(form) {
  if (!form) return;
  formEl = form;

  const mount = document.getElementById("scoutWizardMount");
  if (!mount) return;

  mount.innerHTML = `
    <div class="scout-wizard-progress" id="scoutWizardProgress"></div>
    <div class="scout-wizard-steps">
      ${STEPS.map((step) => buildStepHtml(step)).join("")}
      <div class="scout-wizard-step scout-wizard-review hidden" id="scoutWizardReview" data-scout-step="review">
        <h3 class="scout-review-heading">Ready to scout</h3>
        <p class="scout-review-intro">We'll search eBay for exact matches using the details you entered:</p>
        <p class="scout-review-query" id="scoutReviewQuery"></p>
        <div class="scout-photo-block">
          <label class="scout-photo-label" for="scoutPhotoInput">Take a picture of your card? <span class="optional-tag">optional</span></label>
          <p class="scout-photo-hint muted-text">Your photo appears in your collection and may be featured on Card of the Day.</p>
          <input type="file" id="scoutPhotoInput" class="scout-photo-input" accept="image/*" capture="environment" />
          <img id="scoutPhotoPreview" class="scout-photo-preview hidden" alt="Card photo preview" />
          <button type="button" class="btn-ghost btn-xs hidden" id="scoutPhotoClear">Remove photo</button>
        </div>
        <p class="scout-review-hint muted-text">Tap Scout when this looks right. Use Back to fix any detail.</p>
      </div>
    </div>
    <div class="scout-wizard-nav">
      <button type="button" class="btn-secondary scout-nav-btn hidden" id="scoutWizardBack">Back</button>
      <button type="button" class="btn-ghost scout-nav-btn hidden" id="scoutWizardSkip">Skip</button>
      <button type="button" class="btn-secondary scout-nav-btn" id="scoutWizardNext">Next</button>
    </div>
  `;

  document.getElementById("scoutWizardBack")?.addEventListener("click", goBack);
  document.getElementById("scoutWizardNext")?.addEventListener("click", goNext);
  document.getElementById("scoutWizardSkip")?.addEventListener("click", goSkip);

  mount.querySelectorAll("[data-info-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => toggleInfo(btn));
  });

  wireScoutPhotoControls();
  clearPendingScoutPhoto();

  form.querySelectorAll(".scout-wizard-input, select[name]").forEach((el) => {
    el.addEventListener("change", syncBuiltTitle);
    el.addEventListener("input", syncBuiltTitle);
  });

  const gradingSelect = form.elements.namedItem("gradingCompany");
  gradingSelect?.addEventListener("change", () => {
    const values = getValues();
    const currentKey = activeSteps[stepIndex]?.key;
    activeSteps = computeActiveSteps(values);
    if ((currentKey === "grade" || currentKey === "certNumber") && isRaw(values)) {
      const notesIdx = activeSteps.findIndex((s) => s.key === "notes");
      showStep(notesIdx >= 0 ? notesIdx : activeSteps.length);
      return;
    }
    renderProgress();
  });

  form.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const onReview = stepIndex >= activeSteps.length;
    if (onReview) return;
    e.preventDefault();
    goNext();
  });

  showStep(0);
}

export function resetScoutWizard(form) {
  if (!form || !formEl) return;
  clearPendingScoutPhoto();
  for (const step of STEPS) {
    const el = form.elements.namedItem(step.key);
    if (el) el.value = step.inputType === "select" ? "" : "";
  }
  const titleEl = form.elements.namedItem("title");
  if (titleEl) titleEl.value = "";
  stepIndex = 0;
  activeSteps = [...STEPS];
  showStep(0);
  syncBuiltTitle();
}

export function fillScoutWizard(form, card) {
  if (!form || !card) return;
  for (const step of STEPS) {
    const el = form.elements.namedItem(step.key);
    if (el && card[step.key] != null) el.value = card[step.key];
  }
  const titleEl = form.elements.namedItem("title");
  if (titleEl) titleEl.value = card.title || buildCardTitle(card);

  activeSteps = computeActiveSteps(getValues());
  const hasPlayer = card.player?.trim();
  const hasLegacyTitle = card.title?.trim() && !hasPlayer;
  if (hasPlayer || hasLegacyTitle) {
    showStep(activeSteps.length);
  } else {
    showStep(0);
  }
  syncBuiltTitle();
}

export function cardFromScoutForm(form) {
  const card = formToCard(form);
  card.title = buildCardTitle(card) || card.title?.trim() || "";
  return card;
}

export function validateScoutCard(card) {
  const built = buildCardTitle(card);
  const legacyTitle = card.title?.trim() && !card.player?.trim();

  if (!card.player?.trim() && !built && !legacyTitle) {
    return "Add at least a player name to scout.";
  }
  if (!card.player?.trim() && !legacyTitle) {
    return "Player name is required — go back to step 1.";
  }
  return null;
}
