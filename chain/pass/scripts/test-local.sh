#!/bin/bash
# anchor test against a throwaway local validator (no devnet, nothing spent).
set -eo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"
mkdir -p .keys
[ -f .keys/test-admin.json ] || solana-keygen new --no-bip39-passphrase --silent -o .keys/test-admin.json >/dev/null
VPID=$(bash scripts/validator.sh "$HERE/test-ledger")
trap 'kill $VPID 2>/dev/null || true' EXIT
ADMIN=$(solana-keygen pubkey .keys/test-admin.json)
solana airdrop 50 "$ADMIN" --url http://127.0.0.1:4170 >/dev/null
anchor test --skip-local-validator --skip-build --skip-deploy
