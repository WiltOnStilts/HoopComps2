#!/bin/bash
# Regenerate PWA icons with safe-zone padding (uses local venv + Pillow).
cd "$(dirname "$0")/.."

if [ ! -d .venv-icons ]; then
  python3 -m venv .venv-icons
  .venv-icons/bin/pip install -q pillow
fi

exec .venv-icons/bin/python scripts/generate-app-icons.py
