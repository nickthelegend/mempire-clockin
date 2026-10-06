#!/bin/bash
# Screenshot the project simulator: scripts/shot.sh <name>  -> $SHOTS/<name>.png (+ a small preview)
# simctl cannot write to the external volume directly, so it goes via /private/tmp.
UDID="${SIM_UDID:-91D81975-0680-40B8-92D2-725D726953AF}"
OUT="${SHOTS:-/Volumes/Extreme SSD/Projects/clockin/.cache/mempire-shots}"
mkdir -p "$OUT"
T="/private/tmp/claude-501/mempire-shot-$$.png"
mkdir -p "$(dirname "$T")"
xcrun simctl io "$UDID" screenshot "$T" >/dev/null 2>&1 || exit 1
cat "$T" > "$OUT/$1.png"
sips -Z 820 "$T" --out "$OUT/$1-s.png" >/dev/null
rm -f "$T"
echo "$OUT/$1-s.png"
