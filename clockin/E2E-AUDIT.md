# Mempire 1.6.x: end-to-end audit on live devnet

Run in the real app: the iPhone 17 simulator, a devnet Release build of `main` (JS bundle embedded, no Metro), and the in-app dev wallet. Every on-chain step is confirmed twice: in the UI, and on chain through RPC (`getTransaction`: confirmed, signer, accounts, amounts or account state). JS errors are read from the device log (`ReactNativeJS` / `[error]`) while each flow runs. A flow that passes while logging an error counts as a FAIL.

## Map (from the code)

**Screens:** Connect · Intro (3 slides) · CoachMarks (tutorial) · Home (Season War banner, Clock-In, session card, quests, chests, Season Pass card, battle, coach, ON-CHAIN) · Cards · Deck (Wardrobe) · Duels · Shop (SKR, Season Pass entry, skins, Streak Shield / Seeker Chest / Rush) · Season Pass sheet · Board / Season War sheet · On-chain sheet · Coach sheet · Wallet & settings sheet · Native arena · Web arena (compat) · Result sheet (share card, AS BLINK, duel a friend, scan to duel) · Chest reveal (Verify / Recompute) · Duel result.

**Deep links:** `mempire://battle?rival&rush&renderer` · `mempire://duel?c=&d=` · `mempire://pass` · `mempire://board` · `mempire://onchain`.

**On-chain instructions sent by the app** (every one goes through `chain/send.ts`):

| Action | Instructions | Signer |
|---|---|---|
| Clock-In | memo `mempire:clockin:v1` + WAR_REF + `mempire_pass::clock_in` + faucet mint (SKR) + batched chest commits | wallet, or session key |
| Session on | `mempire_pass::create_session` + link memo + 0.001 SOL float + WAR_REF | wallet |
| Session off | `revoke_session` + revoke memo + float sweep | session key, or wallet |
| Chest commit | memo `mempire:chest-commit:v1` | session key, or batched into the wallet's Clock-In |
| Claim SKR / quest SKR / win SKR | spl-token-faucet `MintTokens` | wallet |
| Shop (Shield / Seeker Chest / Rush) | `transferChecked` SKR → treasury | wallet |
| Season Pass | `mempire_pass::buy_pass` | wallet |
| Skin | `mempire_pass::buy_skin` | wallet |
| Ghost duel challenge / result | memo (v3) + payload (Memo v1) + DUEL_REF | wallet |

**Off-chain, but verifiable:** SIWS (ed25519 on the device) · `.skr` reverse lookup (AllDomains, mainnet read) · Seeker Genesis Token (mainnet read) · chest roll recompute from the committed slot's blockhash · duel re-simulation · Season War tally from WAR_REF history.

**Blinks** (`https://mempire-actions.vercel.app`): `actions.json` · `GET`/`POST /api/actions/challenge` · `GET`/`POST /api/actions/duel?c=` (also a Solana Pay transaction request) · `GET`/`POST /api/actions/season-pass`.

## Checklist and results


Run on 11–12 Oct 2026, dev wallet `AMxc5DtB44GySnXUMuFSUApPfzVnia1cnZnZhf969ph8` (funded with 1 devnet SOL from the deployer hub). Screens are in `clockin/screens/e2e/`.

| # | Test | Result | Devnet proof | Screen |
|---|---|---|---|---|
| 1 | First run: intro → tutorial (web arena on sim) → welcome chest ADDED | PASS | — | screens 01–03 |
| 2 | Dev-wallet sign-in, SIWS verified on device (header "SIWS ✓") | PASS | off-chain (ed25519) | 01 |
| 3 | Fund dev wallet AMxc…9ph8 from hub (1 SOL) | setup | [2dDStYMu…](https://explorer.solana.com/tx/2dDStYMucoVbkhCrV6CxgmBbR4z2dGodSkkV6mSHaya1MJuUSiNgRg8Gvg8MHuC1mTQkSokTHFPrfHqATcdHXSVu?cluster=devnet) | |
| 4 | Clock-In, wallet-signed: `clock_in` + memo + faucet MintTokens 5 SKR + batched chest commits (chest_1, chest_2); ClockInState day 20261011 streak 1 | PASS | [5bxhhCP7…](https://explorer.solana.com/tx/5bxhhCP7TteXeqwAFg8FB29YqT4jfsMiAu14uv46c6PW4JQKFkZKUyRwSJ58TNLkYJH77M5z4GPQh7i4oWyw813?cluster=devnet) | 04 |
| 5 | Quest "Clock in today" CLAIM, **double-tapped**: exactly one faucet mint (+5 SKR), quest shows Done, pass XP +25 | PASS | [5hYHWCAo…](https://explorer.solana.com/tx/5hYHWCAoqH1aovHLy48CSBhJQMnEfMcnJd24WcRYZ7HnpuFkRmtsXiGFkDkb57VHGt78McB6DyeGTtxci3gfnMeK?cluster=devnet) | |
| 6 | Session ON, **double-tapped**: exactly one `create_session` (SessionRecord PDA, link memo, 0.001 SOL float) | PASS | [jfhtiKRE…](https://explorer.solana.com/tx/jfhtiKRE7mG6GttXsYNY3eBVHHfaqcDomk3KhV2qjoLcfJcB848WWENutBMFAKYnvatYRvoDDhV2mX8fidWGUnd?cluster=devnet) | |
| 7 | `.skr` lookup `alice.skr` → `DKL92b…CDKimr`, reverse agrees (mainnet read-only) | PASS (after fix F3) | — | 05 |
| 8 | Chest earned → commit on chain (batched into the Clock-In) → unlock 3 min → **double-tapped OPEN** (opened once) → Verify → Recompute **MATCHES ✓** "commit posted at slot 509981076, before slot 509981107" | PASS | commit in [5bxhhCP7…](https://explorer.solana.com/tx/5bxhhCP7TteXeqwAFg8FB29YqT4jfsMiAu14uv46c6PW4JQKFkZKUyRwSJ58TNLkYJH77M5z4GPQh7i4oWyw813?cluster=devnet), block [509981107](https://explorer.solana.com/block/509981107?cluster=devnet) | 06 |
| 9 | Chest from a pass reward committed **silently by the session key** | PASS | [5YM4DVTu…](https://explorer.solana.com/tx/5YM4DVTuwNwKDsHkg9EqJxv9vBn5vzqs8JkLnQrrA3U7h3HzAR781ig1CjNySiP68ffBmvHAQkDTL9R4ddiK4amp?cluster=devnet) | |
| 10 | Insufficient SKR (10 < 150): BUY PASS disabled, "Not enough on-chain SKR yet" | PASS | — | |
| 11 | Faucet SKR top-up for the audit (spl-token-faucet `MintTokens`, 3×100) | setup | [5H7C5Saq…](https://explorer.solana.com/tx/5H7C5SaqtkKhCRqv26MLnMdCt81Dhd3agP1sda9BMc8XAc5ec67y12b8mByj5Z4ubja7YBY5HGyPD8k7c91tePeU?cluster=devnet) [3WmR6DXQ…](https://explorer.solana.com/tx/3WmR6DXQU8bW9LHKJzhYUS3h2Vn6s1hMTLLgGQxUxgSua45PBu3CwDQ95jsGgidcxq8aCCxyQLKnwhLY4T3PKDkg?cluster=devnet) [4myjeXbZ…](https://explorer.solana.com/tx/4myjeXbZ2aEGJy6bLuYZUKiGLLdwbhHMLxC7KDz7oJexgQkfst1MjTRsoWJW6bR7aiYRexzjkVqSUEAyLpcu9Uf7?cluster=devnet) | |
| 12 | Season Pass BUY, **double-tapped**: exactly one `buy_pass`: −150 SKR, treasury vault +150, +1 soulbound pass (Token-2022); premium unlocked; premium tier 1 claimed | PASS (after fix F4: sheet re-reads chain on open) | [2a8db2SE…](https://explorer.solana.com/tx/2a8db2SEzGjvZfTz71ABLPByTZZSKCwsHLrj6CD55uaVTg5WEfM4UueUDBHUZjCsGhimsRsiyQ7k2nfWDTPNS9Bj?cluster=devnet) | 07 |
| 13 | Negative, simulated on real devnet accounts (`mobile/scripts/e2e-negative.ts`): soulbound transfer → Token-2022 "Transfer is disabled" (0x25); second pass purchase → receipt PDA "already in use"; second clock_in same day → `AlreadyClockedIn`; stranger clock_in → rejected; never-produced blockhash → `BlockhashNotFound`. App messages readable for all five | PASS (after fix F5) | simulation only (nothing lands) | |
| 14 | Skin BUY (Neon Night): exactly one `buy_skin`, SKR → treasury, +1 skin token | PASS | [42EZEWyq…](https://explorer.solana.com/tx/42EZEWyqRGQR1EGZhFBgQPH3Shwf6aXD9A7woFJk4nZSYZ78HTvTScGshHkpXZ2QExiphC4CvE1Cb4G3S4ywZEM7?cluster=devnet) | |
| 15 | Background mid-match, **web arena** (the simulator default): match kept running while the app was away, no pause | FAIL → fixed F7 (shell signals pause/resume, bot match holds its tick) | — | 09 |
| 16 | Background mid-match, **native arena**: "Paused · The match waited for you" (clock 2:39 → 2:38), RESUME continues | PASS | — | 10 |
| 17 | `mempire://battle?renderer=native` fell back to the web arena on the simulator's 3–4 fps GL | FAIL → fixed F8 (explicit renderer honoured; Auto keeps the fps fallback) | — | |
| 18 | Kill the app mid-match and relaunch: Home, state intact (streak, session, balances), no JS errors | PASS | — | |
| 19 | Standard battle, native arena, 12 deploys → result (DEFEAT 0–2) → SHARE CARD (1.1 MB PNG share sheet) | PASS | — | 11 |
| 20 | JS log during RPC 429s: web3.js logged `console.error` "Server responded with 429…" per retry | FAIL → fixed F6 (quiet rate-limit fetch, 0 lines after the fix) | — | |
| 21 | DUEL A FRIEND under RPC 429: alert showed raw JSON-RPC body | FAIL → fixed F10 (`readableError` on every toast/alert) | — | |
| 22 | Header during RPC failure: SKR showed 0 (balance unknown), banner said "unreachable" for a rate limit, skin/pass ownership dropped on one failed re-check | FAIL → fixed F9 (last chain value kept, "…" when unknown, "Devnet is busy", 15-min live grace) | — | |
| 23 | Production log noise: three.js/expo-gl capability lines on every arena open | FIXED F11 (filtered in release builds) | — | |
| 24 | Rush battle (native arena) → result (DEFEAT 0–1) → share card with the equipped emote art and AS BLINK | PASS | — | assets-sharecard-emote-blink |
| 25 | Web arena backgrounded 20 s after fix F7: clock 2:38 → 2:37 (held), resumes on return | PASS | — | 14 |
| 26 | Leave-confirm in the web arena held the bot clock (it kept running before) | FIXED F12 | — | |
| 27 | Text size: largest accessibility size, header chips pushed off screen | FAIL → fixed F13 (identity shrinks first) | — | 12 → 13 |
| 28 | Arena fit (user P0): hand overflowed, crowd band between field and hand, units stacking as a red blob | FAIL → fixed F14 (fitted camera per viewport, hand width from available width, draw order by camera distance, per-unit spread). Checked on iPhone 17 native, iPhone 17 largest text, web arena at 375×667, 360×740, 440×956 | — | arena-fit-before-*, arena-fit-after-* |
| 29 | Opening a sheet while another was up (e.g. Pass → Board deep link) left the app unresponsive to touch | FAIL → fixed F15 (sheets exclusive, sequenced) | — | assets-board |
| 30 | Real art (user request): emotes, rewards, frames, SKR coin, feature icons, coach, ghost, trophy, quest/lock/crown icons; WebP at drawn size (492 KB); no emoji placeholders left (`✓`/`✕`/`✗` UI glyphs only) | PASS | — | assets-* |
| 31 | On-chain screen looked like a console (user P0) | FIXED F16: "Chain Powers" grid, proof per power in a sheet | — | chainpowers-loading, chainpowers-grid, chainpowers-sheet-blinks |
| 32 | Chain Powers with devnet rate-limiting this IP: reads that fail show OFFLINE (never "READING…" forever, never "no record") | PASS | — | chainpowers-grid |
| 33 | Blinks GET: `actions.json`, `challenge`, `season-pass` → 200, `X-Action-Version 2.4`, `X-Blockchain-Ids` devnet, CORS `*`, season-pass `disabled:false` | PASS | — | |
| 34 | Blink POST `challenge?rival=blue-chips` with the hub as account → 200, a memo transaction with the account as fee payer | PASS | — | |
| 35 | Sign and send that Blink transaction on devnet | BLOCKED (devnet RPC 429 for this IP) | — | |
| 36 | Session-signed `clock_in` with a war pledge, then `revoke_session` (second wallet) | BLOCKED (429; the next UTC day is also needed for a second Clock-In on the first wallet). Covered by the 17 anchor tests on localnet, and the session `create_session` + session chest commit above are on devnet | — | |
| 37 | Ghost Duel post → open from QR/deep link → fight → result + re-sim | BLOCKED on posting (429). The QR/deep-link parsing, replay and re-sim are covered by `scan-duel`, `ghost-duel`, `duel-open` tests | — | |
| 38 | Season War pledge + global tally | BLOCKED (429); the war board shows "chain unreachable" honestly | — | |
| 39 | Expired session; declined signature | Expired: anchor test `SessionExpired`. Declined: the dev wallet cannot decline; MWA decline is hardware-only (see below) | — | |
| 40 | JS log over the whole run (device log, `ReactNativeJS`): after fixes F6/F11, zero errors and zero warnings; only "Running main" lines | PASS | — | |

### Devnet rate limit

From about 23:28 IST on 11 Oct the public devnet RPC answered 429 ("Too many requests from your IP") to every request from this machine, for more than an hour. Per the audit rules the blocked steps are recorded above and the run continued. Every on-chain step that did run has its signature above; nothing on this page is simulated except row 13, which says so.

### Fixes in this audit

| Fix | What | Commit |
|---|---|---|
| F2–F5 | ledger re-read after Clock-In; keyboard taps; fresh chain reads on Pass/Shop; readable soulbound / no-SOL / stale-blockhash errors | 5c1deaa |
| F6–F10 | quiet 429 retries (no console.error); `readableError` on every toast/alert; web arena holds while backgrounded; explicit renderer honoured; last-known balances, "…" when unknown, "Devnet is busy" banner | 20e60dd |
| F11, F13 | release log noise; header and Shop at the largest text size | 20e60dd, 5f8e33c |
| F12 | web arena holds under the leave confirm | 8632c37 |
| F14 | arena fit, hand fit, unit blob | 370166b |
| F15, art | exclusive sheets; real art everywhere | 5c95df8 |
| F16 | Chain Powers | 2c8b884 |

Shipped as **1.6.1** (versionCode 14): APK sha256 `0cc79691963a181cf74fa1d2cf9a518d5bd8e1c19bfd575d6a4708cca2736558`, same certificate `510a32…`, aapt2: no `RECORD_AUDIO`, no localnet URL, 33 art drawables present; the re-downloaded release asset hash matches.

### Needs real hardware

- **Mobile Wallet Adapter and Seed Vault** (Android only; the iOS simulator uses the dev wallet). On a Seeker or an Android phone with Phantom/Solflare: install the APK, choose Connect wallet, approve the SIWS message, then (a) Clock-In and approve, (b) decline one prompt and check the toast says "You declined the request in your wallet." and nothing is charged, (c) background the app while the wallet is open and return.
- **Native 3D arena at full frame rate**: the simulator renders OpenGL in software (3–4 fps). On a phone, Auto picks the native arena; check 60 fps and the pause overlay after backgrounding.
- **Push / local notification delivery** (streak reminder): schedule fires only on a device; leave the app unopened past the reminder time.
- **Seeker Genesis Token perk**: needs a wallet holding the SGT on mainnet (read-only check).
