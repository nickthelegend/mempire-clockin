# Mempire privacy policy (DRAFT)

> **Draft for the publisher. Fill in every `<…>`, have it read by someone qualified for your jurisdiction, and
> host it at a public URL before you submit. The planned URL, https://mempire.fun/privacy, returns 404 today.**
> I wrote it from the source code of `mobile/` at the commit that adds this file: Mempire 1.2.0,
> `fun.mempire.app`. Re-check it whenever the app adds a server, analytics, push notifications or accounts.
> The items marked ⚠ are things the app does today that you may want to change before publishing.
> They are not promises.

**Effective date:** `<DATE>`
**Publisher:** `<PUBLISHER_LEGAL_NAME>` ("we")
**Contact:** `<SUPPORT_EMAIL>`

## The short version

- Mempire has **no accounts and no servers of its own**. We do not receive, store or sell your personal data.
- Your game progress stays **on your phone**.
- The app talks to the **Solana blockchain** through public RPC servers. Anything you sign on-chain is **public and permanent**.
- **No analytics, no ads, no tracking, no crash reporting.**
- This build runs on **Solana devnet**, a test network. No real funds move.

## What stays on your device

| What | Where | Why |
|---|---|---|
| Your wallet address, the Mobile Wallet Adapter authorization token, and which wallet type you used last | Android Keystore-backed secure storage (`expo-secure-store`) | So you can reconnect without approving again |
| The **dev wallet** secret key, only if you choose "Use dev wallet" | Android Keystore-backed secure storage | A devnet-only key generated on the phone. It never leaves the device |
| Game save: cards, deck, chests and their timers, streak, simulated SKR balance, trophies and win/loss record, your last 50 battles, your last 120 Clock-Ins (day, streak, transaction signature), quest progress, coach run count | App storage (`AsyncStorage`), keyed by wallet address | So your game is there next time |
| Settings: arena renderer, sound on/off, whether you finished the intro, tutorial flags | App storage | Your preferences |

All of this data is deleted when you **clear the app's storage or uninstall Mempire**. We never receive a copy of it.

## What leaves your device, and to whom

We operate no server for this app. The app connects only to the following:

1. **Solana devnet RPC** (by default `api.devnet.solana.com`, run by the Solana Foundation).
   - The app sends your **public wallet address** to read balances and your Clock-In history.
   - It sends the **transactions you approve** (a Clock-In memo such as `mempire:clockin:v1:day=20261007:streak=3`).
   - It sends **devnet airdrop requests** when you tap "Get devnet SOL".
   - Every 45 seconds while the app is open, it checks whether devnet is reachable. That check contains no personal data.
2. **Solana mainnet RPC** (by default `api.mainnet-beta.solana.com`). These are **read-only** lookups that run only when you connect a Mobile Wallet Adapter wallet. The app sends your public address to check for a **Seeker Genesis Token** (which earns double SKR) and to show your **real SKR balance**. Nothing is signed or sent on mainnet.
3. **Your wallet app** (for example Seed Vault, Phantom or Solflare), through Mobile Wallet Adapter. The wallet sees the app's name, website and icon, plus the transactions it asks you to approve. That wallet's own privacy policy applies.
4. **Solana Explorer** (`explorer.solana.com`), only when you tap a "view on explorer" link. It opens in your browser.
5. **The share sheet**, only when you tap "Challenge a friend". The message contains the rival's name, the score and links to Mempire. You choose where it goes.

RPC providers can see your IP address and the requests your device makes, under their own privacy policies.

**Public blockchain.** A transaction you sign, such as a Clock-In memo containing the date and your streak, is recorded on Solana. Anyone can read it, and neither we nor anyone else can delete it. This build uses devnet, which may be reset by its operators.

## Notifications

Chest-ready and streak reminders are **local notifications**, scheduled on your phone. The app does not register for push notifications and sends no notification token anywhere. Android asks for the notification permission after your first Clock-In. You can turn it off at any time in system settings.

## Permissions

- **Internet**: required, to reach Solana.
- **Notifications**: optional, for the reminders described above.
- **Vibrate**: for haptic feedback.
- **Wake lock**, **foreground media playback**, **boot completed**, **network state**: added by the notification and audio libraries. They keep reminders and sounds working.

Mempire **does not use** your camera, location, contacts, photos or files.

⚠ **Microphone:** the 1.2.0 Android build lists `RECORD_AUDIO` in its manifest. The `expo-audio` library, which plays the game's sounds, adds it by default. The app never asks for it at runtime and never records. *Block it before publishing* (see `PUBLISH.md`), then delete this paragraph.

## No analytics, ads or tracking

The app has no analytics, advertising, attribution or crash-reporting SDK. There are no cookies. The AI Coach runs **entirely on the device**: it simulates matches with the game's own engine, and nothing you do in it is sent anywhere.

## Children

Mempire is not directed at children under 13 (or the minimum age in your country), and we do not knowingly collect information from them. We collect no personal information from anyone.

## Your choices and rights

Because we hold no personal data, there is nothing to export or erase on our side. To delete your data, clear the app's storage or uninstall the app. On-chain transactions cannot be erased by anyone.
⚠ There is no in-app "reset my data" button yet. The Solana Mobile Publisher Policy expects apps to "allow user account deletion". Mempire has no accounts, but an in-app reset would make this clearer.

If you have questions or want to exercise a right under GDPR, UK GDPR, CCPA or similar laws, write to `<SUPPORT_EMAIL>`.

## Changes

If the app starts collecting anything new, for example through a game server, analytics or push notifications, we will update this policy before releasing that version and change the effective date above.

## Contact

`<PUBLISHER_LEGAL_NAME>`, `<POSTAL_ADDRESS (if your jurisdiction requires one)>`, `<SUPPORT_EMAIL>`
