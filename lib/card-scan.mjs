import { parseOcrToCard } from "./card-scan-parse.mjs";

/** OCR disabled on Render free tier (crashes server). Returns empty fields for manual entry. */
export function isCardScanConfigured() {
  return true;
}

export async function scanCardFromImage(body = {}) {
  const imageCount = Array.isArray(body.images) ? Math.min(body.images.length, 2) : body.imageBack ? 2 : 1;
  return parseOcrToCard("", "", imageCount || 1);
}
