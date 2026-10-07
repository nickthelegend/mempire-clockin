# Mempire

**Every coin is a fighter — and the Seeker app gives you a reason to show up every day.**
A 3D real-time Clash Royale-style card battler on Solana where the roster is the
market itself — memecoins, majors and tokenised stocks, each one a card with its
own art, archetype and stats. This repository is Mempire's entry to the
**Solana Mobile CLOCK IN** hackathon: a native Android (Seeker) and iOS app built
around a daily Clock-In loop. The whole app is native, including the 3D battle.

## Mempire for Seeker (CLOCK IN)

`mobile/` is an Expo 57 / React Native 0.86 app, and it is native end to end.
The 3D battle is the web game's own React Three Fiber scene, rendered natively
with `@react-three/fiber/native` on `expo-gl`. It sits under a native HUD, with
drag-to-deploy, the shared deterministic simulation, and the same AI rival.

| | What it does | Where |
|---|---|---|
| **Mobile Wallet Adapter** | Primary sign-in on Android (Seed Vault on Seeker, Phantom, Solflare). Auth token kept in the OS keystore, every transaction approved in the wallet. A clearly labelled **devnet-only dev wallet** covers iOS and wallet-less emulators. | `mobile/src/wallet/wallet.ts` |
| **Daily Clock-In** | One tap a day. A 7-day reward ladder (chests and SKR, Legendary chest on day 7), streak + best streak, reminders before the streak lapses. Each Clock-In is a **signed devnet memo** (`mempire:clockin:v1:day=…:streak=…`), so the streak is a public record anyone can rebuild from chain. | `mobile/src/game/rules.ts`, `mobile/src/chain/solana.ts` |
| **SKR** | Earned by clocking in and winning; spent on **Streak Shields** (miss a day, keep the streak), a **Seeker Chest**, and **Rush Unlock**. Never on power. On devnet it is a labelled stand-in mint with real SKR's shape (classic SPL, 6 decimals, `transferChecked`), paid out by the public `spl-token-faucet` program so no key ships in the app. **Seeker Genesis Token** holders earn double SKR (read-only mainnet check). | `mobile/src/chain/skr.ts`, `mobile/src/chain/seeker.ts` |
| **AI Coach (on-device)** | Runs the game's real deterministic battle engine headless on the phone: your deck vs every rival, both seats, fixed seeds — then searches for the single swap from your collection that wins more, and shows the numbers behind it. No server, no LLM, nothing leaves the device. | `mobile/src/game/coach.ts` |
| **First run** | A three-beat intro (Clock-In, battle, SKR), then a guided 30-second first battle with touch-through coach marks and a Golden welcome chest. Skippable, and replayable from settings. | `mobile/src/screens/Intro.tsx`, `CoachMarks.tsx` |
| **Daily quests** | Clock in, win a battle, deploy 10 cards. They reset at UTC midnight, pay SKR, and finishing all three adds a Silver chest. There is also an evening streak-at-risk reminder and a "Challenge a friend" share (deep link plus web fallback). | `mobile/src/game/rules.ts`, `src/notify.ts` |
| **Season Pass (Token-2022)** | 25 tiers, free + premium, XP from clock-ins, quests and battles; rewards are chests, chest slots, Streak Shields, frames and emotes — never stats. The premium pass is a **soulbound Token-2022 token** (NonTransferable + MetadataPointer + TokenMetadata) bought for SKR from the `mempire_pass` program in one instruction; premium is whatever the chain says the wallet holds. Preview mode until the program is deployed on devnet. | `chain/pass/`, `mobile/src/chain/pass.ts`, `mobile/src/game/season.ts` |
| **Skins & wardrobe** | 3 arena skins (Neon Night, Golden Hour, Frozen Ledger) rendered by the native 3D arena from baked texture variants, and 4 card frames — transferable Token-2022 tokens with on-chain metadata, sold for SKR, equipped in Deck → Wardrobe. | `app/src/three/skin.ts`, `mobile/src/screens/Shop.tsx` |
| **Season War, board, share card** | BONK vs POPCAT: your side is written into each signed Clock-In memo. A per-coin board of your battles, and a result share card (image + challenge link). Unlicensed company fighters are hidden from the mobile build. | `mobile/src/game/board.ts`, `mobile/src/screens/ShareCard.tsx` |
| **Sign In With Solana** | One tap: MWA `authorize` with a SIWS payload (domain, nonce, issuedAt, `solana:devnet`), so Seed Vault authorizes and signs in one sheet. The ed25519 signature and the signed fields are verified on the phone ("Signed in with Seed Vault"). Wallets without SIWS sign the same message via `signMessages`. On iOS the dev wallet signs it locally. | `mobile/src/chain/siws.ts`, `mobile/src/wallet/wallet.ts` |
| **.skr names** | The player's `.skr` (AllDomains, read-only mainnet, cached, 6 s cap) replaces the address in the header, wallet sheet, share card and leaderboard row, and never blocks: the short address shows until the name arrives. **Find a Seeker** resolves `alice.skr` ↔ address. | `mobile/src/chain/skrName.ts`, `mobile/src/state/identity.ts` |
| **Approve once, play all week** | One wallet signature links a session key (SecureStore) for 7 days, with a memo `mempire:session:v1:<key>:<expiresAt>` and a 0.001 SOL fee float. Daily Clock-Ins are then signed by that key, with no prompt, and name the owner. The ledger read-back accepts them only with an owner-signed, unexpired, unrevoked link. Revoke sweeps the float back. | `mobile/src/chain/session.ts`, `mobile/src/wallet/sessionKey.ts` |
| **Provably fair chests** | Each chest commits to a future slot (current + 32). On open, `sha256(blockhash ‖ chestId ‖ owner)` drives the same drop table. The reveal has **Verify**: slot, blockhash, formula, explorer link and an in-app **Recompute**. Verifiable with Solana slot hashes (not VRF). | `mobile/src/chain/fair.ts` |
| **Blinks** | Solana Actions on Vercel ([mempire-actions.vercel.app](https://mempire-actions.vercel.app)): **Challenge a friend** (a signed devnet memo plus the app deep link) and **Buy Season Pass** (the `mempire_pass` instruction; disabled until it is on devnet). **Share Blink** is in the app. | `actions/`, `mobile/src/game/blink.ts` |
| **Collection, deck, chests** | 64 fighters, levels from duplicates, chest timers with local notifications, haptics throughout. | `mobile/src/screens/` |
| **Native 3D arena** | The web game's scene (`app/src/three`) runs in an expo-gl GL view. Its canvas-drawn textures are baked to PNG by a deterministic script. The native HUD has hand, elixir, timer and crowns, plus PanResponder drag-to-deploy with a ground raycast and haptics on deploys and crowns. It uses the same deterministic sim and bot as the web client. **Safety net:** if the native scene fails to start, throws, or holds under 20 fps for 5 s early in a match, the *same* match (same seed, decks and rival) restarts in the bundled web arena, and the result records which renderer ran. Settings offer Auto / Native 3D / Web (compat). Parity is proven by a test: both match stores play identical scripted matches to identical end states (`app/tests`). | `mobile/src/arena/` |

**Honest status of the native arena:** I verified it on the iOS simulator. There, OpenGL ES is a software renderer and the scene draws at about 4 fps; full matches still play to a result. Frame rate on real GPU hardware has not been measured, because no Android device or emulator was available. That is exactly why the automatic fallback exists. Auto mode uses the web arena on simulators.

### Solana Mobile tech pack

These are five Seeker-native Solana features, shown in the table above.
Each has unit tests (`cd app && npx vitest run`, 72 tests in total) and an
end-to-end check on a local validator:
`bash mobile/scripts/verify-solana-tech.sh` (session key and fair chests, 19
checks) and `bash actions/scripts/verify-local.sh` (both Blinks, including a
Season Pass minted from the Blink transaction, 8 checks). Every one was also
run in the app on the iOS simulator (screens in `clockin/screens/solana-tech/`).

How they work:
- **SIWS.** The sign-in is verified on the phone; nothing is sent to a server.
- **Session key.** The key's authority is a rule anyone can recompute from
  chain: an owner-signed link that has not expired and has not been revoked.
  It is not an on-chain delegate.
- **Chests.** Drops are fixed by a blockhash nobody knew when the chest was
  earned. The commit is stored on the device, and this is not a VRF.

What is not verified yet:
- None of the five features has been run on an Android device, and MWA
  `signIn` has not been tested with a real wallet.
- The Season Pass Blink stays disabled until `mempire_pass` is deployed on
  devnet.
- dial.to was down when I tested, so the Blink was only seen through curl
  and on a local validator.

Details and exact commands are in [HANDOFF.md](HANDOFF.md#solana-mobile-tech-pack-branch-solana-tech-oct-8).

**Release APK:** `mempire-clockin.apk` on the [`clockin-v1` release](https://github.com/nickthelegend/mempire-clockin/releases/tag/clockin-v1), version 1.4.0 (versionCode 9), sha256 `f089f3ab35898af66e700e5cd5f75d21bec5064f909d0aa5675d044b60c50534`. Devnet only. It is signed with the project's release key and has not been run on an Android device yet.

Build and run (details in [HANDOFF.md](HANDOFF.md)): from `mobile/`, `npm run ios:sim`
(iOS simulator), `npm run apk` (signed release APK). Submission material is in
[`clockin/`](clockin/).

## The game

The game below is the web client the arena comes from. You never hand over your
holdings: coins are *characters*, not collateral. The web build also runs at
[play.mempire.fun](https://play.mempire.fun) on devnet.

## How it plays

1. **Play** — open the site and you're in. Guest mode is a real keypair in your
   browser, so the whole game works with no wallet installed; connect Phantom,
   Solflare, Coinbase, Trust or Nightly whenever you want to own things properly.
2. **Collect fighters** — 36 verified assets at launch: majors (BTC, ETH, SOL),
   memecoins (BONK, POPCAT, MEW, PEPE, BRETT), and tokenised stocks (NVDA, META,
   MSTR, V). Coin → archetype is deterministic: `fnv1a(mint) % 6` → Tank / Swarm
   / Ranged / Splash / Support / Spell, so a card's identity is fixed by its mint
   and nobody can reroll into a better one.
3. **Mint cards** — 0.02 SOL. That mints *a card*, an account you own, not your
   coins. Holding the underlying token is not required and never was on this
   build; anyone can field any fighter in the registry.
4. **Level by winning** — win a match, earn a chest; chests drop duplicates;
   merging a duplicate promotes the card, 1 → 10. Levels are earned, never
   bought: there is no way to pay for power.
5. **Battle** — pick a tier (0.05 / 0.25 / 1 / 5 SOL, bracketed by deck power),
   **drag cards onto your half** of the arena (a ghost tracks your finger, the
   ring turns teal when the drop is legal and red when it isn't), fell towers for
   crowns, pot settles onchain. House rake 10% (5% on a draw).

Stakes escrow only when the match actually starts — cancelling a search costs
nothing. If an opponent abandons, the pot is recoverable by timeout, and the
result screen always says which of those happened.

## Architecture

```
app/    Vite + React + TS + React Three Fiber + Zustand
        └─ src/sim      deterministic lockstep engine: fixed-point i32 (1/1024),
                        20 ticks/s, 3min + 60s OT, xorshift RNG, FNV-1a state
                        hash every 40 ticks, 2-tick input delay, bot opponent
        └─ src/three    Clash-style arena (checkered grass, wood frame, river,
                        scenery) + rigged chibi units with real skeletal
                        animation, stone towers with tracking cannons
        └─ src/chain    client for the deployed program: PDA derivation, typed
                        reads, every write instruction, deck commitments, and a
                        read-only provider that throws if anything tries to sign
        └─ src/screens  Arena / Cards / Deck / Clan / Empire / Battle
        └─ src/state    collection · deck · match · economy · clan · chain · sync
        └─ public/art   logo, 12 coin logos, 6 crests, tab icons, chests, ad board
        └─ public/sfx   10 SFX + menu and battle music loops
        └─ public/models 5 rigged chibi units, meshopt-compressed (1.7MB total)
chain/  Anchor workspace — program `mempire`, LIVE on devnet
        config · coin registry · card PDAs · merge-to-level · Metaplex 1-of-1s
        match escrow + two-claim settle + timeout claims · MagicBlock rollup
        (`nft` and `rollup` are cargo features — see MAINNET.md for why)
        scripts: seed-devnet (resumable) · verify-devnet · e2e-devnet (16 checks)
server/ Express API — player persistence (MongoDB), cached live coin feed,
        leaderboard, the full clan service (48-assertion integration test),
        and the Bags market proxy (holds the API key so the browser never does)
design/ generation pipeline: gen.sh, gen-audio.sh, gen-3d.sh, slice.py
```

**Battle model** (the onchain story): card plays are an input log
`{tick, player, deckIndex, x, y}`. Both clients run the identical integer-only
sim; state hashes commit every 40 ticks; settlement takes the final hash.

That log lives on a [MagicBlock ephemeral rollup](https://magicblock.gg), live on
devnet at `3G4Gidvj…5g6N`. A `MatchLog` PDA is delegated at match start, card
plays and hash checkpoints are written to the rollup, and
`commit_and_undelegate` returns the sealed log to Solana at the end.

The rollup program is deliberately separate from the money program and has **no
transfer path**, so a delegated log can never strand a pot — escrow and payout
stay on base layer in `mempire`, and a stalled rollup degrades to
`claim_timeout`.

**The log is private (PER).** The sim runs two ticks behind the input a player
submits, which is what hides network latency — and that delay is only safe while
nobody can read the log faster than the sim consumes it. An observer polling the
rollup could otherwise see the opponent's card and placement *before* it resolves
on screen. So the log is sealed inside a TEE-backed validator with an ER-local
`EphemeralPermission` whose only members are the two seats. Delegation decides
where the account lives; the permission decides who may look. There is no
base-layer permission account — it is created, updated and closed entirely on
the rollup, and closed before the log is undelegated.

**Chests are rolled by VRF.** Chest tiers used to be `Math.random()` in the
client, which is exactly the mechanic players are right to distrust in a game
that also holds real SOL. They now come from the MagicBlock VRF oracle, and the
32 bytes that produced each drop are stored on the chest so anyone can re-derive
it. Requests go to the *delegated* queue from inside the rollup: MagicBlock
prices ER randomness at zero and base-layer randomness at 0.0008 SOL per
request, and a player opening four chests a session should not pay a fraction of
a fortune in oracle fees for cosmetics.

Measured play latency, both stated with their conditions because they differ by
two orders of magnitude: **7–17ms** on localnet, where the ER is on the same
machine, and **~475ms confirmed** against the hosted devnet rollup, which is
dominated by network round-trip and `confirmed` commitment rather than by
execution. The honest read is that the ER's benefit is real but co-location
dependent; the architectural win here is that the input log is genuinely onchain
rather than relayed by our own server.

```bash
# devnet (includes hosted router placement)
cd chain && BASE_RPC=https://api.devnet.solana.com npx tsx scripts/e2e-rollup.ts
# localnet (needs `npx mb-stack` running)
cd chain && npx tsx scripts/e2e-rollup.ts
```

## Run it

```bash
# app — reads the live devnet program; guest mode needs no wallet
cd app && npm install && npm run dev

# sim determinism check
cd app && npx tsx scripts/sim-test.ts

# program (already live at BnLDCAREDpBGenqZr8BTyQu7BCoVewF9XEtMPFBqFxeP)
cd chain && anchor build

# devnet seed: coin registry + config (resumable on 429)
cd chain && npx tsx scripts/seed-devnet.ts

# build the mainnet roster from Jupiter-verified identities (read-only, free)
cd chain && node build-mainnet-registry.mjs

# the v2 launch build — 599 KB, ~4.2 SOL to deploy (see MAINNET.md)
cd chain && anchor build -- --no-default-features --features mainnet,rollup

# read the live onchain state back
cd chain && npx tsx scripts/verify-devnet.ts

# prove the onchain half end to end (spends ~0.004 devnet SOL)
cd chain && npx tsx scripts/e2e-devnet.ts

# clan API integration test + demo clans (server must be running)
cd server && node test-clans.mjs && node seed-clans.mjs

# persistence + live coin API (needs server/.env — see server/.env.example)
cd server && npm install && npm run dev
```

Everything above talks to the real deployed program on devnet — cards, matches,
escrow and settlement are signed transactions, not a mock. You can play with no
wallet installed (guest mode is a real keypair in the browser) and with no
holdings at all. A bot fills in when nobody is queued, and says so: a bot match
reads NO STAKE and escrows nothing, because a bot has no key to escrow with.

## Fees (the business)

| Action | Fee | Live? |
|---|---|---|
| Battle rake | 10% of pot (5% on a draw) | yes |
| Card mint | 0.02 SOL | yes |
| Chest timer skip | 25 $MEMPIRE | yes |
| Extra chest slot | 100 $MEMPIRE | yes |
| Shop purchase / paid reroll | 250 / 35 $MEMPIRE | yes |
| Clan charter | 250 $MEMPIRE | yes |
| Merge fee | 100 × level $MEMPIRE | yes |
| NFT royalties | 5% | on tokenised cards |
| **Win reward** | **−50 $MEMPIRE, paid to the winner** | yes |

The last row runs the other way, and it is the only emission in the game: a
settled win pays 50 $MEMPIRE out of a treasury vault, on chain, in the same
instruction that pays the pot. That is how a new player gets their first
currency without a faucet, a purchase or an airdrop — nothing on mainnet drips
$MEMPIRE, so it has to be won.

Every line above is shipping today, not roadmap. Two honest notes on the merge
fee, because "you can't buy power" would be too strong a claim: levelling needs
a **duplicate**, and duplicates come from chests you earn by winning — but the
daily shop mints real cards, so a paid path to a duplicate does exist. It is
four rotating offers, not a targeted upgrade, and the merge itself still
charges 100 × level. What is genuinely absent is any fee on a player's own
tokens, because the game never holds them.

## Go-to-market

**Positioning: the market is the roster.** Clash Royale, except every fighter is
a real asset — BONK, POPCAT, NVDA, BTC — with art and stats of its own. That reads
instantly to two audiences who never share a game: crypto people who know the
tickers, and mobile gamers who just want a good three-minute match. Critically,
nobody has to own anything to play, so the top of the funnel is the entire
internet rather than the subset holding eight specific tokens.

### Why the funnel converts

Ten seconds to playing: no install, no wallet, no holdings. Win a match, earn a
chest; chests drop duplicates; merging promotes a card. Wanting to keep what
you've won is what makes a wallet worth connecting — and a connected wallet
unlocks real pots and cards that show up in Explorer as NFTs you own. Each step
is a live, tested flow (`VERIFICATION-REPORT.pdf`), so growth is a volume
problem, not a fixing problem.

### Channels

| Channel | Why it compounds |
|---|---|
| **Asset communities** | 36 verified fighters at launch, each with a community that wants *their* ticker to top the board. Per-asset leaderboards and season wars give BONK vs POPCAT a scoreboard. Getting added to the roster is the BD ask — and it costs them nothing, because we never touch their token. |
| **Solana ecosystem** | A real-time onchain game with escrowed pots and settlement is a showcase integration, which earns listings and co-marketing without ad spend. |
| **Creators & clips** | Three-minute matches with real pots are natively clippable, and SHARE 𝕏 is already on the result screen. Seed a small creator pool in $MEMPIRE. |
| **Onchain receipts** | Every pot and NFT is a public transaction. The Explorer link is the ad. |

### Phased launch

1. **Now — devnet open beta.** Free, weekly leaderboard seasons, zero spend.
   Goal: a Discord of regulars and proof the loop is fun before money moves.
2. **v1 — the token, ~0.1 SOL.** Launch $MEMPIRE on [bags.fm](https://bags.fm),
   which runs on Meteora's Dynamic Bonding Curve: the market makes itself, the
   token gets a Dexscreener listing, and the creator earns **1% of all trading
   volume forever, in SOL**. This replaces deploying our own AMM (1.96 SOL plus
   liquidity to seed) with something that pays instead of costs.
3. **v2 — real pots, +4.2 SOL.** The whole game, escrowed PvP, the 36-asset
   roster, small tiers only (0.05 SOL cap) — with settlement delegated to a
   **MagicBlock ephemeral rollup**, so the version that first touches real money
   is also the one that proves the rollup on mainnet. Dropping the rollup saves
   0.90 and ships the same game on base layer alone; `MAINNET.md` argues against
   it. Nearly all of the 4.2 is *recoverable rent* — closing the program returns
   it, so the real spend is around 0.05 SOL of fees.
4. **v3 — everything, +3.84 SOL.** NFT cards in the core program, plus the
   separate `mempire_rollup` deploy that adds VRF-rolled chests, the
   play-by-play log, PER sealing and session keys. Grown in place with
   `solana program extend` and funded out of rake rather than out of pocket.
5. **Then** — clan tournaments with rake-funded prizes, the Seeker app on the
   Solana dApp Store, a third-party audit, higher tiers.

### Revenue is shipping, not planned

Rake on every pot, card mints, chest skips and slots, shop purchases and paid
rerolls, clan charters. $MEMPIRE has six sinks against a single emission — 50
per win, from a vault the treasury fills — which is the right ratio and the
right order, and none of it depends on anyone locking up an asset.

### KPIs that decide the next phase

Guest→wallet conversion · D1/D7 retention · matches per DAU · weekly rake ·
asset communities activated · % of matches that settle onchain.

## Design

**Royale Arcade** — Clash Royale's chrome carrying Mempire's content: a quilted
royal-blue field, carved wood panels, fat buttons that depress into their own
base edge, chunky outlined display type (Lilita One). Royal gold means exactly
one thing: SOL is moving. One centered 430px column, arcade-cabinet on desktop.
Verified at 320/375/430px: no readable string under 12px, no touch target under
44px, no horizontal overflow.
Full authority in `DESIGN.md`; product truth in `PRODUCT.md`; the monetization
argument in `FEATURES.md`; the 50-item build plan in `ROADMAP.md`; what comes
after the hackathon in `AFTER_HACKATHON.md`.

Art and audio are generated through the Higgsfield CLI and committed:
`design/gen.sh` (images), `design/gen-audio.sh` (sound), `design/slice.py`
(cuts grid sheets into keyed transparent PNGs). One STYLE FORMULA, held
byte-identical across every prompt, keeps the set coherent.

## Status & roadmap

- [x] Deterministic sim + bot + 3D battle + full screen flow (playable now)
- [x] Drag-and-drop deploy, crown score, sound, spawn/damage VFX
- [x] Wallet picker (Phantom/Backpack/Solflare + Guest), error boundary
- [x] Generated art + audio set wired in
- [x] Anchor program: registry, cards, merge-to-level, escrow, settle, timeouts
- [x] Devnet seed script (coin registry + config, resumable)
- [x] Official Solana wallet adapters with real logos
- [x] Chests, Gems, card inspector with live pump.fun market data
- [x] MongoDB persistence, model compression (46MB → 1.7MB), loading screen
- [x] Rigged animated units, Clash-grade arena, daily Shop, practice mode
- [x] Full design audit: 21 findings closed, 12px legibility floor enforced
- [x] MagicBlock ephemeral rollup live on devnet: card plays onchain, 23/23 e2e
- [x] **PER** — match log sealed to its two seats inside an ER-local ephemeral
      permission; **VRF** — provably-fair chest tiers from the oracle, with the
      randomness stored for verification. 20/20 against devnet and the live
      oracle (`scripts/e2e-per-vrf.ts`)
- [x] **Program live on devnet** — deployed and proven by a 92-item test plan
      run against the real product (`TESTPLAN.md`, `VERIFICATION-REPORT.pdf`)
- [x] Client wired: mint, merge, match escrow and settlement are wallet-signed
      transactions with explorer receipts and an honest live/offline badge
- [x] Staking retired — the game never touches a player's holdings
- [x] Clans: full backend (48-assertion test) + browse/found/join/lend UI
- [x] First-run tutorial, server leaderboard, ad-slot boards in the gutters
- [x] Human vs human: WS matchmaker, lockstep input relay, hash referee
      (desync voids the match), disconnect forfeits — 12-assertion protocol test
- [x] Chest drops mint real cards; deploy runbook (DEPLOY.md) + host configs
- [ ] Tournaments, coin sponsorship, season pass (see `ROADMAP.md`)
- [ ] Session keys (zero wallet popups mid-battle)
- [ ] Bubblegum cNFT mint layer over card PDAs
- [ ] Fusion, battle pass, cosmetics, 2v2

## Known limits, stated plainly

- **Everything verified so far is devnet.** The programs are deployed and the
  92-item plan passes against the live product, but mainnet execution waits on
  funding (`MAINNET.md`, ~4.2 SOL).
- **The programs are not third-party audited.** They have had an
  [AI-assisted security review](SECURITY-REVIEW.pdf) — nine agents over every
  line of on-chain Rust, six issues fixed including one that let a losing player
  take the whole pot, and the fixes proven on devnet by running the attack. That
  is diligence, not a guarantee, and it is not the same thing as a firm signing
  off; the write-up says so on its cover and lists the five real issues left
  open with reasons ([SECURITY-REVIEW.md](SECURITY-REVIEW.md)).
  Compensating controls: small
  stake tiers cap exposure, and the settlement design voids rather than pays
  when the two seats disagree — a cheat costs the cheater the match, it cannot
  pay them. One documented residual (`AUDIT.md` C9): a sore loser can force a
  void and get their own stake back, denying the winner the pot. They cannot
  steal. Closing it needs the play log verified onchain.
- **A lean launch defers two things.** Built without the `nft` and `rollup`
  features, cards are program accounts rather than NFTs and chests roll from a
  local seed that is labelled as such. Both come back with a program extend and
  an upgrade; matches escrow and settle identically either way.
- **The relay runs one replica.** Its matchmaking queues are in memory, so a
  deploy drops queued players — not matches, which live on chain.
- **Bots exist for solo play** and are labelled: a bot match says NO STAKE and
  escrows nothing, because a bot has no key to escrow with.
- **Guest mode is devnet-only for signing.** On mainnet a browser-held key is
  refused for anything that holds value, and the connect screen says so.
