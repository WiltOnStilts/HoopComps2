#!/usr/bin/env python3
"""Remove tagline, enlarge HOOPCOMPS text, and center the logo artwork."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "public" / "icons"
SOURCE = ROOT / "hoopcomps-logo-source.png"
OUTPUT = ROOT / "hoopcomps-logo.png"
BG = (0, 0, 0, 255)

TAGLINE_CROP_Y = 386
GRAPHIC_BOTTOM_Y = 332
TEXT_TOP_Y = 328
CANVAS = 500
TEXT_SCALE = 1.42
GRAPHIC_SCALE = 1.06
GAP_PX = 10


def prepare_master_logo() -> None:
    src_path = SOURCE if SOURCE.exists() else OUTPUT
    img = Image.open(src_path).convert("RGBA")

    trimmed = img.crop((0, 0, img.width, TAGLINE_CROP_Y))
    graphic = trimmed.crop((0, 0, trimmed.width, GRAPHIC_BOTTOM_Y))
    text_band = trimmed.crop((0, TEXT_TOP_Y, trimmed.width, TAGLINE_CROP_Y))

    g_w = round(graphic.width * GRAPHIC_SCALE)
    g_h = round(graphic.height * GRAPHIC_SCALE)
    graphic = graphic.resize((g_w, g_h), Image.Resampling.LANCZOS)

    t_w = round(text_band.width * TEXT_SCALE)
    t_h = round(text_band.height * TEXT_SCALE)
    text_band = text_band.resize((t_w, t_h), Image.Resampling.LANCZOS)

    stack_h = graphic.height + GAP_PX + text_band.height
    stack_w = max(graphic.width, text_band.width)
    inner = min(round(CANVAS * 0.96), max(stack_w, stack_h))

    if stack_w > inner or stack_h > inner:
        scale = min(inner / stack_w, inner / stack_h)
        graphic = graphic.resize(
            (max(1, round(graphic.width * scale)), max(1, round(graphic.height * scale))),
            Image.Resampling.LANCZOS,
        )
        text_band = text_band.resize(
            (max(1, round(text_band.width * scale)), max(1, round(text_band.height * scale))),
            Image.Resampling.LANCZOS,
        )
        stack_h = graphic.height + GAP_PX + text_band.height
        stack_w = max(graphic.width, text_band.width)

    stack = Image.new("RGBA", (stack_w, stack_h), (0, 0, 0, 0))
    stack.paste(graphic, ((stack_w - graphic.width) // 2, 0), graphic)
    text_y = graphic.height + GAP_PX
    stack.paste(text_band, ((stack_w - text_band.width) // 2, text_y), text_band)

    canvas = Image.new("RGBA", (CANVAS, CANVAS), BG)
    x = (CANVAS - stack.width) // 2
    y = (CANVAS - stack.height) // 2
    canvas.paste(stack, (x, y), stack)

    rgb = Image.new("RGB", canvas.size, BG[:3])
    rgb.paste(canvas, mask=canvas.split()[3])
    rgb.save(OUTPUT, "PNG", optimize=True)
    print(
        f"  {OUTPUT.name} ({CANVAS}×{CANVAS}, tagline removed, text {TEXT_SCALE:.0%} larger, centered)"
    )


if __name__ == "__main__":
    prepare_master_logo()
