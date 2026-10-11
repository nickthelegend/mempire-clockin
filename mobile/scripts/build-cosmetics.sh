#!/bin/sh
# Cosmetic art: transparent PNG masters in art-src/cosmetics -> WebP at the
# size the app actually draws them, in assets/cosmetics (what the bundle
# requires). The masters never enter the bundle.
#   sh scripts/build-cosmetics.sh        (from mobile/)
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$HERE/art-src/cosmetics"
OUT="$HERE/assets/cosmetics"
size_for() {
  case "$1" in
    frames) echo "0 420" ;;      # portrait frames: keep the shape, 420 px tall
    characters) echo "320 0" ;;  # coach / ghost / trophy heroes
    emotes|rewards) echo "256 0" ;;
    features|ui) echo "160 0" ;;
    *) echo "256 0" ;;
  esac
}
for dir in "$SRC"/*/; do
  group="$(basename "$dir")"
  mkdir -p "$OUT/$group"
  set -- $(size_for "$group")
  for png in "$dir"*.png; do
    name="$(basename "$png" .png)"
    cwebp -quiet -q 84 -alpha_q 92 -m 6 -resize "$1" "$2" "$png" -o "$OUT/$group/$name.webp"
  done
done
du -sh "$OUT" | awk '{print "cosmetics: " $1}'
