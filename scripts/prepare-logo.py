#!/usr/bin/env python3
"""Remove tagline, recenter artwork, and rebuild the master HoopComps logo."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "public" / "icons"
SOURCE = ROOT / "hoopcomps-logo-source.png"
OUTPUT = ROOT / "hoopcomps-logo.png"
BG = (0, 0, 0, 255)

# Pixels below this row are the tagline + decorative lines.
TAGLINE_CROP_Y = 386
CANVAS = 500
FILL_RATIO = 0.94


def prepare_master_logo() -> None:
    src_path = SOURCE if SOURCE.exists() else OUTPUT
    img = Image.open(src_path).convert("RGBA")

    trimmed = img.crop((0, 0, img.width, TAGLINE_CROP_Y))
    bbox = trimmed.getbbox()
    if not bbox:
        raise SystemExit("Could not detect logo content bounds.")

    content = trimmed.crop(bbox)
    inner = round(CANVAS * FILL_RATIO)
    content.thumbnail((inner, inner), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS, CANVAS), BG)
    x = (CANVAS - content.width) // 2
    y = (CANVAS - content.height) // 2
    canvas.paste(content, (x, y), content)

    rgb = Image.new("RGB", canvas.size, BG[:3])
    rgb.paste(canvas, mask=canvas.split()[3])
    rgb.save(OUTPUT, "PNG", optimize=True)
    print(f"  {OUTPUT.name} ({CANVAS}×{CANVAS}, tagline removed, centered at {FILL_RATIO:.0%} fill)")


if __name__ == "__main__":
    prepare_master_logo()
