#!/bin/bash
# Start HoopComps
cd "$(dirname "$0")"

NODE=""
NPM=""
for candidate in \
  "/Volumes/Cursor Installer/Cursor.app/Contents/Resources/app/resources/helpers/node" \
  "/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node" \
  "$(command -v node 2>/dev/null)"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    NODE="$candidate"
    NPM="$(dirname "$candidate")/npm"
    [ -x "$NPM" ] || NPM="$(command -v npm 2>/dev/null)"
    break
  fi
done

if [ -z "$NODE" ]; then
  echo "  Could not find Node.js — install from https://nodejs.org"
  exit 1
fi

if [ ! -d node_modules ] && [ -n "$NPM" ] && [ -x "$NPM" ]; then
  echo "  First run — installing dependencies for multi-user accounts..."
  "$NPM" install
fi

PORT=3847
if lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "  HoopComps already running → http://localhost:$PORT"
  exit 0
fi

echo "  Starting HoopComps at http://localhost:$PORT"
exec "$NODE" server.mjs
