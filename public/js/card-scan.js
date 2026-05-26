/** Mobile card photo scan — free on-device OCR (Tesseract.js), review before scout */

import { parseOcrToCard } from "./card-scan-parse.js";

const SCAN_FIELDS = [
  { key: "title", label: "Card title", full: true, required: true, placeholder: "2018 Panini Prizm Silver #280 Luka Doncic RC" },
  { key: "player", label: "Player", placeholder: "Cooper Flagg" },
  { key: "year", label: "Year", placeholder: "2024" },
  { key: "set", label: "Set", placeholder: "Topps Chrome" },
  { key: "cardNumber", label: "Card #", placeholder: "280" },
  { key: "parallel", label: "Parallel", placeholder: "Silver, Gold /10" },
  { key: "serial", label: "Serial", placeholder: "/99" },
  { key: "gradingCompany", label: "Grading", type: "select", options: ["", "PSA", "BGS", "SGC", "CGC"] },
  { key: "grade", label: "Grade", placeholder: "10" },
  { key: "certNumber", label: "Cert #", placeholder: "Slab cert number" },
  { key: "notes", label: "Notes", full: true, placeholder: "RC, auto, patch" },
];

let frontPreviewUrl = null;
let backPreviewUrl = null;
let frontFile = null;
let backFile = null;
let captureTarget = "front";
let lastScanResult = null;

function $(id) {
  return document.getElementById(id);
}

function isMobileScanContext() {
  return window.matchMedia("(max-width: 768px)").matches;
}

let lastMobileScanContext = null;

function debounce(fn, ms = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

let refreshScanVisibility = () => {};

export function refreshCardScanButton() {
  refreshScanVisibility();
}

export function resetScanUi() {
  resetUiOverlays();
}

function revokeUrl(url) {
  if (url) URL.revokeObjectURL(url);
}

function revokePreviews() {
  revokeUrl(frontPreviewUrl);
  revokeUrl(backPreviewUrl);
  frontPreviewUrl = null;
  backPreviewUrl = null;
}

function setStep(step) {
  const sheet = $("cardScanSheet");
  if (!sheet) return;
  sheet.dataset.step = step;
  sheet.querySelectorAll("[data-scan-step]").forEach((el) => {
    el.classList.toggle("hidden", el.dataset.scanStep !== step);
  });
}

function openSheet() {
  const sheet = $("cardScanSheet");
  if (!sheet) return;
  sheet.classList.remove("hidden");
  document.body.classList.add("scan-sheet-open");
  resetCapture();
  setStep("capture-front");
}

function closeSheet() {
  const sheet = $("cardScanSheet");
  if (!sheet) return;
  sheet.classList.add("hidden");
  document.body.classList.remove("scan-sheet-open");
  resetCapture();
  const input = $("scanFileInput");
  if (input) input.value = "";
}

function resetUiOverlays() {
  document.body.classList.remove("scan-sheet-open", "modal-open");
  for (const id of ["cardScanSheet", "authModal", "listingModal", "friendModal", "codCommentsModal"]) {
    $(id)?.classList.add("hidden");
  }
}

function resetCapture() {
  revokePreviews();
  frontFile = null;
  backFile = null;
  lastScanResult = null;
  captureTarget = "front";

  const frontPreview = $("scanFrontPreview");
  const frontPlaceholder = $("scanFrontPlaceholder");
  const frontContinue = $("scanFrontContinueBtn");
  const frontRetake = $("scanFrontRetakeBtn");
  if (frontPreview) {
    frontPreview.src = "";
    frontPreview.classList.add("hidden");
  }
  if (frontPlaceholder) frontPlaceholder.classList.remove("hidden");
  if (frontContinue) frontContinue.disabled = true;
  if (frontRetake) frontRetake.classList.add("hidden");

  resetBackPreview();
}

function resetBackPreview() {
  const backPreview = $("scanBackPreview");
  const backPlaceholder = $("scanBackPlaceholder");
  const backRetake = $("scanBackRetakeBtn");
  const backCaption = $("scanBackCaption");
  const reviewBack = $("scanReviewBackThumb");
  const reviewBackLabel = $("scanReviewBackLabel");

  revokeUrl(backPreviewUrl);
  backPreviewUrl = null;
  backFile = null;

  if (backPreview) {
    backPreview.src = "";
    backPreview.classList.add("hidden");
  }
  if (backPlaceholder) backPlaceholder.classList.remove("hidden");
  if (backRetake) backRetake.classList.add("hidden");
  if (backCaption) backCaption.textContent = "Back";
  if (reviewBack) {
    reviewBack.src = "";
    reviewBack.classList.add("hidden");
  }
  if (reviewBackLabel) reviewBackLabel.textContent = "Back (skipped)";
}

function showFrontPreview(file) {
  revokeUrl(frontPreviewUrl);
  frontFile = file;
  frontPreviewUrl = URL.createObjectURL(file);

  const preview = $("scanFrontPreview");
  const placeholder = $("scanFrontPlaceholder");
  const mini = $("scanFrontMini");
  const continueBtn = $("scanFrontContinueBtn");
  const retakeBtn = $("scanFrontRetakeBtn");

  if (preview) {
    preview.src = frontPreviewUrl;
    preview.classList.remove("hidden");
  }
  if (mini) mini.src = frontPreviewUrl;
  if (placeholder) placeholder.classList.add("hidden");
  if (continueBtn) continueBtn.disabled = false;
  if (retakeBtn) retakeBtn.classList.remove("hidden");
}

function showBackPreview(file) {
  revokeUrl(backPreviewUrl);
  backFile = file;
  backPreviewUrl = URL.createObjectURL(file);

  const preview = $("scanBackPreview");
  const placeholder = $("scanBackPlaceholder");
  const retakeBtn = $("scanBackRetakeBtn");
  const caption = $("scanBackCaption");

  if (preview) {
    preview.src = backPreviewUrl;
    preview.classList.remove("hidden");
  }
  if (placeholder) placeholder.classList.add("hidden");
  if (retakeBtn) retakeBtn.classList.remove("hidden");
  if (caption) caption.textContent = "Back ✓";
}

function resizeImageFile(file, maxEdge = 1400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Could not process image"));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load image"));
    };
    img.src = objectUrl;
  });
}

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function emptyManualReview(imageCount = 1) {
  return parseOcrToCard("", "", imageCount);
}

function confidenceClass(level) {
  if (level === "missing") return "scan-confidence-missing";
  if (level === "low") return "scan-confidence-low";
  if (level === "medium") return "scan-confidence-medium";
  return "scan-confidence-high";
}

function confidenceLabel(level) {
  if (level === "missing") return "Fill in";
  if (level === "low") return "Verify";
  if (level === "medium") return "Check";
  return "Detected";
}

function renderReviewForm(result) {
  const fieldsEl = $("scanReviewFields");
  if (!fieldsEl) return;

  const { card, confidence, fieldHints, needsReview, scanNotes, imageCount } = result;
  lastScanResult = result;

  const frontThumb = $("scanReviewFrontThumb");
  const backThumb = $("scanReviewBackThumb");
  const backLabel = $("scanReviewBackLabel");
  if (frontThumb && frontPreviewUrl) {
    frontThumb.src = frontPreviewUrl;
    frontThumb.classList.remove("hidden");
  }
  if (backThumb && backPreviewUrl) {
    backThumb.src = backPreviewUrl;
    backThumb.classList.remove("hidden");
    if (backLabel) backLabel.textContent = "Back";
  } else if (backLabel) {
    backLabel.textContent = "Back (skipped)";
  }

  const summary = $("scanReviewSummary");
  if (summary) {
    const reviewCount = needsReview?.length || 0;
    const photoNote = imageCount > 1 ? "Read from front + back photos." : "Read from front photo only.";
    summary.textContent =
      reviewCount > 0
        ? `${photoNote} ${reviewCount} field${reviewCount === 1 ? "" : "s"} need your attention before scouting.`
        : `${photoNote} Details look good — scout when ready.`;
    if (scanNotes) summary.textContent += ` ${scanNotes}`;
  }

  fieldsEl.innerHTML = SCAN_FIELDS.map((field) => {
    const value = card[field.key] ?? "";
    const conf = confidence[field.key] || (value ? "medium" : "missing");
    const hint = fieldHints[field.key] || "";
    const needsAttention = conf === "missing" || conf === "low" || !value;

    if (field.type === "select") {
      const options = (field.options || []).map((opt) => {
        const label = opt || "Raw";
        const selected = value === opt ? " selected" : "";
        return `<option value="${opt}"${selected}>${label}</option>`;
      }).join("");
      return `
        <label class="scan-field ${needsAttention ? "scan-field-needs-review" : ""}" data-field="${field.key}">
          <span class="scan-field-head">
            <span>${field.label}${field.required ? " *" : ""}</span>
            <span class="scan-confidence ${confidenceClass(conf)}">${confidenceLabel(conf)}</span>
          </span>
          <select name="${field.key}">${options}</select>
          ${hint ? `<span class="scan-field-hint">${escapeHtml(hint)}</span>` : ""}
        </label>`;
    }

    return `
      <label class="scan-field ${field.full ? "scan-field-full" : ""} ${needsAttention ? "scan-field-needs-review" : ""}" data-field="${field.key}">
        <span class="scan-field-head">
          <span>${field.label}${field.required ? " *" : ""}</span>
          <span class="scan-confidence ${confidenceClass(conf)}">${confidenceLabel(conf)}</span>
        </span>
        <input
          type="text"
          name="${field.key}"
          value="${escapeAttr(value)}"
          placeholder="${field.placeholder || ""}"
          ${field.required ? "required" : ""}
        />
        ${hint ? `<span class="scan-field-hint">${escapeHtml(hint)}</span>` : ""}
      </label>`;
  }).join("");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function reviewFormToCard(form) {
  const fd = new FormData(form);
  return Object.fromEntries(fd.entries());
}

async function analyzePhotos({ includeBack = true } = {}) {
  if (!frontFile) {
    alert("Add a front photo first");
    setStep("capture-front");
    return;
  }

  setStep("analyzing");
  const status = $("scanAnalyzingStatus");
  if (status) status.textContent = "Uploading photos… (first scan may take up to a minute)";

  const imageCount = includeBack && backFile ? 2 : 1;

  try {
    const images = [
      {
        side: "front",
        base64: await blobToBase64(await resizeImageFile(frontFile)),
      },
    ];
    if (includeBack && backFile) {
      images.push({
        side: "back",
        base64: await blobToBase64(await resizeImageFile(backFile)),
      });
    }

    if (status) status.textContent = "Analyzing photos…";

    const res = await fetch("/api/scout/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Scan failed");

    renderReviewForm(data);
    setStep("review");
  } catch (err) {
    console.error("Card scan failed:", err);
    const manual = emptyManualReview(imageCount);
    manual.scanNotes =
      "Auto-read failed — use your photos and fill in the details below.";
    renderReviewForm(manual);
    setStep("review");
  }
}

function openFilePicker(useCamera) {
  const input = $("scanFileInput");
  if (!input) return;
  if (useCamera) input.setAttribute("capture", "environment");
  else input.removeAttribute("capture");
  input.value = "";
  input.click();
}

export function initCardScan({ onScoutCard }) {
  const openBtn = $("openCardScanBtn");
  const sheet = $("cardScanSheet");
  if (!openBtn || !sheet) return;

  function refreshVisibility() {
    const mobile = isMobileScanContext();
    if (mobile === lastMobileScanContext) return;
    lastMobileScanContext = mobile;
    openBtn.classList.toggle("hidden", !mobile);
  }

  refreshVisibility();
  refreshScanVisibility = refreshVisibility;
  window.addEventListener("resize", debounce(refreshVisibility, 250), { passive: true });

  openBtn.addEventListener("click", () => {
    openSheet();
  });

  sheet.querySelector(".scan-sheet-backdrop")?.addEventListener("click", closeSheet);
  $("scanCloseBtn")?.addEventListener("click", closeSheet);
  $("scanCancelBtn")?.addEventListener("click", closeSheet);

  $("scanFrontCameraBtn")?.addEventListener("click", () => {
    captureTarget = "front";
    openFilePicker(true);
  });
  $("scanFrontLibraryBtn")?.addEventListener("click", () => {
    captureTarget = "front";
    openFilePicker(false);
  });
  $("scanBackCameraBtn")?.addEventListener("click", () => {
    captureTarget = "back";
    openFilePicker(true);
  });
  $("scanBackLibraryBtn")?.addEventListener("click", () => {
    captureTarget = "back";
    openFilePicker(false);
  });

  $("scanFileInput")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (captureTarget === "back") showBackPreview(file);
    else showFrontPreview(file);
  });

  $("scanFrontRetakeBtn")?.addEventListener("click", () => {
    revokeUrl(frontPreviewUrl);
    frontPreviewUrl = null;
    frontFile = null;
    const preview = $("scanFrontPreview");
    const placeholder = $("scanFrontPlaceholder");
    const continueBtn = $("scanFrontContinueBtn");
    const retakeBtn = $("scanFrontRetakeBtn");
    if (preview) {
      preview.src = "";
      preview.classList.add("hidden");
    }
    if (placeholder) placeholder.classList.remove("hidden");
    if (continueBtn) continueBtn.disabled = true;
    if (retakeBtn) retakeBtn.classList.add("hidden");
  });

  $("scanFrontContinueBtn")?.addEventListener("click", () => {
    if (!frontFile) {
      alert("Take a front photo first");
      return;
    }
    setStep("capture-back");
  });

  $("scanBackRetakeBtn")?.addEventListener("click", resetBackPreview);

  $("scanBackToFrontBtn")?.addEventListener("click", () => setStep("capture-front"));

  $("scanSkipBackBtn")?.addEventListener("click", () => analyzePhotos({ includeBack: false }));

  $("scanAnalyzeBtn")?.addEventListener("click", () => analyzePhotos({ includeBack: true }));

  $("scanBackToPhotoBtn")?.addEventListener("click", () => setStep("capture-front"));

  $("scanReviewForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = $("scanReviewForm");
    const card = reviewFormToCard(form);
    if (!card.title?.trim()) {
      alert("Add a card title before scouting");
      form.querySelector('[name="title"]')?.focus();
      return;
    }
    closeSheet();
    await onScoutCard(card);
  });
}
