#!/usr/bin/env python3
"""Extension/userscript icons: the Like thumb from the original 2012 sprite, pixels and colours untouched,
scaled up nearest-neighbour onto a 2010 UFI-blue (#EDEFF4) tile with a #3B5998 border.

Writes assets/icons/icon-{16,32,48,128}.png. Requires Pillow. Run: python3 tools/make-icons.py
"""
import json
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLUE = (59, 89, 152, 255)
UFI = (237, 239, 244, 255)


def thumb():
    box = json.load(open(os.path.join(ROOT, "assets", "icons.json")))["ufi_like_big"]
    sheet = Image.open(os.path.join(ROOT, "assets", "sprites", box["sheet"])).convert("RGBA")
    return sheet.crop((box["x"], box["y"], box["x"] + box["w"], box["y"] + box["h"]))


def main():
    t = thumb()
    out_dir = os.path.join(ROOT, "assets", "icons")
    os.makedirs(out_dir, exist_ok=True)
    for size in (16, 32, 48, 128):
        im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(im).rounded_rectangle(
            [0, 0, size - 1, size - 1], radius=max(2, size // 8), fill=UFI, outline=BLUE, width=max(1, size // 32)
        )
        scale = max(1, int(size * 0.72 / max(t.width, t.height)))
        s = t.resize((t.width * scale, t.height * scale), Image.NEAREST)
        im.alpha_composite(s, ((size - s.width) // 2, (size - s.height) // 2))
        im.save(os.path.join(out_dir, f"icon-{size}.png"), optimize=True)


if __name__ == "__main__":
    main()
