#!/usr/bin/env bash
# Renders every listing asset in clockin/store/ from the HTML templates in this folder,
# with headless Chrome. No network, no build: the templates only read files next to them.
#
#   bash clockin/store/src/render.sh
#
# Needs Google Chrome and python3 with Pillow (for the final resize/size checks).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$(cd "$HERE/.." && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

shoot() { # url width height out
  # Chrome writes the screenshot and then sometimes lingers, so run it in the background,
  # wait for the file, and stop it ourselves.
  rm -f "$4"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --user-data-dir="$TMP/profile" \
    --window-size="$2,$3" --screenshot="$4" "$1" >/dev/null 2>&1 &
  local pid=$! i
  for i in $(seq 1 60); do
    if [ -s "$4" ] && ! kill -0 "$pid" 2>/dev/null; then break; fi
    if [ -s "$4" ]; then sleep 1; kill "$pid" 2>/dev/null || true; break; fi
    sleep 0.5
  done
  wait "$pid" 2>/dev/null || true
  [ -s "$4" ] || { echo "render failed: $1" >&2; exit 1; }
}

mkdir -p "$OUT/screenshots"
for n in 1 2 3 4 5 6; do
  shoot "file://$HERE/shot.html#$n" 1080 2400 "$TMP/shot-$n.png"
done
shoot "file://$HERE/icon.html#store" 1024 1024 "$TMP/icon-1024.png"
shoot "file://$HERE/icon.html#background" 1024 1024 "$TMP/adaptive-background.png"
shoot "file://$HERE/banner.html#banner" 1200 600 "$TMP/banner.png"
shoot "file://$HERE/banner.html#feature" 1200 1200 "$TMP/feature.png"

python3 "$HERE/finish.py" "$TMP" "$OUT"
