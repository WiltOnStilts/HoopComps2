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
  return value.trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");
}

function tryConfigureVapid(wp, subject, publicKey, privateKey) {
  wp.setVapidDetails(subject, publicKey, privateKey);
}

function loadOrCreateVapidKeys(wp) {
  const subject = cleanKey(process.env.VAPID_SUBJECT) || "mailto:support@hoopcomps.com";
  const envPublic = cleanKey(process.env.VAPID_PUBLIC_KEY);
  const envPrivate = cleanKey(process.env.VAPID_PRIVATE_KEY);
  if (envPublic && envPrivate) {
    try {
      tryConfigureVapid(wp, subject, envPublic, envPrivate);
      return { publicKey: envPublic, privateKey: envPrivate, source: "env" };
    } catch (err) {
      console.warn(`  Push: invalid VAPID env keys (${err.message}) — trying saved/generated keys`);
    }
  }

  if (fs.existsSync(VAPID_PATH)) {
    try {
      const saved = JSON.parse(fs.readFileSync(VAPID_PATH, "utf8"));
      if (saved.publicKey && saved.privateKey) {
        tryConfigureVapid(wp, subject, saved.publicKey, saved.privateKey);
        return { publicKey: saved.publicKey, privateKey: saved.privateKey, source: "file" };
      }
    } catch (err) {
      console.warn(`  Push: could not use saved VAPID keys (${err.message})`);
    }
  }

  const generated = wp.generateVAPIDKeys();
  tryConfigureVapid(wp, subject, generated.publicKey, generated.privateKey);
  fs.mkdirSync(path.dirname(VAPID_PATH), { recursive: true });
  fs.writeFileSync(VAPID_PATH, JSON.stringify(generated, null, 2));
  console.log("  Push: generated dev VAPID keys in data/vapid.json");
  console.log("  Push: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in production\n");
  return { publicKey: generated.publicKey, privateKey: generated.privateKey, source: "generated" };
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
    configured = true;
    initError = null;
    console.log(`  Push: Web Push enabled (${keys.source})`);
    return publicKey;
  } catch (err) {
    initError = err.message;
    configured = false;
    publicKey = "";
    console.warn(`  Push: disabled — ${initError}`);
    return "";
  }
}

async function loadWebPush() {
  if (webpush) return webpush;
  const mod = await import("web-push");
  webpush = mod.default;
  return webpush;
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
