#!/bin/sh
# Build the game client for the native app and stage it at mobile/web/www.
#
# The APK and the iOS app carry the whole game inside the binary and load it
# from file://, so the app works with no hosted web server. Rebuild this before
# every native build that should pick up client changes:
#
#   npm run build:www            # from mobile/
#
# Optional env (baked into the bundle, all public values):
#   VITE_RPC_URL   devnet RPC (default https://api.devnet.solana.com)
#   VITE_API_URL   relay/API origin; unset = local-only play (no ladder/PvP)
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HERE/../app"
cd "$APP"
VITE_CLUSTER="${VITE_CLUSTER:-devnet}" node scripts/preflight.mjs
VITE_CLUSTER="${VITE_CLUSTER:-devnet}" npx vite build --mode native --emptyOutDir
rm -rf "$HERE/web/www"
mkdir -p "$HERE/web"
cp -R "$APP/dist-native" "$HERE/web/www"
# Crawler files mean nothing inside an app.
rm -f "$HERE/web/www/robots.txt" "$HERE/web/www/sitemap.xml"
echo "staged $(du -sh "$HERE/web/www" | cut -f1) at mobile/web/www"
