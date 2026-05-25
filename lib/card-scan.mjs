import https from "https";

const SCAN_FIELDS = [
  "title",
  "player",
  "year",
  "set",
  "cardNumber",
  "parallel",
  "serial",
  "gradingCompany",
  "grade",
  "certNumber",
  "notes",
];

const CARD_SCAN_PROMPT = `You are a basketball trading card identification expert. You will receive one or two photos of the SAME card.

Image order when two are provided:
1. FRONT — player photo, design, parallel name on front, slab label if graded
2. BACK — card number, set/copyright line, manufacturer, serial print run (e.g. 23/99)

Return ONLY valid JSON — no markdown — in this exact shape:
{
  "card": {
    "title": "full searchable title if you can construct one, else empty string",
    "player": "",
    "year": "4-digit year or season like 2024-25",
    "set": "product/set name e.g. Panini Prizm, Topps Chrome, Donruss",
    "cardNumber": "number only without #",
    "parallel": "Silver, Gold, Refractor, etc. Empty if base",
    "serial": "e.g. /99 or /25 if numbered, else empty",
    "gradingCompany": "PSA, BGS, SGC, CGC, or empty if raw",
    "grade": "numeric grade if graded, else empty",
    "certNumber": "cert number from slab label if visible",
    "notes": "RC, auto, patch, SSP, etc."
  },
  "confidence": {
    "title": "high|medium|low",
    "player": "high|medium|low",
    "year": "high|medium|low",
    "set": "high|medium|low",
    "cardNumber": "high|medium|low",
    "parallel": "high|medium|low",
    "serial": "high|medium|low",
    "gradingCompany": "high|medium|low",
    "grade": "high|medium|low",
    "certNumber": "high|medium|low",
    "notes": "high|medium|low"
  },
  "fieldHints": {
    "fieldName": "short hint when value is empty or low confidence"
  }
}

Rules:
- Combine information from BOTH images when two are provided.
- Card number is usually on the BACK — prioritize the back photo for cardNumber.
- Set/year/manufacturer text is often on the back copyright line.
- Use "low" confidence when guessing or text is partially obscured.
- Leave a field empty when not visible — do NOT invent card numbers or parallels.
- For graded slabs, read the label text carefully (often visible on front).
- "set" means the product line (Topps Chrome, Panini Prizm), not just "Topps" alone unless that's all that's visible.
- parallel empty means base card unless a parallel name is clearly printed.
- gradingCompany empty and grade empty means raw/ungraded.`;

function openAiVisionRequest(apiKey, { images, model }) {
  const content = [{ type: "text", text: CARD_SCAN_PROMPT }];
  for (const img of images) {
    const label =
      img.side === "back"
        ? "BACK of card (card number, copyright, manufacturer):"
        : img.side === "front"
          ? "FRONT of card (player, design, slab label):"
          : "Card photo:";
    content.push({ type: "text", text: label });
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
        detail: "high",
      },
    });
  }

  const body = JSON.stringify({
    model,
    messages: [{ role: "user", content }],
    temperature: 0.1,
    max_tokens: 1200,
    response_format: { type: "json_object" },
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode !== 200) {
              reject(new Error(json.error?.message || `OpenAI error (${res.statusCode})`));
              return;
            }
            resolve(json.choices?.[0]?.message?.content || "");
          } catch {
            reject(new Error("Failed to parse OpenAI response"));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function parseJsonResponse(raw) {
  const trimmed = String(raw || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(text);
}

function cleanField(value) {
  if (value == null) return "";
  return String(value).trim();
}

function cleanBase64Input(base64) {
  return String(base64 || "").replace(/^data:[^;]+;base64,/, "");
}

function buildTitleFromFields(card) {
  const parts = [
    card.year,
    card.set,
    card.parallel,
    card.cardNumber ? `#${String(card.cardNumber).replace(/^#/, "")}` : "",
    card.player,
    card.notes?.toLowerCase().includes("rc") || card.notes?.toLowerCase().includes("rookie")
      ? "RC"
      : "",
  ].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function normalizeScanResult(parsed, { imageCount = 1 } = {}) {
  const card = {};
  const rawCard = parsed?.card || {};
  for (const key of SCAN_FIELDS) {
    card[key] = cleanField(rawCard[key]);
  }

  if (!card.title) {
    card.title = buildTitleFromFields(card);
  }

  const confidence = {};
  const rawConf = parsed?.confidence || {};
  for (const key of SCAN_FIELDS) {
    const level = cleanField(rawConf[key]).toLowerCase();
    if (!card[key]) {
      confidence[key] = "missing";
    } else if (["high", "medium", "low"].includes(level)) {
      confidence[key] = level;
    } else {
      confidence[key] = "medium";
    }
  }

  const fieldHints = {};
  const rawHints = parsed?.fieldHints || {};
  for (const [key, hint] of Object.entries(rawHints)) {
    if (hint && SCAN_FIELDS.includes(key)) {
      fieldHints[key] = cleanField(hint);
    }
  }

  for (const key of SCAN_FIELDS) {
    if (confidence[key] === "missing" && !fieldHints[key]) {
      if (key === "cardNumber") {
        fieldHints[key] =
          imageCount < 2
            ? "Not visible on front — add a back photo or type manually"
            : "Not readable — type the card number manually";
      } else if (key === "title" && card.player) {
        fieldHints[key] = "Add any missing details for a tighter comp match";
      } else if (confidence[key] === "missing" || confidence[key] === "low") {
        fieldHints[key] = "Please confirm or fill in";
      }
    }
    if (confidence[key] === "low" && !fieldHints[key]) {
      fieldHints[key] = "Low confidence — please verify";
    }
  }

  const needsReview = SCAN_FIELDS.filter(
    (key) =>
      !card[key] ||
      confidence[key] === "missing" ||
      confidence[key] === "low"
  );

  return {
    card,
    confidence,
    fieldHints,
    needsReview,
    scanNotes: cleanField(parsed?.overallNotes || parsed?.notes || ""),
    imageCount,
  };
}

export function isCardScanConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function normalizeImageInputs(body) {
  const images = [];

  if (Array.isArray(body.images) && body.images.length) {
    for (const row of body.images) {
      const base64 = cleanBase64Input(row.base64 || row.image);
      if (!base64) continue;
      images.push({
        base64,
        mimeType: row.mimeType || row.mime || "image/jpeg",
        side: row.side === "back" ? "back" : "front",
      });
    }
  }

  if (!images.length && body.imageFront) {
    images.push({
      base64: cleanBase64Input(body.imageFront),
      mimeType: body.mimeTypeFront || body.mimeType || "image/jpeg",
      side: "front",
    });
  }
  if (body.imageBack) {
    images.push({
      base64: cleanBase64Input(body.imageBack),
      mimeType: body.mimeTypeBack || body.mimeType || "image/jpeg",
      side: "back",
    });
  }

  if (!images.length && (body.image || body.base64)) {
    images.push({
      base64: cleanBase64Input(body.image || body.base64),
      mimeType: body.mimeType || body.mime || "image/jpeg",
      side: "front",
    });
  }

  return images.slice(0, 2);
}

export async function scanCardFromImage(body = {}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Card scanning requires OPENAI_API_KEY on the server");
  }

  const images = normalizeImageInputs(body);
  if (!images.length) {
    throw new Error("At least one photo is required");
  }

  let totalBytes = 0;
  for (const img of images) {
    const sizeBytes = Buffer.byteLength(img.base64, "base64");
    if (sizeBytes > 6 * 1024 * 1024) {
      throw new Error("One of the photos is too large — try a closer shot or retake");
    }
    totalBytes += sizeBytes;
  }
  if (totalBytes > 10 * 1024 * 1024) {
    throw new Error("Photos are too large combined — try closer shots");
  }

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  for (const img of images) {
    img.mimeType = allowed.includes(img.mimeType) ? img.mimeType : "image/jpeg";
  }

  const model = process.env.CARD_SCAN_MODEL?.trim() || "gpt-4o-mini";

  const raw = await openAiVisionRequest(apiKey, { images, model });

  let parsed;
  try {
    parsed = parseJsonResponse(raw);
  } catch {
    throw new Error("Could not read card details from this photo — try better lighting or a straighter angle");
  }

  return normalizeScanResult(parsed, { imageCount: images.length });
}
