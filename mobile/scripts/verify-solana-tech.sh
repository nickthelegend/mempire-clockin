#!/bin/bash
# Run scripts/verify-solana-tech.ts against a throwaway local validator on
# ports 4150-4199 (the solana-tech range). Spends nothing. Cleans up.
set -eo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "/Volumes/Extreme SSD/Projects/clockin/env.sh" ] && source "/Volumes/Extreme SSD/Projects/clockin/env.sh"
WORK="/private/tmp/mempire-solana-tech-$USER"
rm -rf "$WORK"; mkdir -p "$WORK"
solana-test-validator --reset --quiet --ledger "$WORK/ledger" \
  --rpc-port 4150 --faucet-port 4152 --gossip-port 4153 --dynamic-port-range 4154-4180 \
  > "$WORK/validator.log" 2>&1 &
VPID=$!
trap 'kill $VPID 2>/dev/null; wait $VPID 2>/dev/null || true' EXIT
RPC=http://127.0.0.1:4150
for i in $(seq 1 60); do solana cluster-version -u "$RPC" >/dev/null 2>&1 && break; sleep 1; done
cd "$HERE"
EXPO_PUBLIC_RPC_URL="$RPC" npx tsx scripts/verify-solana-tech.ts
