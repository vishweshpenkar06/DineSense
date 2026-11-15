#!/usr/bin/env python3
"""Generate DineSense PWA icons (table + four chairs) with Pillow."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "apps" / "web" / "public" / "icons"
BG = (2, 6, 23, 255)
EMERALD = (16, 185, 129, 255)
DARK = (6, 78, 59, 255)


def draw_icon(size: int, maskable: bool = False) -> Image.Image:
    scale = 4
    canvas = Image.new("RGBA", (size * scale, size * scale), BG)
    draw = ImageDraw.Draw(canvas)
    center = size * scale / 2
    motif = 0.36 if not maskable else 0.29
    table_radius = size * scale * motif * 0.62
    chair_radius = size * scale * motif * 0.19
    orbit = size * scale * motif * 0.95

    for angle in (0, 90, 180, 270):
        import math

        radians = math.radians(angle)
        x = center + orbit * math.cos(radians)
        y = center + orbit * math.sin(radians)
        draw.ellipse(
            (x - chair_radius, y - chair_radius, x + chair_radius, y + chair_radius),
            fill=EMERALD,
        )

    draw.ellipse(
        (center - table_radius, center - table_radius, center + table_radius, center + table_radius),
        fill=EMERALD,
    )
    inner = table_radius * 0.55
    draw.ellipse((center - inner, center - inner, center + inner, center + inner), fill=DARK)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    draw_icon(192).save(OUT / "icon-192.png")
    draw_icon(512).save(OUT / "icon-512.png")
    draw_icon(512, maskable=True).save(OUT / "icon-maskable-512.png")
    draw_icon(180).convert("RGB").save(OUT / "apple-touch-icon.png")
    print(f"wrote icons to {OUT}")


if __name__ == "__main__":
    main()
