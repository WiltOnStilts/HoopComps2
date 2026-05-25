/** Parse raw OCR text from card photos into scout form fields (no paid API) */

const SET_PHRASES = [
  "national treasures",
  "immaculate",
  "flawless",
  "panini prizm",
  "prizm draft picks",
  "panini select",
  "panini mosaic",
  "panini optic",
  "panini donruss",
  "donruss optic",
  "topps chrome",
  "topps finest",
  "topps bowman",
  "bowman chrome",
  "panini contenders",
  "panini hoops",
  "panini revolution",
  "panini noir",
  "panini origins",
  "court kings",
  "chronicles",
  "absolute",
  "prestige",
  "elite",
  "obsidian",
  "recon",
  "prizm",
  "select",
  "mosaic",
  "optic",
  "donruss",
  "topps",
  "hoops",
  "contenders",
  "fleer",
  "upper deck",
  "skybox",
];

const PARALLEL_TERMS = [
  "silver prizm",
  "gold prizm",
  "black prizm",
  "red prizm",
  "blue prizm",
  "green prizm",
  "purple prizm",
  "orange prizm",
  "pink prizm",
  "fast break",
  "choice",
  "discotheque",
  "velocity",
  "hyper",
  "genesis",
  "refractor",
  "silver",
  "gold",
  "holo",
  "mojo",
  "wave",
  "disco",
  "auto",
  "autograph",
  "patch",
  "insert",
];

const NOISE_WORDS = new Set([
  "basketball",
  "nba",
  "card",
  "cards",
  "rookie",
  "rookies",
  "rc",
  "the",
  "and",
  "panini",
  "topps",
  "donruss",
  "usa",
  "tm",
  "copyright",
  "licensed",
  "com",
  "www",
  "front",
  "back",
  "gem",
  "mint",
  "mt",
  "gem mint",
]);

const GRADERS = ["PSA", "BGS", "SGC", "CGC"];

function norm(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function lines(text) {
  return norm(text)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function lower(text) {
  return norm(text).toLowerCase();
}

function conf(found, strength = "medium") {
  if (!found) return "missing";
  return strength;
}

function extractGrading(text) {
  const upper = norm(text).toUpperCase();
  for (const company of GRADERS) {
    const gradeMatch = upper.match(
      new RegExp(`\\b${company}\\s*(?:GEM\\s*MT\\s*)?(\\d+(?:\\.5)?)\\b`)
    );
    if (gradeMatch) {
      return { gradingCompany: company, grade: gradeMatch[1], strength: "high" };
    }
    if (upper.includes(company)) {
      const loose = upper.match(new RegExp(`${company}[\\s#-]*(\\d+(?:\\.5)?)`));
      if (loose) {
        return { gradingCompany: company, grade: loose[1], strength: "medium" };
      }
      return { gradingCompany: company, grade: "", strength: "low" };
    }
  }
  return { gradingCompany: "", grade: "", strength: "missing" };
}

function extractCertNumber(text) {
  const match = norm(text).match(/\b(?:cert(?:ification)?|cert\.?|#)\s*[:#]?\s*(\d{6,12})\b/i);
  if (match) return { value: match[1], strength: "high" };
  const slab = norm(text).match(/\b(\d{8,12})\b/);
  if (slab && /PSA|BGS|SGC|CGC/i.test(text)) {
    return { value: slab[1], strength: "medium" };
  }
  return { value: "", strength: "missing" };
}

function extractYear(text) {
  const season = text.match(/\b(19|20)\d{2}\s*[-–]\s*\d{2}\b/);
  if (season) return { value: season[0].replace(/\s+/g, ""), strength: "high" };
  const year = text.match(/\b(19|20)\d{2}\b/);
  if (year) return { value: year[0], strength: "medium" };
  return { value: "", strength: "missing" };
}

function extractCardNumber(text) {
  const patterns = [
    /\b(?:card\s*)?#?\s*(?:no\.?\s*)?(\d{1,4})\b/i,
    /\b#(\d{1,4})\b/,
    /\b(\d{1,4})\s*\/\s*\d+\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const num = match[1];
      if (Number(num) > 0 && Number(num) < 5000) {
        return { value: num, strength: pattern.source.includes("#") ? "high" : "medium" };
      }
    }
  }
  return { value: "", strength: "missing" };
}

function extractSerial(text) {
  const numbered = text.match(/\b(\d{1,4}\s*\/\s*\d{1,5})\b/);
  if (numbered) return { value: numbered[1].replace(/\s+/g, ""), strength: "high" };
  const slash = text.match(/\/(\d{1,5})\b/);
  if (slash) return { value: `/${slash[1]}`, strength: "medium" };
  return { value: "", strength: "missing" };
}

function titleCasePhrase(phrase) {
  return phrase.replace(/\b\w+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

function pickBest(...results) {
  const withValue = results.find((r) => r?.value);
  return withValue || results[0] || { value: "", strength: "missing" };
}
  const hay = lower(text);
  for (const phrase of SET_PHRASES) {
    if (hay.includes(phrase)) {
      return {
        value: titleCasePhrase(phrase),
        strength: phrase.includes(" ") ? "high" : "medium",
      };
    }
  }
  if (/\btopps\b/i.test(text)) return { value: "Topps", strength: "low" };
  if (/\bpanini\b/i.test(text)) return { value: "Panini", strength: "low" };
  if (/\bdonruss\b/i.test(text)) return { value: "Donruss", strength: "low" };
  return { value: "", strength: "missing" };
}

function extractParallel(text) {
  const hay = lower(text);
  for (const term of PARALLEL_TERMS) {
    if (hay.includes(term)) {
      return {
        value: term.replace(/\b\w/g, (c) => c.toUpperCase()),
        strength: "medium",
      };
    }
  }
  return { value: "", strength: "missing" };
}

function extractNotes(text) {
  const notes = [];
  const hay = lower(text);
  if (/\b(rookie|rc)\b/.test(hay)) notes.push("RC");
  if (/\b(auto|autograph|signed)\b/.test(hay)) notes.push("Auto");
  if (/\b(patch|relic|jersey)\b/.test(hay)) notes.push("Patch");
  if (/\b(ssp|sp)\b/.test(hay)) notes.push("SSP");
  return { value: notes.join(", "), strength: notes.length ? "medium" : "missing" };
}

function looksLikePlayerLine(line) {
  const cleaned = norm(line);
  if (cleaned.length < 4 || cleaned.length > 40) return false;
  if (/\d{3,}/.test(cleaned)) return false;
  if (/^(psa|bgs|sgc|cgc|topps|panini|donruss|nba|basketball)/i.test(cleaned)) return false;
  const words = cleaned.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  return words.every((w) => /^[A-Za-z'.-]+$/.test(w) && w[0] === w[0].toUpperCase());
}

function extractPlayer(frontText, backText) {
  const candidates = [];
  for (const line of [...lines(frontText), ...lines(backText)]) {
    if (looksLikePlayerLine(line)) candidates.push(line);
  }
  if (candidates.length) {
    const best = candidates.sort((a, b) => b.length - a.length)[0];
    return { value: best, strength: "medium" };
  }
  return { value: "", strength: "missing" };
}

function buildTitle(card) {
  const parts = [
    card.year,
    card.set,
    card.parallel,
    card.cardNumber ? `#${card.cardNumber.replace(/^#/, "")}` : "",
    card.player,
    card.notes?.includes("RC") ? "RC" : "",
  ].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function parseOcrToCard(frontText, backText = "") {
  const combined = `${frontText}\n${backText}`;
  const backHeavy = backText || combined;

  const grading = extractGrading(combined);
  const cert = extractCertNumber(combined);
  const year = pickBest(extractYear(backHeavy), extractYear(frontText));
  const cardNumber = pickBest(extractCardNumber(backHeavy), extractCardNumber(frontText));
  const serial = pickBest(extractSerial(backHeavy), extractSerial(frontText));
  const set = extractSet(combined);
  const parallel = extractParallel(combined);
  const notes = extractNotes(combined);
  const player = extractPlayer(frontText, backText);

  const card = {
    title: "",
    player: player.value,
    year: year.value,
    set: set.value,
    cardNumber: cardNumber.value,
    parallel: parallel.value,
    serial: serial.value,
    gradingCompany: grading.gradingCompany,
    grade: grading.grade,
    certNumber: cert.value,
    notes: notes.value,
  };

  card.title = buildTitle(card);

  const confidence = {
    title: card.title ? "medium" : "missing",
    player: conf(player.value, player.strength),
    year: conf(year.value, year.strength),
    set: conf(set.value, set.strength),
    cardNumber: conf(cardNumber.value, cardNumber.strength),
    parallel: conf(parallel.value, parallel.strength),
    serial: conf(serial.value, serial.strength),
    gradingCompany: conf(grading.gradingCompany, grading.strength),
    grade: conf(grading.grade, grading.strength),
    certNumber: conf(cert.value, cert.strength),
    notes: conf(notes.value, notes.strength),
  };

  const fieldHints = {};
  if (!card.cardNumber) {
    fieldHints.cardNumber = backText
      ? "OCR couldn't read the card # — type it from the back"
      : "Add a back photo or type the card number manually";
  }
  if (!card.set) fieldHints.set = "Set/brand often on the back — fill in (e.g. Topps Chrome)";
  if (!card.player) fieldHints.player = "Type the player name from the card front";
  if (!card.title) fieldHints.title = "Add a title before scouting";

  for (const [key, level] of Object.entries(confidence)) {
    if (level === "low" && !fieldHints[key]) {
      fieldHints[key] = "Low confidence — please verify";
    }
  }

  const needsReview = Object.entries(confidence)
    .filter(([, level]) => level === "missing" || level === "low" || level === "medium")
    .map(([key]) => key);

  return {
    card,
    confidence,
    fieldHints,
    needsReview,
    scanNotes: "Free on-device text scan — always double-check before scouting.",
    imageCount: backText ? 2 : 1,
    ocrPreview: {
      frontLines: lines(frontText).slice(0, 8),
      backLines: lines(backText).slice(0, 8),
    },
  };
}
