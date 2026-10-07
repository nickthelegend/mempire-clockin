# Demo script (about 90 seconds, narrated)

Judges read the transcript, so every shot has a line of narration, and the
narration says what is on screen. Record on an Android phone, ideally a Seeker
with Seed Vault, so the Mobile Wallet Adapter sheet is real. Every flow below
has also been run on the iOS simulator with the dev wallet (see HANDOFF.md).

| # | Time | Shot | Narration |
|---|---|---|---|
| 1 | 0:00–0:07 | Launch. Splash, then the Connect screen with the fanned fighters. | "This is Mempire for Seeker. Every coin is a fighter, and the app gives you a reason to show up every day." |
| 1b | (optional) | On a fresh install, after connecting: the three-beat intro, then **Play your first battle** with coach marks and the welcome chest. | "A new player is in a guided battle within a minute." |
| 2 | 0:07–0:17 | Tap **SIGN IN WITH SOLANA**. One Seed Vault sheet authorizes Mempire *and* signs the Sign In With Solana message. Home loads; the header reads your **.skr** name and "SIWS ✓". Optional: wallet sheet → "Signed in with Seed Vault" → **Verify again**. | "One tap signs you in with Solana. Seed Vault authorizes the app and signs a Sign In With Solana message in the same sheet, and the phone checks the signature itself. Your .skr name replaces the address." |
| 3 | 0:17–0:32 | Home: the Daily Clock-In card. Tap **CLOCK IN**. The wallet approves the transaction, the streak badge pops, the toast reads "Day 1 · +5 SKR · Silver Chest", and the **proof** tag appears. Tap it to open Solana Explorer. | "Clocking in is one tap. It's a signed memo on Solana devnet, so your streak is a public record anyone can rebuild, and the same transaction pays today's SKR." |
| 3b | (+10 s) | On the Clock-In card, flip **Approve once · 7 days**: one wallet approval. The card shows the countdown and "link signed by your wallet, verified on chain". Tomorrow's Clock-In then has **no wallet prompt**; the toast says "signed by your session key". | "Approve once, play all week. One signature links a session key on this phone for seven days, so the daily Clock-In is a single tap with no wallet pop-up. Anyone can check the link on chain, and Revoke ends it." |
| 4 | 0:32–0:40 | The red **CLOCKED IN / DAY N** stamp, the Daily quests card (Clock in today → **Claim**), the 7-day ladder, then the chest rail. Tap a chest; the timer starts and the toast says "We'll ping you." | "Three daily quests pay SKR. Seven days builds to a Legendary chest. Chests unlock on timers, and the phone pings you when one is ready." |
| 4b | (+10 s) | Open a ready chest: the fighters land, then tap **VERIFY**: slot, blockhash, formula, then **RECOMPUTE** → "MATCHES ✓". | "Chests are provably fair. Each one is committed to a future Solana slot when you earn it, and that slot's blockhash decides the drops. You can recompute it right here. It's verifiable with slot hashes, not a VRF." |
| 5 | 0:40–0:58 | Pick a rival, choose **Rush · 0:30**, tap **BATTLE**. The native 3D arena loads; drag two cards onto the board. | "Battles are real-time in a native 3D arena. Rush is thirty seconds, which is a whole match on the way to work." |
| 6 | 0:58–1:05 | The native Victory or Defeat sheet: crowns, trophies, +3 SKR, a chest added. | "The result comes back to the app: trophies, SKR and a chest when you win." |
| 6b | (+8 s) | On the result card tap **AS BLINK** (or **SHARE BLINK** under Battle) and show the share sheet; if a Blink-aware client is available, show the card with **Accept vs Blue Chips**. | "Challenges are Blinks: a Solana Action anyone can accept from a link, which signs the challenge on devnet and opens the battle in the app." |
| 7 | 1:05–1:20 | Open the **AI Coach** and tap **Scout my deck**. The progress bar runs, then the report shows the win rate and matchup bars. Tap **Find a better card** and the suggested swap appears. | "The AI coach plays your deck against every rival, using the real battle engine on the phone. Then it finds the one swap from your collection that wins more, and shows how many matches back it up." |
| 7b | (optional, +15 s) | Home → **Season Pass**: tiers, free and premium tracks, **BUY PASS · 150 SKR** → "PASS HELD · ON-CHAIN" → claim a premium tier. Then Shop → **Skins** → buy Neon Night → a battle in the neon arena. | "The Season Pass is a soulbound Token-2022 token bought with SKR in one instruction. Skins are tokens too, and they're cosmetic only. Never power." |
| 8 | 1:20–1:30 | **Shop**: the SKR balance labelled as the devnet stand-in, Streak Shield, Seeker Chest, and the Seeker-perks panel. | "SKR is earned by showing up and spent on keeping your streak alive with Streak Shields. Seeker Genesis holders earn double. Mempire: clock in, every day." |

Before recording:
- Shots 3b, 4b and 6b are the Solana Mobile tech pack (HANDOFF.md). Shot 3b
  needs about 0.0011 devnet SOL in the wallet for the session link and its
  fee float. Shot 6b's Blink card needs a Blink renderer; dial.to was down
  when this was written, so check https://dial.to first.
- For shot 7b the `mempire_pass` program must be deployed
  (`chain/pass/scripts/deploy-devnet.sh`, once funded). Without it the screen
  honestly shows "preview mode". It has been recorded on the simulator against
  a local validator; see `clockin/screens/season-pass/`.
- Fund the wallet with a little devnet SOL, so shot 3 shows a real proof link.
  Without SOL the card honestly says "saved on device".
- Run `node scripts/setup-skr-devnet.mjs` and rebuild, so the SKR is the
  on-chain stand-in rather than the simulated balance (see HANDOFF.md).
- For shot 6, pick the **Doggo Pack** rival (Easier) to make a win likely.
- Record on a real phone, where the native 3D arena runs on the GPU. On a
  simulator, Auto mode uses the web arena. Wallet sheet → Arena renderer shows
  which renderer is selected, and the result screen says which one ran.
