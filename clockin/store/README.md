# Mempire: dApp Store publishing kit

Everything needed to list Mempire (`fun.mempire.app`) on the Solana dApp Store.

| File | What it is |
|---|---|
| `STORE-REQUIREMENTS.md` | The current store rules, each with its official source; anything unverified is flagged |
| `LISTING.md` | Name, subtitle, long description, release notes (1.1.0 and 1.2.0), keywords, reviewer testing notes |
| `PRIVACY.md` | Draft privacy policy, written from the code. Fill in the placeholders and host it at a URL |
| `PUBLISH.md` | Step-by-step checklist: fixes before building, the APK and keystore, KYC, wallet, portal, CLI updates |
| `../../mobile/dapp-store/config.yaml` | The same listing as structured data, with asset paths |

## Assets

| File | Size | For |
|---|---|---|
| `icon-512.png` | 512×512 | Portal "dApp Icon" (required) |
| `banner-1200x600.png` | 1200×600 | Portal "Banner" (required on the new-dApp form). The store draws the icon over its bottom-left, so that corner is kept empty |
| `feature-1200x1200.png` | 1200×1200 | Feature graphic. Only the old CLI asked for one; it's here in case the form does |
| `screenshots/01-arena.png` | 1080×2400 | "Every coin is a fighter": the 3D arena mid-match |
| `screenshots/02-clock-in.png` | 1080×2400 | "Clock in every day": the 7-day Clock-In track |
| `screenshots/03-battle.png` | 1080×2400 | "Win a battle, earn a chest": rival picker, Standard/Rush |
| `screenshots/04-ai-coach.png` | 1080×2400 | "Scout every rival first": the on-device coach report |
| `screenshots/05-chests.png` | 1080×2400 | "Chests open while you're away": clocked in, chest ready |
| `screenshots/06-devnet.png` | 1080×2400 | "No real funds. Ever.": the wallet sheet with devnet SOL and simulated SKR |

Every screenshot is a PNG under the portal's 3 MB cap, and all six share the same size, orientation and aspect.

The app's own art in `mobile/assets/` was updated in the same change:

- `icon.png` is now full bleed (1024, opaque). Before, it had a rounded frame and black corners baked in.
- The adaptive icon is now a crown in the safe zone over a quilt background. Before, it was a framed tile drawn inside another tile.
- `android-icon-monochrome.png` is a crown silhouette. It is Android 13's themed icon and also the notification icon; before, it was a plain rounded square.
- `splash-icon.png` is now the 1232 px wordmark. The old 512 px one was upscaled about 1.8x on xxxhdpi screens.

`app.json` already pointed at these paths, so it needed no change. The launcher icons in the APK only change once the APK is rebuilt (`npm run apk` regenerates `android/`).

### Where the art comes from

- **Screenshots:** the full-resolution (1206×2622) iPhone 17 simulator captures that `clockin/screens/` was downscaled from. They are kept in `src/shots/` as JPEG q93.

  | Slide | Capture | Same scene in `clockin/screens/` |
  |---|---|---|
  | 1 | `arena.jpg` | the `native-arena/` series |
  | 2 | `clockin.jpg` | — |
  | 3 | `battle.jpg` | ≈ `ios-03-battle-picker.png` |
  | 4 | `coach.jpg` | `ios-06-coach-report.png` |
  | 5 | `home-clocked.jpg` | `ios-11-home-ledger.png` |
  | 6 | `wallet.jpg` | `native-arena/09-renderer-setting.png` |

  The iOS status bar (clock and Dynamic Island) is trimmed off the top. Nothing else in the captures was edited. They show the **1.1.0** UI.
- **Crown:** cut out of the previous `mobile/assets/icon.png`, which was 1024 px and sharp, not blurry. Only its framing was the problem.
- **Wordmark, quilt and fighters:** from the original renders in Mempire's `design/generated/` (wordmark 1344×752, cards 880×1168). `src/prep_art.py` reproduces `src/art/` byte for byte.
- **Fonts:** Lilita One and Hanken Grotesk, the app's own fonts, from `videos/gameplay-demo/brand/fonts/`.

### Re-render

```bash
bash clockin/store/src/render.sh   # headless Chrome + Pillow, about 30 s; rewrites every asset above
```
The captions live in `src/shot.html` (the `SLIDES` object), the icon in `src/icon.html`, and the banner and feature graphic in `src/banner.html`.

## IP risk: read this before publishing

The Publisher Policy prohibits content that "infringes on intellectual property of any third-party". It also prohibits content "designed to create a likelihood of confusion with a third-party's entity, brand, products or services". Several fighters in the shipped roster carry **real company or project logos** in their art. I checked each card in `mobile/assets/game/card_*.webp` by eye:

- **Company logos drawn on the character. High risk; keep them out of store art:**
  - `$NVDA`: NVIDIA eye on the chest
  - `$AAPL`: Apple logo on the chest and shield
  - `$MSFT`: Windows logo shield
  - `$TSLA`: Tesla "T" on the helmet
  - `$AMZN`: Amazon smile on the shirt
  - `$AMD`: AMD arrow on the chest
  - `$SBUX`: Starbucks siren on the cup and chest
  - `$META`: Meta infinity loop
  - `$COIN`: Coinbase "C" on the chest and key
  - `$DIS`: Disney castle on the robe
  - `$HOOD`: Robinhood feather on the chest
  - `$GOOGL`: Google's four-colour trade dress
- **Crypto project logos. Lower risk, but they are still trademarks:**
  - `$BNB`: Binance mark on the shield
  - `$TRX`: TRON logo
  - `$XRP`: XRP logo
  - `$LTC`: Litecoin "Ł"
  - `$APT`: Aptos mark
  - `$OP`: Optimism "O"
  - `$UNI`: Uniswap unicorn
  - `$LINK`: Chainlink hexagon
  - `$ETH`: Ethereum diamond
  - `$BTC`: ₿
  - `$DOGE`: Doge coin face
  - `$SOL`: Solana bars
- **Real people and artists' characters. High risk:**
  - `$PEPE` and `$BRETT`: Matt Furie's characters. Pepe is excluded everywhere in this kit.
  - `$CHILLGUY`: Phillip Banks' "Chill Guy", whose artist has sent takedowns over it.
  - `$TRUMPC`: the likeness of a real, living politician.
  - `$GIGA`: the "GigaChad" photo likeness.
- **Real animals and memes. Low risk:** `$POPCAT`, `$MOODENG`, `$PNUT`, `$WIF`, `$HARAMBE`, `$MICHI`, `$MOG`.

**What this kit does:** none of the store art shows a card from the first or third group.

- I dropped the captures where `$NVDA`, `$TSLA` or `$PEPE` were visible: the chest-open (`$TSLA`), the coach swap (`$NVDA`), the fighters grid (`$PEPE`, `$NVDA`), and most native-arena frames, where `$NVDA` is in hand or next up.
- The banner and feature graphic use only `$SOL`, `$BTC`, `$DOGE`, `$BONK` and `$SHIB`. `$SHIB` wears a red gi and headband that are generic, but they recall a well-known fighting-game outfit.

**What it can't fix:** the APK itself still ships those cards, and review looks at the app, not just the listing. Before you submit, decide whether to redraw the logo-bearing fighters without logos, drop them, or accept the risk. Ticker names on their own, in plain text, are much lower risk than drawn logos. That's general knowledge, not legal advice.

## Known gaps

- **No Android captures.** No Android device or emulator could be used, so the screenshots come from the iOS simulator (status bar trimmed). Recapture on a phone if you can, ideally from the store build.
- **Screenshot 1 shows "4 fps".** That is the iOS simulator's software renderer. The arena's fps readout ships in release builds. Hide it, then recapture.
- **The screenshots predate 1.2.0.** The 1.2.0 polish round (quests, Clock-In stamp, first-run intro) isn't shown.
- **The portal form beyond the fields in the official screenshots has not been seen**, because it sits behind a login. See the [unverified] rows in `STORE-REQUIREMENTS.md`.
