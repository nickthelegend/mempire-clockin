# Mempire for Seeker — CLOCK IN submission

**One-liner:** A 3D card battler where every coin is a fighter, built around a
daily Clock-In: one tap a day, a streak recorded on Solana, SKR that you earn by
showing up and spend to keep the streak alive, and an on-device AI coach that
plays your deck before you do.

- **Repo:** https://github.com/nickthelegend/mempire-clockin
- **APK:** `mempire-clockin.apk` (release, signed with a dedicated release key).
  sha256 `__APK_SHA__`, __APK_SIZE__. See *Install* below for how to download it.
- **Network:** Solana **devnet** only. No real funds move.
- **Team:** Nivesh Gajengi (@nickthelegend).

## Problem

Crypto games ask for a wallet before they have earned any attention, their
"daily rewards" are faucets that people farm and then leave, and most mobile
entries are web pages inside a frame. None of that gives a Seeker owner a
reason to open the app tomorrow.

## Solution

Mempire is a Clash-style real-time battler with a 64-fighter roster made from
memecoins, majors and tokenised stocks. The Seeker app is native React Native
for the whole loop. The 3D arena ships inside the APK and opens full-screen
only for the length of a match.

- **Daily Clock-In.** One tap. A 7-day ladder of chests and SKR, with a
  Legendary chest on day 7. You get a streak and a best streak, plus a reminder
  before the streak lapses.
- **Chests on timers.** Each chest sends a notification when it is ready, and
  only one unlocks at a time. They hold fighters, and duplicates level cards up.
- **Battles.** Standard (3 minutes) or Rush (30 seconds), against four AI rival
  decks, in the game's React Three Fiber arena on its deterministic
  fixed-point simulation.
- **AI Coach.** Described below.
- **Haptics everywhere**, plus animated transitions and chest reveals.

## Why Seeker users come back daily

The session takes under a minute. You clock in to keep the streak (the
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
- **Existing Mempire programs on devnet:**
  - `BnLDCAREDpBGenqZr8BTyQu7BCoVewF9XEtMPFBqFxeP` (cards, match escrow, settlement)
  - `3G4GidvjQd3yQK4bqZfem8Kkmcboygze42RcjrXg5g6N` (MagicBlock rollup match log, VRF chests)

  The web game uses these. The Seeker app's fighters use the same devnet coin
  registry mints, and archetypes come from the same hash the program uses.

__CHAIN_EVIDENCE__

## SKR integration

SKR is the currency of consistency. You **earn** it by clocking in (5 to 30
per day on the ladder) and by winning (3). You **spend** it on things that keep
you showing up:

- **Streak Shield, 15 SKR.** Miss a day without losing the streak. It is used
  automatically.
- **Seeker Chest, 40 SKR.** A Magic chest that opens instantly.
- **Rush Unlock, 8 SKR.** Finishes the chest that is currently unlocking.

There is no staking, and you can never pay for power.

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
__SKR_STATUS__

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

1. Download `mempire-clockin.apk` (direct link: a GitHub Release asset,
   published by the team) and install it. Android may ask you to allow
   installs from this source.
2. Open it, then tap **Connect Wallet** (a Mobile Wallet Adapter wallet is
   needed) or **Use dev wallet**.
3. For on-chain Clock-Ins, fund the address shown in the wallet sheet with
   devnet SOL from https://faucet.solana.com, or tap **Get devnet SOL**.

## Screens

See `clockin/screens/`. These were captured on the iOS simulator (iPhone 17),
running the release build of this repo.
