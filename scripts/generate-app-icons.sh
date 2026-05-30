#!/bin/bash
# Trim tagline from master logo, then regenerate PWA icons with safe-zone padding.
cd "$(dirname "$0")/.."

if [ ! -d .venv-icons ]; then
  python3 -m venv .venv-icons
  .venv-icons/bin/pip install -q pillow
fi

.venv-icons/bin/python scripts/prepare-logo.py
exec .venv-icons/bin/python scripts/generate-app-icons.py
