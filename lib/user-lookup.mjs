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

/** Parse friend-search input into username or phone prefix mode */
export function parseFriendSearchQuery(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  if (looksLikePhone(raw)) {
    const digits = normalizePhone(raw);
    if (digits.length < 4) return null;
    return { mode: "phone", term: digits, minLength: 4 };
  }

  const term = normalizeUsername(raw.replace(/^@+/, "")).toLowerCase();
  if (term.length < 2) return null;
  return { mode: "username", term, minLength: 2 };
}

export function userMatchesFriendSearch(user, parsed) {
  if (!user || !parsed) return false;
  const username = (user.username || "").toLowerCase();
  const displayName = (user.display_name || user.displayName || "").toLowerCase();
  const compactName = displayName.replace(/\s+/g, "");
  const emailLocal = (user.email || "").split("@")[0]?.toLowerCase() || "";

  if (parsed.mode === "phone") {
    const phone = user.phone || "";
    return phone.startsWith(parsed.term);
  }

  return (
    username.startsWith(parsed.term) ||
    displayName.startsWith(parsed.term) ||
    compactName.startsWith(parsed.term) ||
    emailLocal.startsWith(parsed.term)
  );
}
