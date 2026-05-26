/** Normalize phone numbers and friend lookup helpers */

export function normalizePhone(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

export function normalizeUsername(input) {
  return String(input || "")
    .trim()
    .replace(/\s+/g, "");
}

export function looksLikePhone(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return false;
  return /^[\d\s().+\-]+$/.test(trimmed);
}
