#!/bin/bash
# Generate VAPID keys using Node (finds Cursor's bundled node if `node` isn't in PATH)
cd "$(dirname "$0")/.."

NODE=""
for candidate in \
  "/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node" \
  "/Volumes/Cursor Installer/Cursor.app/Contents/Resources/app/resources/helpers/node" \
  "$(command -v node 2>/dev/null)"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    NODE="$candidate"
    break
  fi
done

if [ -z "$NODE" ]; then
  echo ""
  echo "  Could not find Node.js."
  echo "  Install from https://nodejs.org — or run this from Cursor's integrated terminal."
  echo ""
  exit 1
fi

exec "$NODE" scripts/generate-vapid-keys.mjs
