#!/usr/bin/env python3
"""Build PWA / Home Screen icons with safe-zone padding (no edge clipping)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "public" / "icons"
SOURCE = ROOT / "hoopcomps-logo.png"
BG = (0, 0, 0, 255)

# Trimmed logo has no tagline — artwork can fill more of the icon safely.
STANDARD_RATIO = 0.95
APPLE_RATIO = 0.97
MASKABLE_RATIO = 0.82


def render_icon(size: int, content_ratio: float, filename: str) -> None:
    src = Image.open(SOURCE).convert("RGBA")
    inner = round(size * content_ratio)
    src.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), BG)
    x = (size - src.width) // 2
    y = (size - src.height) // 2
    canvas.paste(src, (x, y), src)
    rgb = Image.new("RGB", canvas.size, BG[:3])
    rgb.paste(canvas, mask=canvas.split()[3])
    rgb.save(ROOT / filename, "PNG", optimize=True)
    print(f"  {filename} ({size}×{size}, {round(content_ratio * 100)}% artwork)")


def main() -> None:
    print(f"Generating app icons from {SOURCE.name} …")
    render_icon(512, STANDARD_RATIO, "icon-512.png")
    render_icon(192, STANDARD_RATIO, "icon-192.png")
    render_icon(180, APPLE_RATIO, "apple-touch-icon.png")
    render_icon(512, MASKABLE_RATIO, "icon-maskable-512.png")
    print("Done.")


if __name__ == "__main__":
    main()
