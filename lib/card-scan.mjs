import { createWorker } from "tesseract.js";
import { parseOcrToCard } from "./card-scan-parse.mjs";

function cleanBase64(input) {
  return String(input || "").replace(/^data:[^;]+;base64,/, "");
}

function normalizeImageInputs(body) {
  const images = [];

  if (Array.isArray(body.images) && body.images.length) {
    for (const row of body.images) {
      const base64 = cleanBase64(row.base64 || row.image);
      if (!base64) continue;
      images.push({
        base64,
        side: row.side === "back" ? "back" : "front",
      });
    }
  }

  if (!images.length && body.imageFront) {
    images.push({ base64: cleanBase64(body.imageFront), side: "front" });
  }
  if (body.imageBack) {
    images.push({ base64: cleanBase64(body.imageBack), side: "back" });
  }

  if (!images.length && (body.image || body.base64)) {
    images.push({
      base64: cleanBase64(body.image || body.base64),
      side: "front",
    });
  }

  return images.slice(0, 2);
}

async function ocrBuffer(buffer) {
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    return text || "";
  } finally {
    await worker.terminate();
  }
}

export async function scanCardFromImage(body = {}) {
  const images = normalizeImageInputs(body);
  if (!images.length) {
    throw new Error("At least one photo is required");
  }

  let frontText = "";
  let backText = "";

  for (const img of images) {
    const sizeBytes = Buffer.byteLength(img.base64, "base64");
    if (sizeBytes > 6 * 1024 * 1024) {
      throw new Error("One of the photos is too large — try a closer shot");
    }

    const buffer = Buffer.from(img.base64, "base64");
    const text = await ocrBuffer(buffer);
    if (img.side === "back") backText = text;
    else frontText = text;
  }

  return parseOcrToCard(frontText, backText);
}

export function isCardScanConfigured() {
  return true;
}

/** Download OCR language data once at startup so first user scan is fast */
export async function warmupOcr() {
  const worker = await createWorker("eng");
  await worker.terminate();
}
