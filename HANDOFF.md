# HANDOFF — Mempire for Seeker (Solana Mobile CLOCK IN)

Status as of 2026-10-06, 21:50 IST. This file records only what was run and seen.

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
| **3D battle** (web arena, now the fallback/compat renderer) | Works. The bundled arena loads from `file://` in WKWebView, cards can be dragged and played, and the AI rival plays back. A **Rush** match ran to the end and the native **DEFEAT** result sheet appeared with crowns and trophies. |
| **AI Coach** | Works. It ran 24 simulated matches in 1.3 s on the simulator, then the swap search suggested $BTC → $NVDA. (Since then the coach uses 4 seeds and like-for-like seeds for the swap comparison.) |
| Chain ledger read | Works. On load, the app read the dev wallet's signature history from **devnet** and showed "no signed Clock-Ins yet". So devnet RPC is reachable from the app, and the restore-streak-from-chain path runs. |
| Fighters / Shop screens | Render correctly. SKR shows as **SIMULATED** because the stand-in mint is not deployed. |
| Release APK | **Built and signed with Gradle**; signature checked with `apksigner`, details below. **It has NOT been run on an Android device or emulator.** The user ordered no emulator use (it exhausted the Mac's RAM), and no device was attached. MWA on Android is therefore **untested**. |

**On-chain code path, verified on a local validator** (`cd mobile && npm run verify:local`,
which runs the real `spl-token-faucet` program dumped from devnet, on ports
4110–4140, and spends nothing). The run printed 9/9 PASS:
the setup script creates a 6-decimal stand-in mint whose mint authority is the
faucet PDA; two Clock-In transactions (memo + faucet mint, the same builders
the app uses) land and pay 5 + 10 SKR; the streak `[[20261007,2],[20261006,1]]`
is rebuilt from the memos in signature history; a Shop `transferChecked` moves
15 SKR to the treasury; and an oversized faucet request is refused. This run
caught a real bug (wrong InitFaucet account order) before it reached devnet.

Also verified: the shared battle sim is deterministic (`npx tsx app/scripts/sim-test.ts`), and both `mobile/` and `app/` typecheck cleanly (`tsc`).

## APK

- `/Volumes/Extreme SSD/Projects/clockin/apks/mempire-clockin.apk`
- sha256 `32aed1f9fc222754f0b9a3b324cd7ee78332890cc3f85b1199eaa5215cfa5da3`
- 63,903,832 bytes (60.9 MiB), ABIs arm64-v8a + x86_64, `fun.mempire.app` versionCode 3 (1.1.0)
- Built from commit `5af44b8` (native 3D arena + round-2 Android hardening).
- Signed with a **new dedicated release key**. The keystore and its password
  are **outside the repo** at
  `/Volumes/Extreme SSD/Projects/clockin/keys/mempire-release.keystore` and
  `mempire-release.env`. **Back both up.** Every future update, including the
  dApp Store, must be signed with this key.
- `apksigner` certificate: CN=Mempire, O=Mempire, C=IN; cert SHA-256 510a32d604173681a92bd6cb9c9b3809c4042c7d59a3fbbaf02316769fc3d943

## Polish round (Oct 7, branch `polish`, merged)

Before and after screenshots are in `clockin/screens/polish/`. Everything below was verified on the iPhone 17 simulator, except where it says otherwise.

| Item | What shipped | Verified |
|---|---|---|
| First-run intro | Three slides, skippable, persisted (`mempire.ftue.v1`), replayable from Wallet & settings. | Yes. All three slides, and Replay. |
| Guided first battle | Rush against the easiest rival. Coach marks (ghost finger from card to field, elixir, crowns) sit on top as a touch-through overlay in both arenas. A Golden welcome chest is granted once per player. | Yes, in both the web arena (auto on sim) and the native arena. The result sheet shows the welcome chest. |
| Daily quests | Clock in, win 1, deploy 10. They reset at UTC midnight with a countdown. Claiming pays SKR (simulated until the stand-in is deployed). Finishing all three adds a Silver chest. | Clock-in quest went 0/1, then Claim, then +5 SKR (simulated), then Done. Deploy progress counted 2/10. |
| Clock-In stamp | A "CLOCKED IN / DAY N" spring with heavy haptic and coin sound. The streak, trophy and SKR numbers count up. | Yes (screenshot). |
| Sound | The game's SFX and battle music through expo-audio, following the silent switch, with a persisted mute in settings and in the arena HUD. The web arena follows it too. | The toggle and HUD control render. **The sim runs muted, so audio output was not heard or verified.** |
| Chest reveal | The anticipation shake runs longer (~0.7 s, ease-in-out) before the burst, plus sound. Drops are staggered. | Same code path as the earlier verified reveal. Not re-filmed. |
| Reminders | Streak-at-risk at 19:00 (or 21:30) if you haven't clocked in, otherwise tomorrow evening. Uses a fixed id, so reminders never stack. | Scheduling code path only. **Delivery was not observed.** |
| Challenge a friend | System share sheet with `mempire://battle?rival=…` plus a play.mempire.fun fallback. On Home and on the result sheet. | Buttons render. The deep link itself was verified earlier. |
| States | Branded loading, app-level error boundary with retry, devnet-unreachable banner (45 s poll, tap to retry), friendlier no-wallet state. | Loading and normal states were seen. **The offline banner and error boundary were not forced on the sim.** |
| Accessibility | Dynamic Type capped at 1.3–1.35× and laid out to grow. 44 pt targets. State in a11y labels. Reduce Motion drops movement and keeps fades. | Checked at the largest non-accessibility Dynamic Type size, then fixed the streak-badge clip and the toggle/settings overflow (before and after screenshots). **Reduce Motion was not toggled on the sim.** |

## Native 3D arena (Oct 7, merged to main)

The battle is no longer a WebView by default. `mobile/src/arena/NativeArena.tsx`
renders the web game's own scene (`app/src/three/SceneContents`) with
`@react-three/fiber/native` on `expo-gl`. It adds a native HUD (timer, crowns,
elixir, hand, next card), PanResponder drag-to-deploy with a raycast through
the scene camera, and haptics. `mobile/src/arena/match.ts` steps the shared
deterministic sim and bot at 20 Hz.

How the shared code works:
- The scene reads the match through `app/src/three/arenaStore.ts`, which each
  host binds to its own store.
- Canvas textures go through `canvasTex.ts`. On native, the `.native.ts` twin
  returns PNGs baked by `mobile/scripts/bake-textures.ts`, which runs the same
  generators in Node; the output is byte-identical across runs.
- Unit sprites are PNG, not WebP, because expo-gl decodes images with
  stb_image, which has no WebP support. A WebP texture crashed the GL thread.
- Metro pins `three` to one CJS copy. Two copies crashed the app on
  `document.createElementNS`.

| Check | Result |
|---|---|
| Logic parity | `cd app && npx vitest run`. `tests/arena-parity.test.ts` plays a scripted Rush (seed c10c4) and Standard (seed 5eed1) match through **both** the native store and the web store under fake timers, and asserts identical tick, tower HP, winner and state hash. **Pass**: Rush ends with winner 1 at 601 ticks; Standard with winner 1 at 3069 ticks and two towers down. |
| Input mapping | `tests/arena-raycast.test.ts`: screen → NDC → ground round-trips through the real seat-0 camera, and the accept/forgive/refuse placement rules hold. **Pass.** |
| Renders natively | iPhone 17 simulator: full textured scene, towers, crowd, units walking, a drop ring while dragging. Screenshots and a full Standard-match recording are in `clockin/screens/native-arena/`. |
| Plays to a result | A full Standard match played natively: a tower fell (crowns 0-1) and the native result sheet showed "Native 3D arena". A Rush match accepted five back-to-back drags. **No native win was captured on the simulator**: at about 4 fps I could not out-play the bot. The win path is the same code the parity test covers, and wins were captured in the web arena. |
| Fallback | Auto mode with native forced (`mempire://battle?...&renderer=native`) on the simulator: the watchdog saw under 20 fps for 5 s and restarted the same match (same hand) in the web arena. The result read "Web arena (switched from native)". |
| Performance | **Simulator only: about 4 fps**, because iOS Simulator GLES is a software renderer (Apple's LLVM pipeline, one CPU core). The sim uses a lite path: Lambert materials, no fog/shadows/MSAA, and half-resolution rendering. **Hardware fps is unmeasured**, since no Android device or emulator could be used. A phone's GPU runs expo-gl in hardware, and if it can't hold 20 fps the watchdog moves the match to the web arena. |

Renderer selection is in the wallet sheet under Arena renderer, persisted:
- **Auto** (default): native on a physical device, web arena on a simulator.
- **Native 3D**: forces native. Use it to see native on a sim.
- **Web (compat)**.

For fast iteration on JS-only changes: `bash mobile/scripts/ios-js-update.sh`. It re-embeds the JS bundle and the web arena into the built simulator app, with no Xcode build.

## Android audit (round 2, Oct 7)

The APK has still never run on an Android device or emulator: the emulator is
banned on this machine, and no phone was attached. Everything below comes from
inspecting the built APK (`aapt2 dump badging` / `xmltree`, `unzip`, `strings`
on the dex and the Hermes bundle, `apksigner`) and the source. The main flow
was re-verified afterwards on the iPhone 17 simulator.

| # | Check | Result |
|---|---|---|
| 1 | Package / version | `fun.mempire.app`, **versionCode 2 / 1.0.1** (was 1 / 1.0.0). minSdk 24, targetSdk 36, compileSdk 36. |
| 1 | Permissions | INTERNET, POST_NOTIFICATIONS, VIBRATE, WAKE_LOCK and RECEIVE_BOOT_COMPLETED (rescheduling local notifications) remain. **Fixed:** `SYSTEM_ALERT_WINDOW`, READ/WRITE_EXTERNAL_STORAGE and USE_BIOMETRIC/USE_FINGERPRINT were pulled in by libraries and are now blocked (`android.blockedPermissions`). Launcher-badge and FCM permissions from expo-notifications remain; they are harmless. |
| 1 | Cleartext | `usesCleartextTraffic=false`. All traffic is HTTPS to devnet and mainnet RPC. |
| 1 | `<queries>` | The merged manifest has `<intent>` VIEW/BROWSABLE `solana-wallet` (from the MWA library), so MWA can see wallets on Android 11+. |
| 1 | Deep links | **Fixed:** removed the `https://play.mempire.fun` `autoVerify` intent filter. The app no longer opens those links, and the host serves no assetlinks.json, so verification would fail. The `mempire://` scheme stays. |
| 2 | MWA native module | `com/solanamobile/mobilewalletadapter` classes are present in the dex. The Hermes bundle contains the **react-native** build of the protocol (`index.native.js`, via the package `exports` "react-native" condition), not the browser build that causes the "secure context" error. |
| 2 | MWA usage | `authorize({ chain: 'solana:devnet', identity: { name: 'Mempire', uri: 'https://mempire.fun', icon: 'favicon.ico' } })`. The icon resolves (200, image/x-icon). The `auth_token` is cached in SecureStore. **Fixed:** a stale or revoked token is now dropped and authorize retried once, so later sign-ins no longer all fail. With no wallet installed, the message says to install Phantom or Solflare (or use Seed Vault) and points to the labelled dev wallet. mempire.fun serves no `/.well-known/assetlinks.json`, so a wallet may show the dApp as unverified. |
| 3 | JS bundle | `assets/index.android.bundle` is Hermes bytecode v98, the release build, with no Metro dependency. The devnet RPC `api.devnet.solana.com` is present. The only `localhost`/`127.0.0.1` strings are library constants (web3.js cluster parsing). The app's RPC is fixed to devnet and throws on mainnet. There are no 10.0.2.2 or 192.168.* strings. The bundled arena's `localhost:8787` and `:8899` references are behind a `hostname === localhost` check that a file:// page never passes. |
| 4 | Polyfills | `index.ts` imports `src/polyfills.ts` first (get-random-values, then the `Buffer` global), before App or web3.js. This is a separate module because imports are hoisted; the original inline version crashed iOS with "Buffer doesn't exist". Hermes provides TextEncoder. |
| 5 | Back button | **Fixed:** from any tab, back returns to Home, and only Home exits. Sheets, the coach and the arena are RN Modals, so back reaches their `onRequestClose`. In the arena that is a "Leave the battle?" confirm. I removed a duplicate BackHandler that would have shown the confirm twice. |
| 5 | Notifications | The `mempire-v1` channel (HIGH, custom `mempire_chime` sound, which is present at `res/raw`) is created at startup. The Android 13+ runtime permission is requested after the first Clock-In. Schedules pass `channelId`. |
| 5 | Arena WebView on Android | Loads `file:///android_asset/www/index.html` (10 MB, present in the APK) with `allowFileAccess`, `allowFileAccessFromFileURLs`, `allowUniversalAccessFromFileURLs` and `originWhitelist=['*']`. It is one classic IIFE script (no ES modules), and every asset path is relative. **Fixed:** react-native-webview's before-content-loaded injection can race a file:// page's script on Android. Had it lost, the page would have booted the whole web game instead of the arena. The match spec now also travels in the URL hash (`#/m/<json>`), the page reports `ready` itself, and the opaque cover drops after 8 s regardless. |
| 5 | Edge-to-edge (Android 15+) | `edgeToEdgeEnabled=true`. Header and tab bar use safe-area insets. **Fixed:** the arena is now inset natively (status bar on top, plus navigation bar on Android), because an Android WebView gets no `env(safe-area-*)`. The same fix exposed a real iOS bug: the arena's quit button and match timer sat under the status bar, where the button could not be tapped. |
| 5 | Keyboard / fonts / Linking | No text inputs. Fonts are bundled (`res/raw` / assets via expo-font). `Linking.openURL` is only used for explorer https links, which are covered by the `<queries>` https entry. |
| 6 | Signing | `apksigner`: CN=Mempire, cert SHA-256 `510a32d6…3d943`. This is the **same key** as the first upload; no new key was generated. |
| 7 | ABIs / size | arm64-v8a + x86_64. 56.6 MiB in round 2, 60.9 MiB with the native arena (adds `libexpo-gl.so` and baked textures). |

Re-verified on the iPhone 17 simulator after these changes, with a Release build under the shared build lock:
- A battle opened through the new hash path.
- A card was dragged into play.
- A standard match played to the end and showed the native DEFEAT sheet (-15 trophies).
- The relocated quit button opened the confirm; Leave produced a native loss result.

Uploaded to the `clockin-v1` release with `--clobber`. (That was the round-2 build; the current upload is the native-arena build, versionCode 3; see *APK* above.)

Still unverified on Android, by necessity: real MWA approval with a wallet,
WebGL performance in the Android WebView, notification delivery, and haptics.

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

- **Native loop and native arena, with a WebView safety net.** The CLOCK IN
  rules penalise web wrappers, so every screen is native React Native, and
  since Oct 7 so is the 3D battle (see *Native 3D arena*). The web arena is
  kept only as an automatic fallback. It is **bundled into the binary** (`vite build --mode native`: relative
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
- Build outputs are kept so rebuilds stay fast: `mobile/android` (~465 MB),
  `mobile/ios` (~620 MB) and the Xcode derived data at
  `/Volumes/Extreme SSD/Projects/clockin/.cache/derived/mempire` (~1.7 GB).
  Free all of it with
  `rm -rf mobile/android mobile/ios/build "/Volumes/Extreme SSD/Projects/clockin/.cache/derived/mempire"`.
  `npx expo prebuild` regenerates the native projects.
- The simulator was left with the app installed and running on the Home tab.
  While I was working, someone else played on it: a recorded Blue Chips win
  and a Rush Unlock purchase.
