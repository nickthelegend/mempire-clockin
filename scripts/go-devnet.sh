#!/bin/bash
# Go devnet: the final step, one command, idempotent.
#
#   bash scripts/go-devnet.sh                      # devnet: deploy, set up, sweep, ship 1.x APK, push
#   bash scripts/go-devnet.sh --cluster localnet   # the same against a throwaway local validator (4150-4199)
#   bash scripts/go-devnet.sh --no-ship            # stop after the sweep (no APK, no commit)
#
# Steps (each skipped when already done):
#   1. balance check: the deployer must hold enough SOL (2x the program's rent
#      while the deploy buffer exists, plus ~0.7 SOL for the rest), else bail
#   2. deploy mempire_pass with --max-len (upgrade only if the .so changed)
#   3. SKR stand-in (setup-skr-devnet.mjs) -> mobile/src/data/skr-devnet.json
#   4. Season 1 + skins (chain/pass/scripts/setup.ts)
#   5. 0.3 SOL to the demo wallet DP7e...CmV7
#   6. the sweep (mobile/scripts/devnet-sweep.ts) -> clockin/DEVNET-EVIDENCE.md
#      (localnet: clockin/LOCALNET-EVIDENCE.md)
#   7. devnet: the Season Pass Blink must no longer be disabled
#   8. devnet: bump version, build the APK (lock, same keystore), upload with
#      --clobber, sha256 into the docs, commit, scan for secrets, push
set -eo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "/Volumes/Extreme SSD/Projects/clockin/env.sh" ] && source "/Volumes/Extreme SSD/Projects/clockin/env.sh"
CLUSTER=devnet; SHIP=1; KEEP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --cluster) CLUSTER="$2"; shift 2 ;;
    --no-ship) SHIP=0; shift ;;
    --keep) KEEP=1; shift ;;   # localnet: reuse the ledger and keys of the previous run (idempotency check)
    *) echo "unknown argument $1"; exit 2 ;;
  esac
done
DEMO=DP7eqSWi8WgrSvTnkwFTSXKkcS7mqJKdUijpZKNaCmV7
PROGRAM_ID=3aykd5NLqwjALGiaPykRiGJhv1ehJsjxqVsjQ5qGtr7G
SO="$ROOT/chain/pass/target/deploy/mempire_pass.so"
# The Solana CLI cannot take keypair paths with spaces: work on a space-free path.
WORK="/private/tmp/mempire-go-$CLUSTER-$USER"
mkdir -p "$WORK"; chmod 700 "$WORK"
cleanup() { rm -f "$WORK/program.json"; [ -n "$VPID" ] && kill "$VPID" 2>/dev/null || true; }
trap cleanup EXIT
say() { printf '\n== %s\n' "$*"; }

case "$CLUSTER" in
  devnet)
    RPC=https://api.devnet.solana.com
    DEPLOYER="${DEPLOYER:-$HOME/.config/solana/mempire-clockin/deployer.json}"
    SKR_CFG="$ROOT/mobile/src/data/skr-devnet.json"
    EVIDENCE="$ROOT/clockin/DEVNET-EVIDENCE.md"
    PLAYER="$HOME/.config/solana/mempire-clockin/sweep-player.json"
    ;;
  localnet)
    RPC=http://127.0.0.1:4150
    say "local validator on 4150-4179 (spl-token-faucet dumped from devnet)"
    FAUCET=4bXpkKSV8swHSnwqtzuboGPaPDeEgAn4Vt8GfarV5rZt
    [ -f "$WORK/faucet.so" ] || solana program dump -ud "$FAUCET" "$WORK/faucet.so" >/dev/null
    [ "$KEEP" = 1 ] || rm -rf "$WORK/ledger"
    solana-test-validator --quiet --ledger "$WORK/ledger" \
      --rpc-port 4150 --faucet-port 4152 --gossip-port 4153 --dynamic-port-range 4154-4179 \
      --bpf-program "$FAUCET" "$WORK/faucet.so" > "$WORK/validator.log" 2>&1 &
    VPID=$!
    for i in $(seq 1 60); do solana cluster-version -u "$RPC" >/dev/null 2>&1 && break; sleep 1; done
    DEPLOYER="$WORK/deployer.json"
    SKR_CFG="$WORK/skr-local.json"
    PLAYER="$WORK/sweep-player.json"
    if [ "$KEEP" != 1 ]; then
      solana-keygen new -o "$DEPLOYER" --no-bip39-passphrase -s --force >/dev/null
      solana airdrop 20 "$(solana-keygen pubkey "$DEPLOYER")" -u "$RPC" >/dev/null
      rm -f "$SKR_CFG" "$PLAYER"
    fi
    EVIDENCE="$ROOT/clockin/LOCALNET-EVIDENCE.md"
    SHIP=0
    ;;
  *) echo "--cluster devnet|localnet"; exit 2 ;;
esac
[ -f "$DEPLOYER" ] || { echo "no deployer keypair at $DEPLOYER"; exit 1; }
cp "$DEPLOYER" "$WORK/deployer-in-use.json" 2>/dev/null || true
KP="$WORK/deployer-in-use.json"
ADMIN=$(solana-keygen pubkey "$KP")

say "1. balance ($CLUSTER, deployer $ADMIN)"
[ -f "$SO" ] || { echo "build the program first: cd chain/pass && anchor build (under the shared build lock)"; exit 1; }
SO_BYTES=$(stat -f %z "$SO")
MAX_LEN=$((SO_BYTES + 16384))
DEPLOYED=0
if solana program show "$PROGRAM_ID" -u "$RPC" >/dev/null 2>&1; then DEPLOYED=1; fi
rent() { solana rent "$1" -u "$RPC" --lamports | grep -o '[0-9]\+' | head -1; }
# program data is max-len + 45 bytes of header; the buffer is the .so + 37
RENT_MAX=$(rent $((MAX_LEN + 45)))
RENT_SO=$(rent $((SO_BYTES + 37)))
# deploy: buffer (SO) + program data (MAX_LEN) at once; the buffer is refunded after.
NEED=$(( (DEPLOYED ? 0 : RENT_MAX + RENT_SO) + 700000000 ))
HAVE=$(solana balance "$ADMIN" -u "$RPC" --lamports | awk '{print $1}')
printf 'program .so %s bytes, --max-len %s; already deployed: %s\nneed %s SOL, have %s SOL\n' \
  "$SO_BYTES" "$MAX_LEN" "$DEPLOYED" "$(echo "scale=3; $NEED/1000000000" | bc)" "$(echo "scale=3; $HAVE/1000000000" | bc)"
if [ "$HAVE" -lt "$NEED" ]; then
  echo "NOT ENOUGH SOL: fund $ADMIN with $(echo "scale=2; ($NEED-$HAVE)/1000000000 + 0.01" | bc) more $CLUSTER SOL, then rerun."
  exit 1
fi
START_BAL=$HAVE

say "2. mempire_pass"
cp "$ROOT/chain/pass/target/deploy/mempire_pass-keypair.json" "$WORK/program.json"; chmod 600 "$WORK/program.json"
[ "$(solana-keygen pubkey "$WORK/program.json")" = "$PROGRAM_ID" ] || { echo "program keypair mismatch"; exit 1; }
cp "$SO" "$WORK/mempire_pass.so"
NEEDS_DEPLOY=1
if [ "$DEPLOYED" = 1 ]; then
  solana program dump "$PROGRAM_ID" "$WORK/onchain.so" -u "$RPC" >/dev/null
  # program data is zero-padded to max-len; compare the deployed prefix
  if head -c "$SO_BYTES" "$WORK/onchain.so" | cmp -s - "$WORK/mempire_pass.so"; then NEEDS_DEPLOY=0; echo "already deployed and identical: skip"; fi
fi
if [ "$NEEDS_DEPLOY" = 1 ]; then
  (cd "$WORK" && solana program deploy mempire_pass.so --program-id program.json --max-len "$MAX_LEN" -k deployer-in-use.json -u "$RPC")
fi

say "3. SKR stand-in"
(cd "$ROOT/mobile" && RPC="$RPC" KEYPAIR="$KP" OUT="$SKR_CFG" node scripts/setup-skr-devnet.mjs | tail -2)

say "4. Season 1 + skins"
(cd "$ROOT/chain/pass" && npx tsx scripts/setup.ts --url "$RPC" --admin "$KP" --skr "$SKR_CFG" | tail -12)

say "5. demo wallet $DEMO"
DEMO_BAL=$(solana balance "$DEMO" -u "$RPC" --lamports | awk '{print $1}')
if [ "$DEMO_BAL" -lt 250000000 ]; then
  solana transfer "$DEMO" 0.3 -k "$KP" -u "$RPC" --allow-unfunded-recipient --fee-payer "$KP" | grep -i signature
else echo "already holds $(echo "scale=3; $DEMO_BAL/1000000000" | bc) SOL: skip"; fi

say "6. sweep"
(cd "$ROOT/mobile" && EXPO_PUBLIC_RPC_URL="$RPC" npx tsx scripts/devnet-sweep.ts --payer "$KP" --player "$PLAYER" --skr "$SKR_CFG" --out "$EVIDENCE")

END_BAL=$(solana balance "$ADMIN" -u "$RPC" --lamports | awk '{print $1}')
echo "deployer spent $(echo "scale=4; ($START_BAL-$END_BAL)/1000000000" | bc) SOL this run"

if [ "$CLUSTER" = devnet ]; then
  say "7. Season Pass Blink"
  BLINK=$(curl -s https://mempire-actions.vercel.app/api/actions/season-pass)
  if echo "$BLINK" | grep -q '"disabled":true'; then echo "Blink still disabled: $BLINK"; exit 1; fi
  echo "enabled: $(echo "$BLINK" | head -c 200)"
fi

[ "$SHIP" = 1 ] || { say "done (no ship)"; exit 0; }

say "8. ship"
cd "$ROOT"
python3 - <<'EOF'
import json,re
p='mobile/app.json'; s=open(p).read()
v=re.search(r'"version": "(\d+)\.(\d+)\.(\d+)"',s); vc=re.search(r'"versionCode": (\d+)',s)
nv=f'{v.group(1)}.{v.group(2)}.{int(v.group(3))+1}'; nvc=int(vc.group(1))+1
s=s.replace(v.group(0),f'"version": "{nv}"').replace(vc.group(0),f'"versionCode": {nvc}')
open(p,'w').write(s); print(f'version {nv} / versionCode {nvc}')
EOF
(cd mobile && unset EXPO_PUBLIC_RPC_URL && bash scripts/build-apk.sh | tail -3)
APK="/Volumes/Extreme SSD/Projects/clockin/apks/mempire-clockin.apk"
AAPT=$(ls -d ~/Library/Android/sdk/build-tools/*/aapt2 | tail -1)
"$AAPT" dump permissions "$APK" | grep -qi RECORD_AUDIO && { echo "microphone permission in the APK: stop"; exit 1; }
"$AAPT" dump badging "$APK" | head -1
gh release upload clockin-v1 "$APK" -R nickthelegend/mempire-clockin --clobber
rm -f "$WORK/dl.apk"; gh release download clockin-v1 -R nickthelegend/mempire-clockin -p mempire-clockin.apk -O "$WORK/dl.apk"
NEW=$(shasum -a 256 "$WORK/dl.apk" | cut -c1-64); LOCAL=$(shasum -a 256 "$APK" | cut -c1-64)
[ "$NEW" = "$LOCAL" ] || { echo "uploaded hash $NEW != local $LOCAL"; exit 1; }
BYTES=$(stat -f %z "$APK")
python3 - "$NEW" "$BYTES" <<'EOF'
import re,sys
new,size=sys.argv[1],int(sys.argv[2])
old=re.search(r'sha256 `([0-9a-f]{64})`',open('clockin/SUBMISSION.md').read()).group(1)
ver=re.search(r'"version": "([\d.]+)"',open('mobile/app.json').read()).group(1)
vc=re.search(r'"versionCode": (\d+)',open('mobile/app.json').read()).group(1)
for p in ('HANDOFF.md','clockin/SUBMISSION.md','README.md'):
    s=open(p).read().replace(old,new)
    s=re.sub(r'[\d,]+ bytes \([\d.]+ MiB\)',f'{size:,} bytes ({size/2**20:.1f} MiB)',s)
    s=re.sub(r'version [\d.]+ \(versionCode \d+\)',f'version {ver} (versionCode {vc})',s)
    open(p,'w').write(s)
print('docs updated', old[:8], '->', new[:8])
EOF
git add mobile/app.json mobile/src/data/skr-devnet.json clockin/DEVNET-EVIDENCE.md HANDOFF.md clockin/SUBMISSION.md README.md
# secret scan of the staged diff
if git diff --cached --name-only | grep -Ei '(^|/)\.env|keystore|keypair|deployer|sweep-player|id\.json'; then echo "suspicious file staged: stop"; exit 1; fi
if git diff --cached -U0 | grep '^+' | grep -Eq '\[[0-9]{1,3}(,[0-9]{1,3}){63}\]|PRIVATE KEY|storePassword'; then echo "secret-looking content staged: stop"; exit 1; fi
git commit -q -m "release: go devnet - mempire_pass + SKR stand-in live on devnet, sweep evidence, APK sha256 ${NEW:0:8}" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -q origin main
say "done: $(git log --oneline -1)"
