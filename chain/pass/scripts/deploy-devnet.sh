#!/bin/bash
# One command, once the admin wallet has devnet SOL (~3.5 SOL for the program + setup):
#
#   PASS_ADMIN=~/.config/solana/id.json bash scripts/deploy-devnet.sh
#
# Builds (under the shared native-build lock), deploys mempire_pass to devnet at
# the program id in target/deploy/mempire_pass-keypair.json (keep that file; a
# copy lives outside the repo in clockin/keys/), then runs scripts/setup.ts to
# create the config, Season 1 and the skins. Devnet only.
set -eo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"
ADMIN="${PASS_ADMIN:-$HOME/.config/solana/id.json}"
URL="https://api.devnet.solana.com"
[ -f "$ADMIN" ] || { echo "no admin keypair at $ADMIN (set PASS_ADMIN)"; exit 1; }
[ -f target/deploy/mempire_pass-keypair.json ] || { echo "missing target/deploy/mempire_pass-keypair.json (restore it from clockin/keys/)"; exit 1; }

# solana-keygen/solana CLI cannot take paths with spaces; work from relative paths.
ADMIN_PUB=$(solana-keygen pubkey "$ADMIN")
BAL=$(solana balance "$ADMIN_PUB" --url "$URL" | awk '{print $1}')
echo "admin $ADMIN_PUB has $BAL devnet SOL"
awk "BEGIN{exit !($BAL < 3.5)}" && { echo "need ~3.5 devnet SOL; fund $ADMIN_PUB first"; exit 1; }

if [ ! -f target/deploy/mempire_pass.so ]; then
  L="$(cd "$HERE/../../.." && pwd)/.gradle.lock"
  until mkdir "$L" 2>/dev/null; do echo "waiting for the build lock"; sleep 15; done
  trap 'rmdir "$L"' EXIT
  anchor build
fi

(cd target/deploy && solana program deploy mempire_pass.so --program-id mempire_pass-keypair.json \
  --keypair "$ADMIN" --url "$URL")
npx tsx scripts/setup.ts --url "$URL" --admin "$ADMIN"
echo "done: set nothing in the app; it detects the deployed program and leaves preview mode."
