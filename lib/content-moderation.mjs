import https from "https";

const HEURISTIC_PATTERNS = [
  { pattern: /\b(kys|kill yourself|go die)\b/i, category: "threats" },
  { pattern: /\b(unalive|neck yourself)\b/i, category: "threats" },
  { pattern: /\b(i hope you die|you should die)\b/i, category: "threats" },
  { pattern: /\byou\s+should\s+(die|suffer|hurt|be\s+hurt)\b/i, category: "threats" },
  { pattern: /\b(stfu|shut up)\b.*\b(idiot|moron|loser|worthless)\b/i, category: "harassment" },
  {
    pattern:
      /\byou('re| are)\s+(\w+\s+){0,4}?(an?\s+)?(idiot|moron|stupid|worthless|pathetic|disgusting|dumb|trash|garbage|loser)\b/i,
    category: "harassment",
  },
  {
    pattern: /\bdeserve(s)?\s+to\s+be\s+(bullied|hurt|beaten|killed|attacked|harassed)\b/i,
    category: "harassment",
  },
  { pattern: /\b(hate you|f+\s*u+|fuck you)\b/i, category: "harassment" },
  { pattern: /\b(racial slur|homophobic slur)\b/i, category: "hate_speech" },
];

const SLUR_FRAGMENTS = [
  "nigg",
  "fagg",
  "retard",
  "tranny",
];

function heuristicModerate(text) {
  const normalized = String(text || "").toLowerCase();
  for (const { pattern, category } of HEURISTIC_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        violation: true,
        categories: [category],
        reason: "Message matched community safety rules",
        source: "heuristic",
      };
    }
  }
  for (const frag of SLUR_FRAGMENTS) {
    if (normalized.includes(frag)) {
      return {
        violation: true,
        categories: ["hate_speech"],
        reason: "Message matched community safety rules",
        source: "heuristic",
      };
    }
  }
  return { violation: false, categories: [], reason: null, source: "heuristic" };
}

function openAiModerationRequest(apiKey, text, context) {
  const body = JSON.stringify({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 200,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a strict community safety moderator for a basketball card collecting app.
Classify user messages for: bullying, harassment, hate speech, threats, slurs, or personal attacks.
Context: ${context}
Reply JSON only: {"violation": boolean, "categories": string[], "reason": string}
Flag violation only for clear harmful content — not friendly trash talk about cards or prices.`,
      },
      { role: "user", content: text },
    ],
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
            const raw = json.choices?.[0]?.message?.content || "{}";
            const parsed = JSON.parse(raw);
            resolve({
              violation: Boolean(parsed.violation),
              categories: Array.isArray(parsed.categories) ? parsed.categories : [],
              reason: parsed.reason || "Policy violation detected",
              source: "openai",
            });
          } catch {
            reject(new Error("Failed to parse moderation response"));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function moderateUserContent(text, { context = "comment", apiKey } = {}) {
  const heuristic = heuristicModerate(text);
  if (heuristic.violation) return heuristic;

  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) return { violation: false, categories: [], reason: null, source: "heuristic-only" };

  try {
    const ai = await openAiModerationRequest(key, text, context);
    if (ai.violation) return ai;
    return { violation: false, categories: [], reason: null, source: "openai" };
  } catch {
    return { violation: false, categories: [], reason: null, source: "openai-unavailable" };
  }
}

export const COMMENT_BAN_DAYS = 7;

export function formatBanUntil(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
