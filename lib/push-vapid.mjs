import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import webpush from "web-push";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAPID_PATH = path.join(__dirname, "..", "data", "vapid.json");

let publicKey = "";
let configured = false;

function loadOrCreateVapidKeys() {
  const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
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

  const generated = webpush.generateVAPIDKeys();
  fs.mkdirSync(path.dirname(VAPID_PATH), { recursive: true });
  fs.writeFileSync(VAPID_PATH, JSON.stringify(generated, null, 2));
  console.log("  Push: generated dev VAPID keys in data/vapid.json");
  console.log("  Push: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in production\n");
  return generated;
}

export function initPushVapid() {
  if (configured) return publicKey;

  const keys = loadOrCreateVapidKeys();
  publicKey = keys.publicKey;
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@hoopcomps.com";

  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  configured = true;
  return publicKey;
}

export function getVapidPublicKey() {
  if (!configured) initPushVapid();
  return publicKey;
}

export function isPushConfigured() {
  return configured;
}

export { webpush };
