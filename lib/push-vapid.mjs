import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAPID_PATH = path.join(__dirname, "..", "data", "vapid.json");

let publicKey = "";
let configured = false;
let initError = null;
let webpush = null;

function cleanKey(value) {
  if (!value || typeof value !== "string") return "";
  return value.trim().replace(/^["']|["']$/g, "");
}

async function loadWebPush() {
  if (webpush) return webpush;
  const mod = await import("web-push");
  webpush = mod.default;
  return webpush;
}

function loadOrCreateVapidKeys(wp) {
  const envPublic = cleanKey(process.env.VAPID_PUBLIC_KEY);
  const envPrivate = cleanKey(process.env.VAPID_PRIVATE_KEY);
  if (envPublic && envPrivate) {
    return { publicKey: envPublic, privateKey: envPrivate };
  }

  if (fs.existsSync(VAPID_PATH)) {
    try {
      const saved = JSON.parse(fs.readFileSync(VAPID_PATH, "utf8"));
      if (saved.publicKey && saved.privateKey) return saved;
    } catch {
      /* regenerate */
    }
  }

  const generated = wp.generateVAPIDKeys();
  fs.mkdirSync(path.dirname(VAPID_PATH), { recursive: true });
  fs.writeFileSync(VAPID_PATH, JSON.stringify(generated, null, 2));
  console.log("  Push: generated dev VAPID keys in data/vapid.json");
  console.log("  Push: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in production\n");
  return generated;
}

export function getPushInitError() {
  return initError;
}

export async function initPushVapidAsync() {
  if (configured) return publicKey;

  try {
    const wp = await loadWebPush();
    const keys = loadOrCreateVapidKeys(wp);
    publicKey = keys.publicKey;
    const subject = cleanKey(process.env.VAPID_SUBJECT) || "mailto:support@hoopcomps.com";
    wp.setVapidDetails(subject, keys.publicKey, keys.privateKey);
    configured = true;
    initError = null;
    console.log("  Push: Web Push enabled");
    return publicKey;
  } catch (err) {
    initError = err.message;
    configured = false;
    publicKey = "";
    console.warn(`  Push: disabled — ${initError}`);
    return "";
  }
}

export function getVapidPublicKey() {
  return configured ? publicKey : null;
}

export function isPushConfigured() {
  return configured;
}

export async function getWebPush() {
  if (!configured) return null;
  return loadWebPush();
}
