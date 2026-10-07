#!/bin/bash
# End-to-end check of both Actions against a LOCAL validator (ports 4150-4179):
# mempire_pass is preloaded from chain/pass/target/deploy (anchor build, or copy
# it from a build), configured with chain/pass/scripts/setup.ts, and the real
# Vercel handlers are called with DEVNET_RPC_URL pointed at the validator.
set -eo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
[ -f "/Volumes/Extreme SSD/Projects/clockin/env.sh" ] && source "/Volumes/Extreme SSD/Projects/clockin/env.sh"
SO="$ROOT/chain/pass/target/deploy/mempire_pass.so"
[ -f "$SO" ] || { echo "missing $SO (cd chain/pass && anchor build)"; exit 1; }
WORK="/private/tmp/mempire-actions-local-$USER"
rm -rf "$WORK"; mkdir -p "$WORK"
solana-test-validator --reset --quiet --ledger "$WORK/ledger" \
  --rpc-port 4150 --faucet-port 4152 --gossip-port 4153 --dynamic-port-range 4154-4179 \
  --bpf-program 3aykd5NLqwjALGiaPykRiGJhv1ehJsjxqVsjQ5qGtr7G "$SO" > "$WORK/validator.log" 2>&1 &
VPID=$!
trap 'kill $VPID 2>/dev/null; wait $VPID 2>/dev/null || true' EXIT
RPC=http://127.0.0.1:4150
for i in $(seq 1 60); do solana cluster-version -u "$RPC" >/dev/null 2>&1 && break; sleep 1; done
solana-keygen new -o "$WORK/admin.json" --no-bip39-passphrase -s >/dev/null
solana-keygen new -o "$WORK/buyer.json" --no-bip39-passphrase -s >/dev/null
BUYER=$(solana-keygen pubkey "$WORK/buyer.json")
(cd "$ROOT/chain/pass" && npx tsx scripts/setup.ts --url "$RPC" --admin "$WORK/admin.json" --fund "$BUYER" | tail -3)
cd "$HERE"
DEVNET_RPC_URL="$RPC" BUYER_KEY="$WORK/buyer.json" npx tsx scripts/verify-local.ts
