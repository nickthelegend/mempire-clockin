# Mempire for Seeker — pitch outline

Nine slides. Each has the on-slide content and speaker notes. The content goes
on the slides themselves (the portal does not read notes).

---

## 1. Mempire — every coin is a fighter

**On the slide:** logo, five fighter cards fanned (BTC, BONK, SOL, WIF, NVDA),
tagline: *Clock in daily. Build your deck. Battle in 3D.*

**Notes:** Mempire is a real-time card battler where the roster is the
market: 64 fighters drawn from memecoins, majors and tokenised stocks. For
CLOCK IN we built the Seeker app around one question: why would someone open
this every day?

## 2. The problem

**On the slide:**
- Crypto games ask for a wallet before they have earned a minute of attention.
- Daily-reward loops in crypto are faucets that people farm and leave.
- Most "mobile" crypto games are web pages in a frame.

**Notes:** We wanted a habit that is fun on its own, uses the phone, and has
on-chain moments only where they actually add something.

## 3. The daily loop

**On the slide:** the Home screen. Clock-In card with the 7-day ladder. Chest
rail. Battle button.

- One tap a day. Day 7 is a Legendary chest.
- Chests unlock on timers, and the phone pings you when one is ready.
- A Rush battle takes 30 seconds.

**Notes:** The daily session is under a minute: clock in, start a chest, play a
rush match. The streak and the timers are what bring people back, and the
notification lands before the streak lapses, not after.

## 4. On-chain where it counts

**On the slide:**
- Each Clock-In is a **signed devnet memo**, `mempire:clockin:v1:day=…:streak=…`.
  The streak is a public record that anyone can rebuild from chain.
- Wallet: **Mobile Wallet Adapter** (Seed Vault on Seeker). The app never sees a key.
- The battle engine is the same deterministic sim that the web game's
  on-chain match log uses.

**Notes:** We put the proof of showing up on chain. We did not put every
button press there. On iOS and wallet-less emulators there is a labelled
devnet-only dev wallet, so the app can always be tried.

## 5. SKR: earn it by showing up, spend it to keep showing up

**On the slide:**
- Earn: every Clock-In (5–30 SKR on the ladder), and every win.
- Spend: **Streak Shield** (miss a day, keep the streak), **Seeker Chest**, **Rush Unlock**.
- **Seeker Genesis Token holders earn double SKR.** This is checked read-only on mainnet.
- No staking, and no paying for power.

**Notes:** SKR is the currency of consistency. The Streak Shield is the core
idea: what you earn by showing up protects the habit itself. On devnet it is a
labelled stand-in with the same shape as real SKR (classic SPL, 6 decimals,
`transferChecked`). The public spl-token-faucet program pays the rewards, so no
key ships in the APK.

## 6. An AI coach that plays your deck before you do

**On the slide:** the scouting report (win rate, matchup bars), then the
suggested-swap card.

- Runs the real battle engine on the phone: your deck against every rival,
  from both seats, on fixed seeds.
- Finds the single swap from your collection that wins more, and shows how
  many matches the result is based on.
- No server. No LLM. Nothing leaves the device.

**Notes:** The AI in Mempire is an honest one. Every number it reports comes
from simulated matches, and it ran 24 of them in 1.3 seconds on the iOS
simulator.

## 7. Built for the phone

**On the slide:**
- Native React Native screens for the whole loop: haptics, notifications,
  animated transitions.
- The 3D battle renders natively: the game's React Three Fiber scene on expo-gl, under a native HUD with drag-to-deploy.
- If a phone's GPU can't keep up, the same match continues in a bundled web arena automatically.
- Standard (3:00) and Rush (0:30) modes.

**Notes:** The simulation is shared code, not a port, so the native arena
and the web game cannot disagree about a match. A committed test plays the
same scripted match through both and checks that the end states are
identical.

## 8. Where it goes next

**On the slide:**
- Real SKR on mainnet for Streak Shields and Seeker Chests.
- Staked PvP pots: the program is already live on devnet, with escrow and
  settlement on MagicBlock.
- Clan streaks and weekly Seeker leaderboards using `.skr` names.
- dApp Store release.

**Notes:** The on-chain card program, match escrow and MagicBlock rollup
already exist and are proven on devnet (see the main README).

## 9. Try it

**On the slide:** APK link, repo link, QR code. *Devnet only. No real funds.*

**Notes:** Install the APK, choose Connect Wallet (or the dev wallet), clock
in, and run a Rush match.
