"""One-off: cut the brand art in clockin/store/src/art/ out of the original renders.

The outputs are committed, so render.sh never needs this. It is here so the cutouts can be
re-made (or re-tuned) from the sources:

  python3 clockin/store/src/prep_art.py <design/generated dir> [<mobile/assets/icon.png from before Oct 7>]

  * design/generated/ (gitignored; it lives in the original Mempire project) holds
    logo_wordmark.png (1344x752 on black), bg_quilt.png and card_<ticker>.png (880x1168 on magenta).
  * The crown comes from the pre-store-kit 1024 app icon (gold crown on a blue tile with a baked
    rounded frame): the tile is flood-filled away from its edges, the crown's black outline stops it.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

GEN = sys.argv[1]
OLD_ICON = sys.argv[2] if len(sys.argv) > 2 else None
ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "art")
FIGHTERS = ["sol", "btc", "doge", "bonk", "shib"]  # no fighter that carries a third-party brand mark


def crown_from_icon(path: str) -> Image.Image:
    src = Image.open(path).convert("RGB")
    im = np.asarray(src).astype(int)
    r, b = im[..., 0], im[..., 2]
    mx = im.max(-1)
    passable = ~((mx < 30) & (b - r < 20)) & ~(r > b + 30)  # not outline, not gold
    m = Image.fromarray((passable * 255).astype(np.uint8), "L").copy()
    for t in range(64, 960, 16):
        for s in [(t, 64), (t, 960), (64, t), (960, t)]:
            if m.getpixel(s) == 255:
                ImageDraw.floodfill(m, s, 128)
    alpha = np.where(np.array(m) == 128, 0, 255).astype(np.uint8)
    alpha[:58, :] = 0; alpha[-58:, :] = 0; alpha[:, :58] = 0; alpha[:, -58:] = 0
    a = Image.fromarray(alpha, "L").copy().filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    blob = a.point(lambda v: 255 if v > 127 else 0).copy()
    ImageDraw.floodfill(blob, (512, 640), 128)  # keep only the crown itself
    keep = np.where(np.array(blob) == 128, 255, 0).astype(np.uint8)
    out = src.convert("RGBA")
    out.putalpha(Image.fromarray(keep, "L").copy().filter(ImageFilter.GaussianBlur(0.8)))
    return out.crop(out.getbbox())


def wordmark(path: str) -> Image.Image:
    """Letters and crown opaque; the lightning glow 'unscreened' off black so it blends on blue."""
    src = Image.open(path).convert("RGB")
    im = np.asarray(src).astype(float)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    gold = (r > 150) & (g > 90) & (b < 140) & (r > b + 60)
    G = Image.fromarray((gold * 255).astype(np.uint8)).copy()
    G = G.filter(ImageFilter.MinFilter(11)).filter(ImageFilter.MaxFilter(11))  # drop sparkles
    H = G.filter(ImageFilter.MaxFilter(25)).copy()  # take in the dark letter outline
    ImageDraw.floodfill(H, (0, 0), 128)
    solid = np.array(H) != 128
    sa = np.asarray(Image.fromarray((solid * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(float) / 255
    a = np.maximum(sa, np.clip(im.max(-1) / 255 * 1.15, 0, 1))
    rgb = np.clip(im / np.maximum(a[..., None], 1e-3), 0, 255)
    out = Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), "RGBA")
    al = np.asarray(out)[..., 3]
    ys, xs = np.where(al > 8)
    return out.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def fighter(path: str) -> Image.Image:
    im = np.asarray(Image.open(path).convert("RGB")).astype(float)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    key = np.clip(((np.minimum(r, b) - g) - 60) / 90, 0, 1)
    A = Image.fromarray(((1 - key) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    a = np.asarray(A).astype(float) / 255
    lim = np.maximum(g, (r + b) / 2 * 0.85) + 20  # despill the magenta fringe
    rgb = im.copy()
    rgb[..., 0] = np.where(a < 0.98, np.minimum(r, lim), r)
    rgb[..., 2] = np.where(a < 0.98, np.minimum(b, lim), b)
    out = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8), "RGBA")
    out = out.crop(out.getbbox())
    out.thumbnail((600, 640), Image.LANCZOS)
    return out


if OLD_ICON:
    crown_from_icon(OLD_ICON).save(os.path.join(ART, "crown.png"), optimize=True)
wordmark(os.path.join(GEN, "logo_wordmark.png")).save(os.path.join(ART, "wordmark.png"), optimize=True)
Image.open(os.path.join(GEN, "bg_quilt.png")).convert("RGB").save(os.path.join(ART, "quilt.jpg"), quality=88)
for t in FIGHTERS:
    fighter(os.path.join(GEN, f"card_{t}.png")).save(os.path.join(ART, f"fighter_{t}.png"), optimize=True)
print("ok")
