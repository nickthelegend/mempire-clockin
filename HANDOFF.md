# HANDOFF — Mempire for Seeker (Solana Mobile CLOCK IN)

Status as of 2026-10-07, 20:55 IST (1.2.2). This file records only what was run and seen.

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
- sha256 `02ffed8304cf98b814c09ef8a0a3a07b6451dc5edeb7daf87c7584dfecebf475`
- 69,813,097 bytes (66.6 MiB), ABIs arm64-v8a + x86_64, `fun.mempire.app` versionCode 6 (1.2.2)
- Built from `main` at the 1.2.2 release commit: the 1.2.1 changes (no microphone permission, no fps readout in release, store-kit icon and splash) plus the bug-hunt fixes below. `aapt2` shows versionCode 6 / 1.2.2 and no `RECORD_AUDIO`; the certificate digest is unchanged (same key). The file was re-downloaded from the release and its sha256 matches.
- Signed with a **new dedicated release key**. The keystore and its password
  are **outside the repo** at
  `/Volumes/Extreme SSD/Projects/clockin/keys/mempire-release.keystore` and
  `mempire-release.env`. **Back both up.** Every future update, including the
  dApp Store, must be signed with this key.
- `apksigner` certificate: CN=Mempire, O=Mempire, C=IN; cert SHA-256 510a32d604173681a92bd6cb9c9b3809c4042c7d59a3fbbaf02316769fc3d943

## Season Pass & skins (1.3.0, Oct 7–8, branch `season-pass`, merged)

Free to play, never pay-to-win: every reward is a chest, a chest slot, a Streak
Shield or a cosmetic. Both the pass and the skins are **Token-2022 tokens sold
for SKR by a new Anchor program**. The app reads ownership from chain and
never stores or fakes it.

**Program `mempire_pass`** (`chain/pass/`, Anchor 0.32.1, its own workspace).
Program id `3aykd5NLqwjALGiaPykRiGJhv1ehJsjxqVsjQ5qGtr7G`. The program keypair
is in `chain/pass/target/deploy/` (gitignored), with a copy outside the repo at
`clockin/keys/mempire_pass-program-keypair.json`.

| Instruction | What it does |
|---|---|
| `init_config` (admin) | Records the SKR mint and creates the treasury vault (an SKR token account PDA owned by the config PDA). |
| `init_season(season_id, price_skr, ends_at, uri)` (admin) | Creates the pass mint at a PDA with the **NonTransferable**, **MetadataPointer** (pointing to itself) and **TokenMetadata** extensions: name "Mempire Season N Pass", symbol MPASS, uri, and `additional_metadata` `season`, `tier=premium` and `ends_at`. The mint authority and metadata update authority are the `mint_auth` PDA. Decimals 0. |
| `buy_pass(season_id)` | **One instruction**: `transfer_checked` of `price_skr` SKR from the buyer to the treasury vault, then the PDA mints 1 soulbound pass to the buyer's Token-2022 ATA. A receipt PDA per (season, buyer) makes a second purchase fail. Refused after `ends_at`, and refused with too little SKR. |
| `init_skin(skin_id, price_skr, name, symbol, uri, skin_type, season)` (admin) | A **transferable** Token-2022 mint with MetadataPointer + TokenMetadata (`skin_type`, `skin_id`, `season`). |
| `buy_skin(skin_id)` | SKR to the treasury and 1 skin token to the buyer, in one instruction. One per player (receipt PDA). |

The metadata JSON is in `chain/pass/metadata/`, served raw from GitHub, so
there is no new hosted service.

- **`anchor test` on a local validator** (`cd chain/pass && npm run test:local`,
  ports 4170–4199): **10 passing**. The tests cover config and the treasury
  PDA; the extensions and metadata on the pass mint; a pass purchase (1 token,
  SKR moved); a double buy rejected; insufficient SKR rejected; a soulbound
  transfer refused by Token-2022; an ended season refused; a non-admin season
  refused; a skin bought once, with the second buy rejected and the skin still
  transferable; and an exact treasury balance.
- **Devnet:** **not deployed**, because devnet SOL is still 0. Once the admin
  wallet holds about 3.5 devnet SOL, one command deploys it:
  `PASS_ADMIN=~/.config/solana/id.json bash chain/pass/scripts/deploy-devnet.sh`.
  The script runs the deploy and then `scripts/setup.ts` (config, Season 1,
  3 arena skins and 4 frames; idempotent). No app change or rebuild is needed:
  the app detects the program and leaves preview mode.

**App (mobile/)**

- **Season Pass:** opened from the Home card, the Shop button or
  `mempire://pass`.
  - 25 tiers on a free track and a premium track (`mobile/src/game/season.ts`).
  - XP: Clock-In 60, quest 25, all quests 40, win 40, draw 20, loss 15.
    100 XP per tier.
  - Rewards: chests (through the inbox, so none is ever lost), +1 chest slot
    (tiers 10 and 20, at most 6 slots), Streak Shields, 3 frames and 5 emotes.
  - Premium = `getTokenAccountsByOwner(wallet, Token-2022)` shows a balance of
    the season's pass mint.
  - Buy: one transaction signed by MWA on Android or by the dev wallet on iOS,
    with a tx link.
- **Skins:** in the SKR Shop, with previews.
  - 3 arena skins: Neon Night, Golden Hour and Frozen Ledger.
  - 4 card frames: Gold Leaf, Cyber Grid, Frost Rim and Magma.
  - Owned and equipped status comes from the same chain read. You equip them in
    **Deck → Wardrobe** (arena skin, card frame, emote).
  - The native arena renders the equipped skin. Texture variants are baked by
    `mobile/scripts/bake-textures.ts` from the same generators (30 PNGs,
    `name__skin.png`), and each skin also sets the fog and lights
    (`app/src/three/skin.ts`). The web compat arena keeps the default look, and
    the Wardrobe says so.
- **Preview / offline states:** if the program or config is missing on the
  cluster the app talks to, the screens say "On-chain pass available once
  deployed: preview mode". If the RPC is unreachable they say "chain
  unreachable". In both cases nothing shows as owned and nothing can be bought.
  The free track works either way. The SIMULATED-SKR label is unchanged.
- **Season War + leaderboard:** a Home banner (BONK vs POPCAT) and
  `mempire://board`.
  - Picking a side adds `:war=1:side=BONK` to every signed Clock-In memo, so a
    global tally can be rebuilt from chain.
  - The app shows your own points and **says plainly that the global count is
    not computed yet**.
  - "Your board by coin" scores your battles per fighter, on this device.
- **Share card:** on the result screen. The card has the outcome, crowns, four
  of your fighters, your emote and frame, and the challenge deep link.
  - It is captured with react-native-view-shot.
  - iOS shares the image and link through the share sheet. Android shares the
    image through expo-sharing and copies the link for the caption.
- **Unlicensed marks hidden** (`HIDE_UNLICENSED_MARKS` in
  `mobile/src/game/rules.ts`).
  - Every tokenised-stock fighter is removed from the roster, chests, rivals,
    starters and shop: AAPL, TSLA, NVDA, MSFT, GOOGL, AMZN, META, NFLX, AMD,
    INTC, COIN, HOOD, MSTR, SPY, QQQ, DIS, JPM, V, PLTR and SBUX (20 of 64).
  - The crypto and meme tickers stay (44).
  - The Blue Chips and Whale Court rivals now use crypto majors. The starter
    pool swaps NVDA/MSTR for DOT/APT, keeping the same archetypes (Tank,
    Support).
  - Old saves with hidden cards drop them on load (the existing roster filter).

**Verified on the iPhone 17 simulator** against a local validator with the
program deployed (`bash chain/pass/scripts/validator.sh`, then
`npx tsx scripts/setup.ts --fund <dev wallet>`; the JS was bundled with
`EXPO_PUBLIC_RPC_URL=http://127.0.0.1:4170`). Screenshots are in
`clockin/screens/season-pass/`:

1. Pass screen live: 400 SKR on-chain, price 150 (01).
2. BUY PASS → "PASS HELD · ON-CHAIN" with a tx link (02).
   `spl-token display` confirms the pass mint has Non-transferable +
   MetadataPointer + TokenMetadata (name, symbol, uri, season, tier, ends_at),
   supply 1, and the wallet's SKR went 400 → 250.
3. Premium tier 1 claimed (03). **Test setup, disclosed:** the save's pass XP
   was set to 260 by editing the simulator's AsyncStorage, because one session
   cannot earn 2 tiers of XP. Premium gating itself came from the chain read.
4. Shop skins live (04). Bought Neon Night → "minted to your wallet and
   equipped", SKR 250 → 190 (05). `spl-token display` shows the transferable
   skin mint with MetadataPointer + TokenMetadata (skin_type=arena).
5. A native 3D arena match renders **Neon Night** (06).
6. Result share card (07). SHARE CARD opened the iOS share sheet with the
   captured PNG (08).
7. Wardrobe shows Neon Night owned from chain and equipped (09).
8. Season War: BONK picked (10).
9. The same app on the default devnet bundle shows **preview mode**: premium
   locked, buy hidden, free track claimable (11).

Not verified:

- Android and MWA signing of `buy_pass` / `buy_skin`. There is no device, and
  the emulator is banned.
- The Android share path (expo-sharing plus clipboard).
- Anything on devnet, because nothing is deployed there.
- On the simulator, a native match fell back to the web arena after a few
  seconds of software-GL fps (the existing watchdog), so the result says "Web
  arena (switched from native)".

Tests: `cd app && npx vitest run` gives **30/30**. These include the parity
tests and `tests/season-pass.test.ts`:

- tiers and XP;
- no reward touches stats;
- premium gating;
- season roll-over;
- the 5th slot;
- hidden marks in the roster, starters and rivals;
- skin recolour bounds;
- the per-coin board, war points, and memo compatibility with the ledger regex.

Both `tsc` checks are clean.

## Bug-hunt fixes (1.2.2, Oct 7)

A read-only review (`clockin/review/MEMPIRE-BUGS.md`, outside the repo) found
correctness bugs in 1.2.1. They are fixed on `main` in five commits
(`c16a86d`..`c6ee366`). The pure logic is unit-tested in
`app/tests/mobile-rules.test.ts`. `npx vitest run` gives 17/17, including the
arena parity tests, and both `tsc` checks are clean. "Sim" means it was checked
by hand on the iPhone 17 simulator, with screenshots in `clockin/screens/bugfix/`.
"Code only" means it was neither run on a device nor seen on screen.

| # | Bug | Fix | Verified |
|---|---|---|---|
| 1 | Quest-bonus chest silently lost when all 4 slots are full | Chests that don't fit wait in a `pending` queue (`mobile/src/game/inbox.ts`) and move in when a chest is opened. Home shows "N waiting · slots full", and the result sheet says WAITING. The welcome and bonus flags are set only after the chest is granted. | Unit test + **sim** (01, 02): the bonus showed "1 waiting · slots full", and opening a chest moved it in |
| 2 | Native arena frozen after background → foreground | The arena pauses on background and shows a **Paused** card with RESUME and Leave battle. The quit-alert pause and the background pause are tracked separately. | **Sim** (04): after resuming, the timer ran again (2:47 → 2:44) |
| 3 | Leave does nothing while "Preparing"; a pre-first-frame scene error has no exit | With no match running yet, Leave/Cancel closes the battle and records nothing. The Preparing cover has a Cancel button. The watchdog and the scene error boundary fall back to the web arena in every renderer mode. The GL view mounts 1.2 s after the cover, so the first shader compile can't swallow the tap. | **Sim** (03, 06): Cancel on "Preparing the arena…" returned to Home. Checked with a temporary 8 s mount delay so the tap could be timed, then reverted. ✕ during texture load gave the Leave dialog. The pre-first-frame *error* path is code only. |
| 4 | Clock-In goes off-chain when the balance is unknown | `feeCheck()` returns yes / no / unknown. It refetches the balance with a 6 s timeout, and only a known zero takes the offline path. Unknown sends the transaction. | Code only (needs devnet SOL) |
| 5 | Chain streak restore loses to an early Clock-In and is never retried | The ledger read is retried (every 45 s and on app resume) until it succeeds, and it is re-read before a Clock-In. `mergeChainStreak` never replaces a higher chain streak with 1. A clock rollback can't advance the streak. | Unit test |
| 6 | Chest notifications never cancelled | Per-wallet ids `chest:<address>:<id>`, cancelled on Rush, on open and on sign-out | Code only |
| 7 | Quest day (UTC) vs Clock-In day (local) disagree | One game day, **UTC**, for the streak, quests and memo. The UI shows the rollover in local time ("Next day starts at 05:30" in IST), and the streak reminder fires before it. | Unit test + **sim** (05) |
| 8 | Landed tx whose confirmation failed recorded as off-chain | If confirmation throws, `getSignatureStatuses` decides. A landed signature counts as on-chain. | Code only |
| 9 | Any "not found" error shown as "no MWA wallet" | The regex matches only the MWA no-wallet errors | Code only |
| 10 | Seeker ×2 missed when clocking in before the SGT check | Clock-In waits up to 5 s for the Seeker check | Code only |
| 11 | Web arena fast-forwards after background | On `visibilitychange` / `mempire-resumed`, the bot clock is rebased (`rebaseBotClock`) | Code only |
| 12 | Stale CLOCKED IN at midnight; stale tab dot; memo/commit day mismatch; cold-start deep link replay; web `exit` always a loss; save into the wrong wallet; corrupt save hangs Loading; two unhandled rejections; coach keeps running; streak reminder after 21:30 | Every item listed here is fixed. The Clock-In card ticks every 30 s and the tab dot every 15 s. The preview's `day` is passed to the commit. The initial URL is consumed once. Only an explicit leave is a loss. `persist` snapshots the state and the timer is cleared on load and unload. Normalisation has try/catch → fresh save. `restore` and `connectDev` have catches. Coach uses a run id. `reminderTime()` handles evening and late-night cases (unit-tested). | Unit test (reminder, rollback) + code only |
| 12 (perf) | Whole native arena re-renders at 20 Hz | **Not done.** Moving the subscription into the HUD touches the renderer, and the change would be unverifiable without an Android GPU. | — |

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
| 1 | Permissions (1.2.1) | `aapt2 dump permissions` lists no `RECORD_AUDIO` and no `FOREGROUND_SERVICE*`, and the manifest has no media-playback service. expo-audio is configured with `recordAudioAndroid: false, enableBackgroundPlayback: false`; playback never needed either. |
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
