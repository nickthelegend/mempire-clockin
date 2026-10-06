# HANDOFF — Mempire for Seeker (Solana Mobile CLOCK IN)

Status as of 2026-10-06, 21:30 IST. This file records only what was run and seen.

## What was verified, and how

All app verification was on the **iOS simulator** (iPhone 17,
`91D81975-0680-40B8-92D2-725D726953AF`), running a **Release** build of
`mobile/` with the JS bundle embedded, so no Metro was involved. Screenshots
are in `clockin/screens/`.

| Flow | Result |
|---|---|
| App launch on iOS | Works. MWA is required lazily, so iOS no longer crashes with "SolanaMobileWalletAdapter could not be found". |
| Connect → **dev wallet** | Works. A devnet keypair is generated and stored in the keystore (SecureStore). |
| **Daily Clock-In** | Works. The streak went 0→1, the Day 1 reward was paid (Silver chest + 5 SKR), and the toast and "Clocked in" state appeared. The wallet had **0 devnet SOL**, so the card correctly says "Not on-chain: no devnet SOL for the network fee" and the SKR went to the *simulated* balance. **The on-chain memo path has not been executed yet** (see *Devnet SOL* below). |
| Chest timer → open | Works. A 3-minute silver chest unlocked, then opened with the reveal animation, giving 2 new fighters and +1 copy. |
| **3D battle** from the native app | Works. The bundled arena loads from `file://` in WKWebView, cards can be dragged and played, and the AI rival plays back. A **Rush** match ran to the end and the native **DEFEAT** result sheet appeared with crowns and trophies. |
| **AI Coach** | Works. It ran 24 simulated matches in 1.3 s on the simulator, then the swap search suggested $BTC → $NVDA. (Since then the coach uses 4 seeds and like-for-like seeds for the swap comparison.) |
| Fighters / Shop screens | Render correctly. SKR shows as **SIMULATED** because the stand-in mint is not deployed. |
| Release APK | **Built and signed with Gradle**; signature checked with `apksigner`, details below. **It has NOT been run on an Android device or emulator.** The user ordered no emulator use (it exhausted the Mac's RAM), and no device was attached. MWA on Android is therefore **untested**. |

Also verified: the shared battle sim is deterministic (`npx tsx app/scripts/sim-test.ts`), and both `mobile/` and `app/` typecheck cleanly (`tsc`).

## APK

- `/Volumes/Extreme SSD/Projects/clockin/apks/mempire-clockin.apk`
- sha256 `9344f208d00759965ccb47b2c6c737b00bf99b1d97e5d14139125793c71ac371`
- 59,394,666 bytes (56.6 MiB), ABIs arm64-v8a + x86_64, `fun.mempire.app` versionCode 1
- Signed with a **new dedicated release key**. The keystore and its password
  are **outside the repo** at
  `/Volumes/Extreme SSD/Projects/clockin/keys/mempire-release.keystore` and
  `mempire-release.env`. **Back both up.** Every future update, including the
  dApp Store, must be signed with this key.
- `apksigner` certificate: CN=Mempire, O=Mempire, C=IN; cert SHA-256 510a32d604173681a92bd6cb9c9b3809c4042c7d59a3fbbaf02316769fc3d943

## What the user must do

1. **Fund the devnet wallets.** The public faucet returned 429 all day.
   - Deployer `2vAPj7eES8GafqpZPdPRaPbA14AB8iiLcK5yMfco9HCr` (key at
     `~/.config/solana/mempire-clockin/deployer.json`, outside the repo) needs
     about **0.02 SOL**. Then run
     `cd mobile && node scripts/setup-skr-devnet.mjs`. This creates the "SKR
     (devnet stand-in)" mint, hands its mint authority to the public
     spl-token-faucet PDA, and writes `mobile/src/data/skr-devnet.json`.
     Commit that file, then rebuild the APK and iOS app. From that build on,
     Clock-In mints real stand-in SKR and Shop purchases are real
     `transferChecked` payments.
   - The demo wallet (the dev wallet's address is in the in-app wallet sheet)
     needs about **0.05 SOL** so that Clock-Ins land as on-chain memos with an
     Explorer "proof" link.
2. **Test on a real Android phone** (ideally a Seeker), with Phantom, Solflare
   or Seed Vault: Connect Wallet → MWA approve → Clock In (wallet sign) →
   Battle → Shop. Install with `adb install -r mempire-clockin.apk`.
3. **Record the demo** on that phone using `clockin/DEMO-SCRIPT.md`, narrated
   (judges read the transcript).
4. **Publish the APK** as a GitHub Release asset so there is a direct link:
   `gh release create v1.0.0-clockin "/Volumes/Extreme SSD/Projects/clockin/apks/mempire-clockin.apk" -R nickthelegend/mempire-clockin`.
5. **Deck:** render `clockin/PITCH.md` to Google Slides or a Drive PDF (under
   20 MB, link-viewable).
6. Fill in and submit the portal form (`clockin/SUBMISSION.md` has the
   answers). Run the portal's security audit and AI Coach first.
7. Optional: the web client's online features (ladder, clans, PvP relay) need
   `server/` hosted. The old Railway service
   `mempire-relay-production.up.railway.app` returns 404 "Application not
   found". **The Seeker app does not need it**, because every feature in the app
   is local or devnet.

## Exact commands

```bash
source "/Volumes/Extreme SSD/Projects/clockin/env.sh"      # caches on the SSD
cd "/Volumes/Extreme SSD/Projects/clockin/mempire-clockin"
(cd app && npm ci) && (cd mobile && npm ci)                  # postinstall applies patches/
cd mobile
npm run build:www        # builds app/ with --mode native into mobile/web/www (10 MB)
npm run ios:sim          # Release build, install and launch on the iPhone 17 sim
npm run apk              # prebuild --clean + signed release APK -> ../../apks/mempire-clockin.apk
node scripts/gen-roster.mjs          # regenerate native roster and keyed card art
node scripts/setup-skr-devnet.mjs    # once the deployer has devnet SOL
```

`npm run apk` reads the signing env from
`/Volumes/Extreme SSD/Projects/clockin/keys/mempire-release.env`. Without it,
the build falls back to the debug key and prints a warning.

## Decisions made (autonomously)

- **Native loop, WebView arena.** The CLOCK IN rules penalise web wrappers, so
  every screen outside the battle is native React Native. The 3D battle stays
  in WebGL, **bundled into the binary** (`vite build --mode native`: relative
  base, one classic IIFE script because file:// rejects ES modules). It is not
  loaded from play.mempire.fun, so the APK needs no hosted site and picks up
  this repo's code.
- **The AI is an on-device simulation coach, not an LLM.** That is honest, works
  offline, needs no API key in a public APK, and uses the game's real engine.
- **The SKR stand-in uses the public spl-token-faucet program** instead of a
  mint key in the app or a server faucet. Until it is deployed, SKR is a
  device-local balance labelled **SIMULATED** on every screen.
- **The Clock-In proof is a Memo instruction** rather than a new Anchor
  program. Redeploying needs SOL we do not have, and a memo is enough to make
  the streak publicly verifiable.
- **Signing.** The old plugin had hardcoded devnet keystore passwords, which
  cannot go in a public repo. It now reads env vars, and a new keystore was
  created outside the repo.
- **History rewrite.** `videos/gtm-shorts/.batch/*.mov` (ten files of about
  500 MB each) were stripped with `git filter-repo` so the push would succeed.
- **Expo `space-in-path` bugs.** `patches/expo-constants+*.patch`
  (patch-package) and a quoting fix in `plugins/withBundledWeb.js` let iOS
  builds work under "/Volumes/Extreme SSD". The Debug iOS configuration fails
  to link against Expo's prebuilt React core, so the sim uses Release.
- **Notification permission** is requested after the first Clock-In, not at
  launch.

## Known gaps

- Android has never been run: no device, and the emulator is banned. MWA,
  Android notifications, haptics and the `file:///android_asset` WebView path
  are all untested there. The WebView has `allowFileAccess*` set for it.
- No on-chain transaction from the app has been executed yet. That is blocked
  only on devnet SOL; the code path is the same `send()` the wallet sheet uses.
- The native game state (cards, chests, streak) is stored per wallet address
  on the device. It is not synced to a server or to the existing on-chain card
  program. The card program, escrow and MagicBlock flows remain in the web
  client.
- The Seeker Genesis Token check uses the public mainnet RPC, which can rate
  limit. It fails closed (no perk).
- `expo-system-ui` is not installed (a prebuild notice about
  `userInterfaceStyle`). This is harmless.

## Housekeeping

- During this session I ran `./gradlew --stop` once. `GRADLE_USER_HOME` is
  shared through env.sh, so it may have stopped another agent's Gradle daemon.
- Gradle builds are capped (`-Xmx3g`, 2 workers, `--no-daemon`). No Metro,
  validator or emulator was left running.
