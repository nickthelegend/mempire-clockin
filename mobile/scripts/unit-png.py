#!/usr/bin/env python3
"""PNG copies of the keyed card art for the native 3D arena.

expo-gl decodes texture images with stb_image, which reads PNG/JPEG but not
WebP — a WebP handed to gl.texSubImage2D decodes to NULL and crashes the GL
thread. The 2D UI keeps the WebP art; the arena's unit sprites use these:
256 px wide, palette-quantised RGBA PNGs (small enough to bundle all 64).

    python3 scripts/unit-png.py assets/game assets/units
"""
import sys
from pathlib import Path
from PIL import Image

src = Path(sys.argv[1] if len(sys.argv) > 1 else 'assets/game')
dst = Path(sys.argv[2] if len(sys.argv) > 2 else 'assets/units')
dst.mkdir(parents=True, exist_ok=True)
files = sorted(src.glob('card_*.webp')) + [src / 'avatar_guest.webp']
for f in files:
    im = Image.open(f).convert('RGBA')
    w = 256
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    q = im.quantize(colors=128, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    q.save(dst / (f.stem.replace('card_', 'unit_') + '.png'), optimize=True)
print(f'wrote {len(files)} unit PNGs to {dst}')
