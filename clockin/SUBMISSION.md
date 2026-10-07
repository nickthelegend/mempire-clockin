# Mempire for Seeker — CLOCK IN submission

**One-liner:** A 3D card battler where every coin is a fighter, built around a
daily Clock-In: one tap a day, a streak recorded on Solana, SKR that you earn by
showing up and spend to keep the streak alive, and an on-device AI coach that
plays your deck before you do.

- **Repo:** https://github.com/nickthelegend/mempire-clockin
- **APK:** `mempire-clockin.apk` (release, signed with a dedicated release key).
  sha256 `02ffed8304cf98b814c09ef8a0a3a07b6451dc5edeb7daf87c7584dfecebf475`, 69,813,097 bytes (66.6 MiB). See *Install* below for how to download it.
- **Network:** Solana **devnet** only. No real funds move.
- **Team:** Nivesh Gajengi (@nickthelegend).

## Problem

Crypto games ask for a wallet before they have earned any attention, their
"daily rewards" are faucets that people farm and then leave, and most mobile
entries are web pages inside a frame. None of that gives a Seeker owner a
reason to open the app tomorrow.

## Solution

Mempire is a Clash-style real-time battler with a 64-fighter roster made from
memecoins, majors and tokenised stocks. The Seeker app is native throughout. The
3D battle is the game's own React Three Fiber scene, rendered natively on
expo-gl under a native HUD. A bundled web arena is kept only as an automatic
fallback (see *Native 3D arena* below).

- **Daily Clock-In.** One tap. A 7-day ladder of chests and SKR, with a
  Legendary chest on day 7. You get a streak and a best streak, plus a reminder
  before the streak lapses.
- **Chests on timers.** Each chest sends a notification when it is ready, and
  only one unlocks at a time. They hold fighters, and duplicates level cards up.
- **Battles.** Standard (3 minutes) or Rush (30 seconds), against four AI rival
  decks, in the game's React Three Fiber arena on its deterministic
  fixed-point simulation.
- **AI Coach.** Described below.
- **First run.** A three-beat intro, then a guided 30-second first battle with
  coach marks and a Golden welcome chest. A new player is in a match within a
  minute.
- **Daily quests.** Clock in, win a battle, deploy 10 cards. They reset at UTC
  midnight and pay SKR; finishing all three adds a Silver chest.
- **Reminders and sharing.** An evening reminder fires if today's Clock-In
  hasn't happened, so the streak isn't lost. Any rival can be sent to a friend
  as a link.
- **Feel.** Haptics everywhere, a Clock-In "stamp", counters that tick up,
  press states on every control, sound and music with a mute toggle, and
  Reduce Motion respected. Text scales cleanly up to the largest standard
  Dynamic Type size.

### Native 3D arena

- **Rendering.** `@react-three/fiber/native` on `expo-gl` draws the same scene
  as the web game. Its procedural textures are baked to PNG by a deterministic
  script.
- **Controls.** The HUD is native, with PanResponder drag-to-deploy, a ground
  raycast, and haptics on deploys and crowns.
- **Logic parity.** A committed test plays scripted Rush and Standard matches
  through both the native match store and the web match store from the same
  seed. Both stores must reach the same final tick, the same tower HP, the
  same winner and the same state hash.
- **Safety net.** In Auto mode, if the native scene can't start, throws, or
  stays under 20 fps for 5 s in the first 15 s, the *same* match (same seed,
  decks and rival) moves to the bundled web arena. The result screen shows
  which renderer ran. Settings offer Auto / Native 3D / Web (compat).
- **What was measured.** I verified the native arena on the iOS simulator,
  where OpenGL ES is software-rendered and the scene ran at about 4 fps; full
  matches still played to a result. Frame rate on real GPU hardware has not
  been measured.

## Why Seeker users come back daily

The session takes under a minute: three daily quests on Home give it shape. You clock in to keep the streak (the
notification arrives the evening before it would lapse), start a chest timer
that will ping you, and play a 30-second Rush match. Day 7 is a Legendary chest.
SKR earned from streaks buys **Streak Shields**, so the habit protects itself.
**Seeker Genesis Token holders earn double SKR on every Clock-In.**

## Solana usage

- **Mobile Wallet Adapter** (`@solana-mobile/mobile-wallet-adapter-protocol-web3js`
  2.3) is the primary sign-in on Android (Seed Vault, Phantom, Solflare). The
  `auth_token` is kept in the OS keystore, and every transaction is approved in
  the wallet. On iOS, MWA is not loaded at all (it is required lazily, Android
  only). A clearly labelled **devnet-only dev wallet** covers iOS and emulators
  with no wallet installed.
- **Clock-In proof.** Each Clock-In is a v0 transaction containing a Memo
  instruction `mempire:clockin:v1:day=YYYYMMDD:streak=N`, signed by the
  player. The streak can be rebuilt from the wallet's signature history
  (`readClockIns` in `mobile/src/chain/solana.ts`).
- **SKR stand-in payouts** use the same transaction (see SKR below).
- **Season Pass and skins on Token-2022** (new program `mempire_pass`,
  `3aykd5NLqwjALGiaPykRiGJhv1ehJsjxqVsjQ5qGtr7G`, `chain/pass/`):
  - The pass is a **soulbound** Token-2022 mint with the NonTransferable,
    MetadataPointer and TokenMetadata extensions. Its name, symbol, uri,
    season, tier and end time are all stored on the mint.
  - Skins are **transferable** Token-2022 mints with on-chain metadata
    (`skin_type`).
  - `buy_pass` / `buy_skin` move SKR to a treasury vault PDA and mint 1 token
    in **one instruction**. A receipt PDA blocks a second purchase.
  - The app reads ownership with `getTokenAccountsByOwner` on Token-2022.
  - `anchor test` passes 10/10 on a local validator, and the full buy → premium
    → claim → skin → equip → native arena flow ran on the iOS simulator against
    it.
  - **Not deployed on devnet yet** (no devnet SOL). The APK shows "preview
    mode" until the one-command deploy runs.
- **Season War pledge on chain.** Picking BONK or POPCAT adds
  `:war=1:side=…` to each signed Clock-In memo, so the war can be tallied from
  chain by anyone.
- **Existing Mempire programs on devnet:**
  - `BnLDCAREDpBGenqZr8BTyQu7BCoVewF9XEtMPFBqFxeP` (cards, match escrow, settlement)
  - `3G4GidvjQd3yQK4bqZfem8Kkmcboygze42RcjrXg5g6N` (MagicBlock rollup match log, VRF chests)

  The web game uses these. The Seeker app's fighters use the same devnet coin
  registry mints, and archetypes come from the same hash the program uses.

**Devnet transaction links: none yet, and that is the honest state.** Every
devnet faucet request on Oct 6 returned 429, so neither the deployer nor the
demo wallet has SOL, and no Clock-In memo or SKR transfer from the app has been
sent. The app handles this case on screen: the Clock-In is kept on the device
and labelled "Not on-chain: no devnet SOL for the network fee". HANDOFF.md
lists the two funding steps that turn on the on-chain path.

What *has* been executed on-chain is the same code against a local validator
that runs the real devnet `spl-token-faucet` program (`npm run verify:local`,
9/9 checks). In that run, Clock-In memos land and mint the stand-in SKR, the
streak is rebuilt from chain, a Shop payment reaches the treasury, and the
faucet cap holds.

## SKR integration

SKR is the currency of consistency. You **earn** it by clocking in (5 to 30
per day on the ladder) and by winning (3). You **spend** it on things that keep
you showing up:

- **Streak Shield, 15 SKR.** Miss a day without losing the streak. It is used
  automatically.
- **Seeker Chest, 40 SKR.** A Magic chest that opens instantly.
- **Rush Unlock, 8 SKR.** Finishes the chest that is currently unlocking.

- **Season Pass, 150 SKR** (a price hypothesis). It unlocks the premium track of
  25 tiers: chests, chest slots, Streak Shields, frames and emotes. The free
  track is open to everyone.
- **Skins: 60 SKR per arena skin, 25 SKR per card frame.** Neon Night, Golden
  Hour and Frozen Ledger recolour the native 3D arena. Four frames dress your
  cards.

There is no staking, and you can never pay for power.

The mobile build hides every tokenised-stock fighter (Apple, NVIDIA, Tesla,
Disney and others, 20 in all) because Mempire has no licence for those marks.
They come back only as licensed partners. The 44 crypto and meme fighters stay.

**Seeker Genesis Token** holders earn double SKR. The check is read-only
against mainnet: a non-zero Token-2022 account whose mint's metadata pointer
and token-group membership both point to `GT22s89n…`. The app also shows the
wallet's real mainnet SKR balance (`SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`),
read-only.

**On devnet** real SKR does not exist, so the app uses a stand-in labelled
**"SKR (devnet stand-in)"** that has SKR's exact shape: classic SPL, 6
decimals, `transferChecked`. The public `spl-token-faucet` program
(`4bXpkKSV8swHSnwqtzuboGPaPDeEgAn4Vt8GfarV5rZt`) holds its mint authority, so
the Clock-In transaction mints the day's reward and no key ships in the APK.
`mobile/scripts/setup-skr-devnet.mjs` creates the mint with one command.
**Status in the submitted APK:** the stand-in mint has **not** been deployed
yet (it needs about 0.02 devnet SOL). The APK therefore runs SKR as a
device-local balance, labelled **SIMULATED** on every screen where it
appears. After `setup-skr-devnet.mjs` runs, a rebuild switches the same
screens over to the on-chain stand-in.

## AI

The **AI Coach** runs entirely on the device. It runs the game's own
deterministic battle engine (`app/src/sim`, shared into the app) headlessly:
your eight cards against each of the four rival decks, four seeds per rival,
each seed played from both seats, with the game's AI pilot playing both sides.
It reports the win rate, a bar for each matchup, your toughest rival and tower
damage. It then searches your collection for the single swap that raises the
measured win rate, testing every candidate on the same seeds, and offers it
with one tap. Every number it shows comes from simulated matches, and the
sample size is stated. On the iOS simulator it ran 24 matches in 1.3 s. There
is no LLM and no server.

## Install

1. Download `mempire-clockin.apk` from
   https://github.com/nickthelegend/mempire-clockin/releases/download/clockin-v1/mempire-clockin.apk
   and install it. Android may ask you to allow
   installs from this source.
2. Open it, then tap **Connect Wallet** (a Mobile Wallet Adapter wallet is
   needed) or **Use dev wallet**.
3. For on-chain Clock-Ins, fund the address shown in the wallet sheet with
   devnet SOL from https://faucet.solana.com, or tap **Get devnet SOL**.

## Screens

See `clockin/screens/`. These were captured on the iOS simulator (iPhone 17),
running the release build of this repo.
