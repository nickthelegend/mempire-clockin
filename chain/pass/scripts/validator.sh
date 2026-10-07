#!/bin/bash
# Start a throwaway local validator with mempire_pass preloaded at its program id.
# Ports stay in 4170-4199 (RPC 4170, WS 4171, faucet 4172, gossip 4173, dynamic 4174-4199).
# Usage: bash scripts/validator.sh [ledger-dir]   (prints the PID; logs in <ledger>/validator.log)
set -eo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
LEDGER="${1:-$HERE/test-ledger}"
SO="$HERE/target/deploy/mempire_pass.so"
[ -f "$SO" ] || { echo "build first: anchor build" >&2; exit 1; }
PID_ID=$(cd "$HERE/target/deploy" && solana-keygen pubkey mempire_pass-keypair.json)
rm -rf "$LEDGER"; mkdir -p "$LEDGER"
solana-test-validator --reset --quiet --ledger "$LEDGER" \
  --rpc-port 4170 --faucet-port 4172 --gossip-port 4173 --dynamic-port-range 4174-4199 \
  --bpf-program "$PID_ID" "$SO" > "$LEDGER/validator.log" 2>&1 &
VPID=$!
for i in $(seq 1 60); do
  curl -s -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' http://127.0.0.1:4170 | grep -q '"ok"' && break
  sleep 1
done
echo "$VPID"
