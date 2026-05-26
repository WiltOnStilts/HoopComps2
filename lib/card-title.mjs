/** Build an eBay-style listing title from structured card fields */

export function buildCardTitle(card = {}) {
  const parts = [];

  if (card.year?.trim()) parts.push(card.year.trim());
  if (card.set?.trim()) parts.push(card.set.trim());
  if (card.parallel?.trim()) parts.push(card.parallel.trim());
  if (card.cardNumber?.trim()) {
    const num = card.cardNumber.trim().replace(/^#/, "");
    parts.push(`#${num}`);
  }
  if (card.player?.trim()) parts.push(card.player.trim());
  if (card.notes?.trim()) parts.push(card.notes.trim());

  if (card.serial?.trim()) {
    const serial = card.serial.trim();
    parts.push(serial.startsWith("/") ? serial : `/${serial}`);
  }

  const grader = card.gradingCompany?.trim();
  const grade = card.grade?.trim();
  if (grader && grade) {
    parts.push(`${grader} ${grade}`);
  } else if (grader) {
    parts.push(grader);
  } else if (grade) {
    parts.push(`PSA ${grade}`);
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}
