"""Second half of render.sh: resize, cut the adaptive-icon layers, check sizes.

Writes the listing assets to clockin/store/ and the launcher/splash art to mobile/assets/.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

TMP, OUT = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(OUT, "..", "..", "mobile", "assets"))
MAX_BYTES = 3 * 1024 * 1024  # Publisher Portal: jpg/png/webp, 3 MB max per preview image

NAMES = {1: "arena", 2: "clock-in", 3: "battle", 4: "ai-coach", 5: "chests", 6: "devnet"}


def save_preview(img: Image.Image, stem: str) -> str:
    """PNG if it fits under the portal's 3 MB cap, otherwise a high-quality JPEG."""
    png = stem + ".png"
    img.save(png, optimize=True)
    if os.path.getsize(png) <= MAX_BYTES:
        return png
    os.remove(png)
    jpg = stem + ".jpg"
    img.convert("RGB").save(jpg, quality=92, subsampling=0, optimize=True)
    return jpg


written = []

# Screenshots, 1080x2400 portrait (the portal asks for 1080x2400, minimum 4).
for n, name in NAMES.items():
    img = Image.open(os.path.join(TMP, f"shot-{n}.png")).convert("RGB")
    assert img.size == (1080, 2400), img.size
    for ext in (".png", ".jpg"):
        old = os.path.join(OUT, "screenshots", f"{n:02d}-{name}{ext}")
        if os.path.exists(old):
            os.remove(old)
    written.append(save_preview(img, os.path.join(OUT, "screenshots", f"{n:02d}-{name}")))

# Store icon 512x512, and the 1024 app icon (opaque, full bleed: iOS rejects alpha in the app icon).
icon = Image.open(os.path.join(TMP, "icon-1024.png")).convert("RGB")
icon.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "icon-512.png"), optimize=True)
icon.save(os.path.join(ASSETS, "icon.png"), optimize=True)
written += [os.path.join(OUT, "icon-512.png"), os.path.join(ASSETS, "icon.png")]

# Adaptive icon. Background: rendered quilt + glow. Foreground: the crown alone on transparency,
# sized to sit inside the 66% safe zone so circle, squircle and teardrop masks never clip it.
bg = Image.open(os.path.join(TMP, "adaptive-background.png")).convert("RGB")
bg.save(os.path.join(ASSETS, "android-icon-background.png"), optimize=True)

crown = Image.open(os.path.join(HERE, "art", "crown.png")).convert("RGBA")
w = 560
crown_s = crown.resize((w, round(crown.height * w / crown.width)), Image.LANCZOS)
fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
pos = ((1024 - crown_s.width) // 2, (1024 - crown_s.height) // 2 + 8)
shadow = Image.new("RGBA", fg.size, (0, 0, 0, 0))
sh_alpha = crown_s.getchannel("A").point(lambda a: a * 0.45)
shadow.paste(Image.new("RGBA", crown_s.size, (4, 10, 32, 255)), (pos[0], pos[1] + 14), sh_alpha)
fg = Image.alpha_composite(fg, shadow.filter(ImageFilter.GaussianBlur(10)))
fg.alpha_composite(crown_s, pos)
fg.save(os.path.join(ASSETS, "android-icon-foreground.png"), optimize=True)

# Monochrome (Android 13 themed icon, and the notification small icon via expo-notifications):
# the crown silhouette with the gem punched out so it still reads as the Mempire crown at 24 dp.
a = np.asarray(crown_s.getchannel("A")).astype(float) / 255
rgb = np.asarray(crown_s.convert("RGB")).astype(int)
gem = (rgb[..., 2] > rgb[..., 1] + 40) & (rgb[..., 0] > 90) & (a > 0.9)
hh, ww = gem.shape  # the gem sits in the middle of the band; ignore purple glow on the rim
centre = np.zeros_like(gem)
centre[int(hh * 0.30):int(hh * 0.85), int(ww * 0.33):int(ww * 0.67)] = True
gem &= centre
gem_img = Image.fromarray((gem * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1))
mono_a = np.clip(a - np.asarray(gem_img).astype(float) / 255, 0, 1)
mono = Image.new("RGBA", crown_s.size, (255, 255, 255, 0))
mono.putalpha(Image.fromarray((mono_a * 255).astype(np.uint8)))
mono_full = Image.new("RGBA", (1024, 1024), (255, 255, 255, 0))
mono_full.alpha_composite(mono, pos)
mono_full.save(os.path.join(ASSETS, "android-icon-monochrome.png"), optimize=True)

# Splash: the wordmark at 1232 px wide (it was 512, upscaled ~1.8x on an xxxhdpi screen at 260 dp).
Image.open(os.path.join(HERE, "art", "wordmark.png")).save(os.path.join(ASSETS, "splash-icon.png"), optimize=True)
written += [os.path.join(ASSETS, f) for f in ("android-icon-background.png", "android-icon-foreground.png",
                                              "android-icon-monochrome.png", "splash-icon.png")]

# Banner (required by the portal) and the legacy feature graphic.
for src, dst, size in (("banner.png", "banner-1200x600", (1200, 600)), ("feature.png", "feature-1200x1200", (1200, 1200))):
    img = Image.open(os.path.join(TMP, src)).convert("RGB")
    assert img.size == size, img.size
    written.append(save_preview(img, os.path.join(OUT, dst)))

for p in written:
    im = Image.open(p)
    print(f"{os.path.relpath(p, os.path.join(OUT, '..', '..')):58s} {im.size[0]}x{im.size[1]} {im.mode:5s} {os.path.getsize(p) / 1024:7.0f} KB")
