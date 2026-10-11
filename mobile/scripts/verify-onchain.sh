#!/bin/bash
# scripts/verify-onchain.ts against a throwaway local validator with mempire_pass
# loaded (chain/pass/scripts/validator.sh, ports 4170-4199). Spends nothing.
set -eo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PASS="$HERE/../chain/pass"
[ -f "/Volumes/Extreme SSD/Projects/clockin/env.sh" ] && source "/Volumes/Extreme SSD/Projects/clockin/env.sh"
VPID=$(bash "$PASS/scripts/validator.sh" "$PASS/test-ledger")
trap 'kill $VPID 2>/dev/null || true' EXIT
cd "$HERE"
EXPO_PUBLIC_RPC_URL=http://127.0.0.1:4170 npx tsx scripts/verify-onchain.ts
