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

Results are filled in below as each test runs.
