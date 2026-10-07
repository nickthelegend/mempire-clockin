#!/bin/bash
# Signed release APK, built with Gradle only (no emulator, no EAS).
#   npm run apk        # from mobile/
# Signing: MEMPIRE_KEYSTORE / MEMPIRE_KEYSTORE_PASSWORD / MEMPIRE_KEY_ALIAS must
# point at a keystore OUTSIDE this repo (see HANDOFF.md). Heap is capped at 3 GB
# and one daemon, so the build can share a laptop with other work.
set -eo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "/Volumes/Extreme SSD/Projects/clockin/env.sh" ] && source "/Volumes/Extreme SSD/Projects/clockin/env.sh"
[ -f "/Volumes/Extreme SSD/Projects/clockin/keys/mempire-release.env" ] && source "/Volumes/Extreme SSD/Projects/clockin/keys/mempire-release.env"
export LANG=en_US.UTF-8
cd "$HERE"
sh scripts/build-www.sh
# plugins are idempotent; use --clean after native dependency changes
CI=1 npx expo prebuild --platform android --clean
# One native build at a time across all agents on this machine (see
# clockin/ROUND2.md): take the shared lock, always release it.
LOCK="/Volumes/Extreme SSD/Projects/clockin/.gradle.lock"
if [ -d "/Volumes/Extreme SSD/Projects/clockin" ]; then
  until mkdir "$LOCK" 2>/dev/null; do sleep 30; done
  echo "mempire $$" > "$LOCK/owner"
  trap 'rm -rf "$LOCK"' EXIT
fi
cd android
# cap memory: 3g heap, a single worker, no parallel project execution
sed -i '' -E 's/^org\.gradle\.jvmargs=.*/org.gradle.jvmargs=-Xmx3g -XX:MaxMetaspaceSize=768m/' gradle.properties
grep -q '^org.gradle.workers.max' gradle.properties || printf '\norg.gradle.workers.max=2\n' >> gradle.properties
sed -i '' -E 's/^org\.gradle\.parallel=.*/org.gradle.parallel=false/' gradle.properties
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64 --no-daemon -Dorg.gradle.jvmargs=-Xmx3g
./gradlew --stop >/dev/null 2>&1 || true
APK=app/build/outputs/apk/release/app-release.apk
OUT="/Volumes/Extreme SSD/Projects/clockin/apks/mempire-clockin.apk"
mkdir -p "$(dirname "$OUT")"
cp "$APK" "$OUT"
BT=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
"$BT/apksigner" verify --print-certs "$OUT" | head -3
shasum -a 256 "$OUT"
ls -la "$OUT"
