# Demo script (about 90 seconds, narrated)

Judges read the transcript, so every shot has a line of narration, and the
narration says what is on screen. Record on an Android phone, ideally a Seeker
with Seed Vault, so the Mobile Wallet Adapter sheet is real. Every flow below
has also been run on the iOS simulator with the dev wallet (see HANDOFF.md).

| # | Time | Shot | Narration |
|---|---|---|---|
| 1 | 0:00–0:07 | Launch. Splash, then the Connect screen with the fanned fighters. | "This is Mempire for Seeker. Every coin is a fighter, and the app gives you a reason to show up every day." |
| 2 | 0:07–0:17 | Tap **Connect Wallet**. The MWA / Seed Vault approval sheet appears; approve it. The Home screen loads. | "You sign in with Mobile Wallet Adapter. On a Seeker that's Seed Vault, and the app never sees a key." |
| 3 | 0:17–0:32 | Home: the Daily Clock-In card. Tap **CLOCK IN**. The wallet approves the transaction, the streak badge pops, the toast reads "Day 1 · +5 SKR · Silver Chest", and the **proof** tag appears. Tap it to open Solana Explorer. | "Clocking in is one tap. It's a signed memo on Solana devnet, so your streak is a public record anyone can rebuild, and the same transaction pays today's SKR." |
| 4 | 0:32–0:40 | The 7-day ladder, then the chest rail. Tap a chest; the timer starts and the toast says "We'll ping you." | "Seven days builds to a Legendary chest. Chests unlock on timers, and the phone pings you when one is ready." |
| 5 | 0:40–0:58 | Pick a rival, choose **Rush · 0:30**, tap **BATTLE**. The 3D arena loads; drag two cards onto the board. | "Battles are real-time in a 3D arena. Rush is thirty seconds, which is a whole match on the way to work." |
| 6 | 0:58–1:05 | The native Victory or Defeat sheet: crowns, trophies, +3 SKR, a chest added. | "The result comes back to the app: trophies, SKR and a chest when you win." |
| 7 | 1:05–1:20 | Open the **AI Coach** and tap **Scout my deck**. The progress bar runs, then the report shows the win rate and matchup bars. Tap **Find a better card** and the suggested swap appears. | "The AI coach plays your deck against every rival, using the real battle engine on the phone. Then it finds the one swap from your collection that wins more, and shows how many matches back it up." |
| 8 | 1:20–1:30 | **Shop**: the SKR balance labelled as the devnet stand-in, Streak Shield, Seeker Chest, and the Seeker-perks panel. | "SKR is earned by showing up and spent on keeping your streak alive with Streak Shields. Seeker Genesis holders earn double. Mempire: clock in, every day." |

Before recording:
- Fund the wallet with a little devnet SOL, so shot 3 shows a real proof link.
  Without SOL the card honestly says "saved on device".
- Run `node scripts/setup-skr-devnet.mjs` and rebuild, so the SKR is the
  on-chain stand-in rather than the simulated balance (see HANDOFF.md).
- For shot 6, pick the **Doggo Pack** rival (Easier) to make a win likely.
