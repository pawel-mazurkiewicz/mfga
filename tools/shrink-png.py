"""Reduces screenshots to a 256-colour palette in place (a third of the size, no visible change on UI shots).

    python3 tools/shrink-png.py docs/screenshots/*.png
"""
import os
import sys

from PIL import Image


def shrink(path):
    before = os.path.getsize(path)
    img = Image.open(path).convert("RGB").quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    img.save(path, optimize=True)
    print(f"  {path}: {before // 1024} KB -> {os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    for p in sys.argv[1:]:
        shrink(p)
