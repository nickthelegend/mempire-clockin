#!/bin/bash
# Build the iOS app (Release, JS embedded — no Metro needed) and run it on the
# simulator assigned to this project.
#   npm run ios:sim            # from mobile/
# Release on purpose: the Debug configuration fails to link against Expo's
# prebuilt React core (missing DebugStringConvertible symbols) in this setup.
set -eo pipefail
UDID="${SIM_UDID:-91D81975-0680-40B8-92D2-725D726953AF}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "/Volumes/Extreme SSD/Projects/clockin/env.sh" ] && source "/Volumes/Extreme SSD/Projects/clockin/env.sh"
DD="${CLOCKIN_DERIVED_DATA:-$HERE/ios/build}/mempire"
export LANG=en_US.UTF-8
[ -f "$HERE/web/www/index.html" ] || (cd "$HERE" && sh scripts/build-www.sh)
cd "$HERE/ios"
xcodebuild -workspace Mempire.xcworkspace -scheme Mempire -configuration Release \
  -sdk iphonesimulator -destination "id=$UDID" -derivedDataPath "$DD" build \
  > "${TMPDIR:-/tmp}/mempire-ios-build.log" 2>&1 || { tail -40 "${TMPDIR:-/tmp}/mempire-ios-build.log"; exit 1; }
APP="$DD/Build/Products/Release-iphonesimulator/Mempire.app"
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl install "$UDID" "$APP"
xcrun simctl launch "$UDID" fun.mempire.app
