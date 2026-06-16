#!/bin/bash
# Double-click this file in Finder to start DynastyDraft (after Node.js is installed)

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js is not installed."
  echo ""
  echo "  1. Open https://nodejs.org in your browser"
  echo "  2. Download the LTS version (green button)"
  echo "  3. Run the installer, then close and reopen Terminal"
  echo "  4. Run this script again (or: node server.mjs)"
  echo ""
  read -p "Press Enter to close..."
  exit 1
fi

echo ""
echo "  DynastyDraft — http://localhost:3850"
echo "  Press Ctrl+C to stop the server"
echo ""

node server.mjs
