#!/usr/bin/env node
/** Generate Web Push VAPID keys — no npm required, uses Node built-in crypto only. */

import crypto from "crypto";

function urlBase64(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateVapidKeys() {
  const curve = crypto.createECDH("prime256v1");
  curve.generateKeys();
  return {
    publicKey: urlBase64(curve.getPublicKey(null, "uncompressed")),
    privateKey: urlBase64(curve.getPrivateKey()),
  };
}

const keys = generateVapidKeys();

console.log("\nAdd these to Render → Environment:\n");
console.log("VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
console.log("VAPID_SUBJECT=mailto:builtwilt@icloud.com\n");
console.log("Public Key:");
console.log(keys.publicKey);
console.log("\nPrivate Key (keep secret):");
console.log(keys.privateKey);
console.log("");
