#!/bin/bash
# Fast iteration on JS-only changes: re-bundle the JS (Hermes off: the Release
# app runs a plain JS bundle in this setup) into the already-built simulator
# .app and reinstall it. No xcodebuild, so no native-build lock needed.
# Use scripts/ios-sim.sh after any native/dependency change.
set -eo pipefail
UDID="${SIM_UDID:-91D81975-0680-40B8-92D2-725D726953AF}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "/Volumes/Extreme SSD/Projects/clockin/env.sh" ] && source "/Volumes/Extreme SSD/Projects/clockin/env.sh"
APP="${APP:-${CLOCKIN_DERIVED_DATA:-$HERE/ios/build}/mempire/Build/Products/Release-iphonesimulator/Mempire.app}"
[ -d "$APP" ] || { echo "no built app at $APP - run scripts/ios-sim.sh first"; exit 1; }
cd "$HERE"
npx expo export:embed --platform ios --dev false --entry-file index.ts \
  --bundle-output "$APP/main.jsbundle" --assets-dest "$APP" --reset-cache >/dev/null
# and the bundled web arena (compat renderer), same as the Xcode build phase
[ -f "$HERE/web/www/index.html" ] && rsync -a --delete "$HERE/web/www/" "$APP/www/"
xcrun simctl terminate "$UDID" fun.mempire.app 2>/dev/null || true
xcrun simctl install "$UDID" "$APP"
xcrun simctl launch "$UDID" fun.mempire.app
