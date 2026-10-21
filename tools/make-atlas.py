#!/usr/bin/env python3
"""Build the MFGA icon atlas from the original Facebook sprite sheets.

Inputs (committed):
  assets/sprites/fb-2009-ejni29l8.png    - Dec 2009 sprite (logo + icons)
  assets/sprites/fb-2012-Mj5nS9bWTJX.png - Feb 2012 icon strip
  assets/reference/2010-home.png         - 2010 home page capture (header logo + jewels)
  assets/icons.json                      - name -> {sheet, x, y, w, h} crop boxes

Outputs (committed, consumed by the JS build):
  src/generated/atlas.png   - packed RGBA atlas
  src/generated/atlas.json  - name -> {x, y, w, h} inside the atlas
  src/generated/atlas.js    - the same as an ES module with the PNG inlined as a data: URL

Requires Pillow (pip install pillow). Run: python3 tools/make-atlas.py
"""
import base64
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = os.path.join(ROOT, "assets", "sprites")
OUT_DIR = os.path.join(ROOT, "src", "generated")

BAR = (59, 89, 152)          # #3B5998, the 2010 blue bar
JEWEL_OFF = (43, 66, 127)    # unlit jewel, measured from the 2010 capture
JEWEL_ON = (147, 186, 226)   # lit jewel, measured from the 2010 capture


def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def crop_sprites(spec):
    sheets = {}
    out = {}
    for name, box in spec.items():
        sheet = box["sheet"]
        if sheet not in sheets:
            sheets[sheet] = Image.open(os.path.join(SPRITES, sheet)).convert("RGBA")
        im = sheets[sheet]
        out[name] = im.crop((box["x"], box["y"], box["x"] + box["w"], box["y"] + box["h"]))
    return out


def recolor_messages(icon):
    """The 2012 Messages icon has an orange back bubble; 2010's was pink/magenta."""
    light_from, light_to = (253, 193, 129), (231, 189, 210)
    dark_from, dark_to = (202, 92, 24), (212, 103, 175)
    out = icon.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a == 0 or not (r > b + 30 and r > 120):
                continue
            # interpolate between the dark and light anchors by luminance
            l0, l1 = lum(dark_from), lum(light_from)
            t = max(0.0, min(1.0, (lum((r, g, b)) - l0) / (l1 - l0)))
            px[x, y] = tuple(round(dark_to[i] + (light_to[i] - dark_to[i]) * t) for i in range(3)) + (a,)
    return out


def mask_from_capture(cap, x0, y0, x1, y1, darker):
    """Extract a jewel silhouette from the 2010 capture as an alpha mask (list of rows of 0..255)."""
    bl = lum(BAR)
    rows = []
    for y in range(y0, y1 + 1):
        row = []
        for x in range(x0, x1 + 1):
            p = cap.getpixel((x, y))
            d = (bl - lum(p)) if darker else (lum(p) - bl)
            # the capture is palette-dithered; ignore faint noise, saturate solid pixels
            a = 0 if d < 6 else min(255, int(255 * d / 14))
            row.append(a)
        rows.append(row)
    return rows


def paint_mask(rows, color):
    h, w = len(rows), len(rows[0])
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = im.load()
    for y in range(h):
        for x in range(w):
            if rows[y][x]:
                px[x, y] = color + (rows[y][x],)
    return im


def globe_mask(globe):
    """Turn the 2012 globe icon into a jewel-style silhouette: ocean opaque, continents cut out."""
    rows = []
    for y in range(globe.height):
        row = []
        for x in range(globe.width):
            r, g, b, a = globe.getpixel((x, y))
            if a < 40:
                row.append(0)
            elif lum((r, g, b)) > 150:   # light continents -> holes, like the 2010 jewel
                row.append(0)
            else:
                row.append(a)
        rows.append(row)
    return rows


def header_logo(cap):
    """The 2010 header wordmark, white on transparent, recovered from the capture."""
    x0, y0, x1, y1 = 8, 15, 95, 33
    bl = lum(BAR)
    im = Image.new("RGBA", (x1 - x0 + 1, y1 - y0 + 1), (255, 255, 255, 0))
    px = im.load()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            t = (lum(cap.getpixel((x, y))) - bl) / (255 - bl)
            a = 0 if t < 0.12 else min(1.0, t)
            px[x - x0, y - y0] = (255, 255, 255, int(round(a * 255)))
    return im


def recolor_offline_dot(icon):
    """2012 marks offline with a red dot; 2010 used a grey one."""
    out = icon.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width - 7, out.width):
            r, g, b, a = px[x, y]
            if a and r > g + 60 and r > b + 60:
                v = round(0x7A * (lum((r, g, b)) / lum((230, 20, 20))))
                v = max(0x5A, min(0x9A, v))
                px[x, y] = (v, v, v, a)
    return out


def key_out_white(cap, x0, y0, x1, y1):
    """Crop an icon from the white-background 2010 capture, turning the white into alpha.

    Each pixel is treated as icon colour C composited over white with coverage a:
    p = a*C + (1-a)*255. Using the darkest channel as the coverage estimate keeps
    colour intact on solid pixels and fades anti-aliased edges instead of leaving a halo.
    """
    im = Image.new("RGBA", (x1 - x0 + 1, y1 - y0 + 1), (0, 0, 0, 0))
    px = im.load()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            r, g, b = cap.getpixel((x, y))[:3]
            a = (255 - min(r, g, b)) / 255.0
            if a < 0.08:
                continue
            col = tuple(max(0, min(255, round((c - (1 - a) * 255) / a))) for c in (r, g, b))
            px[x - x0, y - y0] = col + (int(round(a * 255)),)
    return im


def close_x():
    """The 8x7 grey close glyph of the 2010 right column, transcribed from the capture."""
    rows = ["+#+..+#+", "+##++##+", ".+####+.", "..+##+..", ".+####+.", "+##++##+", "+#+..+#+"]
    im = Image.new("RGBA", (8, 7), (0, 0, 0, 0))
    px = im.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == "#":
                px[x, y] = (0x99, 0x99, 0x99, 255)
            elif ch == "+":
                px[x, y] = (0x99, 0x99, 0x99, 110)
    return im


def pack(images, width=256, pad=1):
    """Simple shelf packer: tallest first."""
    order = sorted(images.items(), key=lambda kv: (-kv[1].height, -kv[1].width, kv[0]))
    x = y = shelf = 0
    pos = {}
    for name, im in order:
        if x + im.width > width:
            x = 0
            y += shelf + pad
            shelf = 0
        pos[name] = (x, y)
        x += im.width + pad
        shelf = max(shelf, im.height)
    height = y + shelf
    atlas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    meta = {}
    for name, im in images.items():
        px, py = pos[name]
        atlas.paste(im, (px, py))
        meta[name] = {"x": px, "y": py, "w": im.width, "h": im.height}
    return atlas, dict(sorted(meta.items()))


def main():
    spec = json.load(open(os.path.join(ROOT, "assets", "icons.json")))
    icons = crop_sprites(spec)
    icons["nav_messages"] = recolor_messages(icons["nav_messages"])

    cap = Image.open(os.path.join(ROOT, "assets", "reference", "2010-home.png")).convert("RGB")
    req = mask_from_capture(cap, 108, 17, 124, 32, darker=True)
    msg = mask_from_capture(cap, 131, 18, 150, 32, darker=True)
    glb = globe_mask(icons["nav_globe"])
    for name, rows in (("jewel_requests", req), ("jewel_messages", msg), ("jewel_notifications", glb)):
        icons[name + "_off"] = paint_mask(rows, JEWEL_OFF)
        icons[name + "_on"] = paint_mask(rows, JEWEL_ON)
    icons["logo_header"] = header_logo(cap)
    icons["chat_offline"] = recolor_offline_dot(icons["chat_offline"])

    # 2010 icons that exist in neither sprite sheet, recovered from the capture.
    icons["nav_games_2010"] = key_out_white(cap, 13, 270, 29, 286)
    icons["misc_more_arrow"] = key_out_white(cap, 112, 295, 120, 303)
    icons["misc_close"] = close_x()
    icons["search_glass"] = key_out_white(cap, 472, 19, 485, 31)

    atlas, meta = pack(icons)
    os.makedirs(OUT_DIR, exist_ok=True)
    png_path = os.path.join(OUT_DIR, "atlas.png")
    atlas.save(png_path, optimize=True)
    with open(os.path.join(OUT_DIR, "atlas.json"), "w") as f:
        json.dump({"width": atlas.width, "height": atlas.height, "icons": meta}, f, indent=1)
        f.write("\n")
    # Plain ES module so both the bundler and node unit tests can import the atlas without loaders.
    b64 = base64.b64encode(open(png_path, "rb").read()).decode("ascii")
    with open(os.path.join(OUT_DIR, "atlas.js"), "w") as f:
        f.write("// Generated by tools/make-atlas.py - do not edit.\n")
        f.write(f"export const ATLAS_SIZE = {{ width: {atlas.width}, height: {atlas.height} }};\n")
        f.write(f"export const ICONS = {json.dumps(meta, separators=(',', ':'))};\n")
        f.write(f'export const ATLAS_URL = "data:image/png;base64,{b64}";\n')
    print(f"atlas {atlas.width}x{atlas.height}, {len(meta)} icons -> {OUT_DIR}", file=sys.stderr)


if __name__ == "__main__":
    main()
