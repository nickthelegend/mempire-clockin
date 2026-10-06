#!/bin/bash
# Run scripts/verify-local.ts against a throwaway local validator on ports
# 4110-4140 (this project's range), with the spl-token-faucet program dumped
# from devnet. Cleans up after itself.
set -eo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "/Volumes/Extreme SSD/Projects/clockin/env.sh" ] && source "/Volumes/Extreme SSD/Projects/clockin/env.sh"
# The Solana CLI cannot take keypair paths containing spaces, so the scratch
# dir lives on a space-free path.
WORK="/private/tmp/mempire-verify-local-$USER"
rm -rf "$WORK"; mkdir -p "$WORK"
FAUCET=4bXpkKSV8swHSnwqtzuboGPaPDeEgAn4Vt8GfarV5rZt
solana program dump -ud "$FAUCET" "$WORK/faucet.so" >/dev/null
solana-test-validator --reset --quiet --ledger "$WORK/ledger" \
  --rpc-port 4110 --faucet-port 4112 --gossip-port 4113 --dynamic-port-range 4114-4140 \
  --bpf-program "$FAUCET" "$WORK/faucet.so" > "$WORK/validator.log" 2>&1 &
VPID=$!
trap 'kill $VPID 2>/dev/null; wait $VPID 2>/dev/null || true' EXIT
RPC=http://127.0.0.1:4110
for i in $(seq 1 60); do solana cluster-version -u "$RPC" >/dev/null 2>&1 && break; sleep 1; done
solana-keygen new -o "$WORK/payer.json" --no-bip39-passphrase -s >/dev/null
solana airdrop 5 "$(solana-keygen pubkey "$WORK/payer.json")" -u "$RPC" >/dev/null
cd "$HERE"
RPC="$RPC" KEYPAIR="$WORK/payer.json" OUT="$WORK/skr-local.json" node scripts/setup-skr-devnet.mjs
EXPO_PUBLIC_RPC_URL="$RPC" SKR_CFG="$WORK/skr-local.json" npx tsx scripts/verify-local.ts
