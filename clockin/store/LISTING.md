# Mempire listing copy

Copy each block straight into the Publisher Portal. Character counts include spaces. The same text is in
`mobile/dapp-store/config.yaml`.

All copy follows two rules. **Devnet build:** no real funds move. **SKR is simulated** on the device until the
devnet stand-in mint is deployed. Change the text when either of those stops being true.

## dApp name (portal limit: 25)

```
Mempire
```
7 characters. If the portal wants something more descriptive, use `Mempire: Coin Card Battler` (26, one too
many for the portal) or `Mempire: Coin Battler` (21).

## Subtitle / short description (limit: 30)

```
Every coin is a fighter
```
23 characters. Alternatives: `Daily card duels for Seeker` (27), `Clock in. Battle. Get chests.` (29).

## Description (long)

```
Mempire is a real-time card battler for Solana Seeker where every coin is a fighter.

Build a deck of eight from a 64-fighter roster, drag cards onto your half of a 3D arena, and take the rival's towers before the clock runs out.

• Daily Clock-In: one tap a day keeps your streak alive. A 7-day ladder pays out chests and SKR, with a Legendary chest on day 7. Each Clock-In is a memo transaction you sign on Solana devnet, so your streak can be rebuilt from the chain after a reinstall.
• Battles: Standard (3:00) or Rush (0:30) against four AI rival decks, on the game's own deterministic battle engine, rendered natively in 3D.
• Chests: win a battle, earn a chest. One unlocks at a time, and a notification tells you when it is ready. Duplicates level your fighters up.
• Daily quests and a streak reminder before midnight.
• AI Coach on your phone: it plays your deck against every rival with the real battle engine (24 simulated matches), shows where you lose, and finds the one card swap that wins more. No server and no chatbot; nothing leaves the device.
• SKR you earn by showing up: spend it on a Streak Shield, a Seeker Chest or a Rush Unlock. You can never pay for power. Seeker Genesis Token holders earn double.
• Mobile Wallet Adapter: connect Seed Vault or any MWA wallet. Mempire never asks for a seed phrase.

Be aware: this is a devnet build and no real funds move. SKR is simulated on your device until the devnet SKR stand-in is deployed, and every SKR balance says so. The Seeker Genesis Token check and your real SKR balance are read-only lookups on mainnet.
```

## Release notes / "What's new"

### 1.1.0 (versionCode 3)

```
• Native 3D arena: battles render natively (React Three Fiber on expo-gl), with an automatic switch to the web arena if a phone can't keep up.
• Daily Clock-In streak, signed as a Solana devnet memo and rebuilt from the chain after a reinstall.
• AI Coach: on-device scouting report and a one-tap card swap.
• SKR shop: Streak Shield, Seeker Chest and Rush Unlock (SKR is simulated on devnet).
• Seeker Genesis Token holders earn double SKR on every Clock-In.
• Chest-ready and streak reminders.
```

### 1.2.0 (versionCode 4, current `main`)

```
• First-run intro and a guided first battle.
• Daily quests and a Clock-In stamp.
• Sound effects and battle music, with one mute toggle.
• An evening reminder before your streak lapses.
• Challenge a friend from the share sheet.
• Larger text support, bigger touch targets, clearer offline and empty states.
• New app icon and splash.
```
The last bullet holds only for a build made after the store-kit merge. The 1.2.0 APK built at 13:39 on Oct 7
still has the old icon. See `PUBLISH.md` step 3.

Short form for `dapp-store --whats-new` (one line):
```
Native 3D arena, daily quests, sound, streak reminders and a new icon. Devnet build; SKR is simulated.
```

## Category

**Games**. Request it if the portal asks. The docs suggest Solana Mobile assigns the category at review (see
`STORE-REQUIREMENTS.md`).

## Keywords (in case the form has a field)

```
card battler, strategy, PvE, daily streak, clock in, memecoin, Solana, Seeker, SKR, AI coach, 3D arena, chests
```

## Testing instructions for the reviewer

```
Install and open Mempire. Tap Connect Wallet to use Mobile Wallet Adapter (Seed Vault, Phantom or Solflare on devnet), or Use dev wallet for a devnet-only key kept on the device. On Home, tap Clock In: with devnet SOL in the wallet this signs a memo transaction; without it, the Clock-In is kept on the device and labelled "Not on-chain". Tap Battle and pick a rival (Rush is 30 seconds); drag cards onto your half of the arena. Open AI Coach to run the on-device scouting report. The Shop spends simulated SKR. Everything is devnet: no real funds move.
```

## Contact and links (the user fills these in)

| Field | Value |
|---|---|
| Website | https://mempire.fun (live, checked Oct 7) |
| Privacy policy URL | https://mempire.fun/privacy, **which returns 404 today**. Host `PRIVACY.md` there, or use the GitHub URL of `clockin/store/PRIVACY.md` until you do. |
| Terms / licence URL | https://mempire.fun/terms, **which returns 404 today**. Write it, or leave the field empty if the portal allows that. |
| Support email | `<SUPPORT_EMAIL>`. Choose an address you will read. |
| Publisher name | `<PUBLISHER_LEGAL_NAME>`, exactly as on your KYC/KYB. |
