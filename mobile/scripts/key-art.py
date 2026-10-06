#!/usr/bin/env python3
"""Chroma-key the fighter card art for the native app.

The card art is rendered on a flat magenta (#ff00ff) backdrop; the web client
keys it out at runtime on a canvas (app/src/lib/chromaKey.ts). React Native
has no canvas, so the same key is applied once at build time: pixels within
the same tolerance of magenta become transparent, and the magenta fringe on
anti-aliased edges is pulled back toward neutral (despill).

    python3 scripts/key-art.py assets/game   # rewrites card_*.webp in place
"""
import sys
from pathlib import Path
from PIL import Image

TOL = 78
WIDTH = 360  # cards render at <= 120pt wide; 3x is plenty


def key(path: Path) -> None:
    im = Image.open(path).convert('RGBA')
    if im.width > WIDTH:
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d2 = (r - 255) ** 2 + g ** 2 + (b - 255) ** 2
            if d2 < TOL * TOL:
                px[x, y] = (0, 0, 0, 0)
            elif r > g + 40 and b > g + 40:
                # magenta fringe: soften alpha, neutralise the tint
                m = min(r, b)
                fringe = max(0, min(1, (m - g) / 255))
                px[x, y] = (min(r, g + 30), g, min(b, g + 30), int(a * (1 - 0.6 * fringe)))
    im.save(path, 'WEBP', quality=86, method=6)


if __name__ == '__main__':
    root = Path(sys.argv[1] if len(sys.argv) > 1 else 'assets/game')
    files = sorted(root.glob('card_*.webp'))
    for f in files:
        key(f)
    print(f'keyed {len(files)} cards')
