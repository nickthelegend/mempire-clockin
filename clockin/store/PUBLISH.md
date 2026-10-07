# Publishing Mempire to the Solana dApp Store: checklist

CLOCK IN winners must publish within **30 days of the results (Nov 10, 2026)**, so by about **Dec 10, 2026**.
Review takes 3–5 business days, so submit by **Dec 1** at the latest. Requirements and their sources are in
`STORE-REQUIREMENTS.md`. Only you can do the account, KYC, wallet and money steps; no agent may.

## 0. Fix these before you build the store APK

- [x] **Drop the microphone permission.** *Done in 1.2.1 (`aapt2 dump permissions` shows no RECORD_AUDIO).* The 1.2.0 APK lists `android.permission.RECORD_AUDIO`; `expo-audio` adds it, and the app never records. In `mobile/app.json`, replace the bare `"expo-audio"` plugin entry with `["expo-audio", { "recordAudioAndroid": false, "enableBackgroundPlayback": false }]`. Those are the option names in `expo-audio/plugin/build/withAudio.js`. The second option also drops `FOREGROUND_SERVICE_MEDIA_PLAYBACK` and the background playback service. A game has no reason to play audio while it is in the background, but listen once after the change, to check that the battle music still plays in the foreground. Adding the permission to `android.blockedPermissions` works too. Then confirm with `aapt2 dump permissions <apk> | grep RECORD_AUDIO`, which should print nothing.
- [x] **Bump the version.** *Done: 1.2.1 / versionCode 5.* The APK the judges installed is 1.2.0 / **versionCode 4**. The store build needs a higher `versionCode` (for example 1.2.1 / **5**) so it installs over their copy. Set `expo.version` and `expo.android.versionCode` in `mobile/app.json`.
- [ ] **Decide on the branded fighters.** See "IP risk" in `README.md`. Several cards carry real company logos, and the Publisher Policy bans content that infringes third-party IP. Ship-blocking is my judgement; the policy text is quoted in `STORE-REQUIREMENTS.md`.
- [x] **Hide the fps readout in release builds.** *Done in 1.2.1 (`__DEV__` only; the watchdog still measures).* The native arena always shows "N fps" (`mobile/src/arena/NativeArena.tsx`, `st.fps`). Store screenshot 1 shows "4 fps" from the iOS simulator's software renderer.
- [ ] **Host the privacy policy.** Fill in the placeholders in `PRIVACY.md` and publish it at https://mempire.fun/privacy, which returns 404 today. A GitHub link to the file is a stopgap.
- [ ] Optional: replace the store screenshots with captures from a real Android phone running the store build. The current ones come from the iOS simulator (1.1.0 UI, status bar trimmed).

## 1. Build and sign the store APK

Use the **existing Mempire release key**. Never generate a new one: every past and future Mempire APK must share it,
and the dApp Store refuses updates signed with a different key.

| | |
|---|---|
| Keystore | `/Volumes/Extreme SSD/Projects/clockin/keys/mempire-release.keystore` |
| Passwords, alias | `/Volumes/Extreme SSD/Projects/clockin/keys/mempire-release.env` (exports `MEMPIRE_KEYSTORE`, `MEMPIRE_KEYSTORE_PASSWORD`, `MEMPIRE_KEY_ALIAS`) |
| Certificate | `CN=Mempire, O=Mempire, C=IN`, SHA-256 `510a32d604173681a92bd6cb9c9b3809c4042c7d59a3fbbaf02316769fc3d943` |
| Never | commit either file, paste the passwords anywhere, or sign a store build with the debug key |

- [ ] **Back both files up now**, to two offline places (for example an encrypted USB stick and a password manager). If they are lost, Mempire can never be updated and needs a new listing.

```bash
source "/Volumes/Extreme SSD/Projects/clockin/env.sh"
cd "/Volumes/Extreme SSD/Projects/clockin/mempire-clockin/mobile"
npm ci && (cd ../app && npm ci)
npm run apk        # builds www, prebuild --clean (regenerates icons/splash from mobile/assets),
                   # takes the shared .gradle.lock, signs with the env above, copies to ../../apks/
```
Check the output before uploading:
```bash
BT=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
A="/Volumes/Extreme SSD/Projects/clockin/apks/mempire-clockin.apk"
"$BT/apksigner" verify --print-certs "$A" | head -2      # CN=Mempire and the SHA-256 above, NOT "Android Debug"
"$BT/aapt2" dump badging "$A" | head -1                   # fun.mempire.app, versionCode 5 (or higher)
"$BT/aapt2" dump permissions "$A" | grep -c RECORD_AUDIO  # 0
shasum -a 256 "$A"
```
If the build log prints "WARNING: MEMPIRE_KEYSTORE not set", the APK is debug-signed. Don't upload it.

## 2. Publisher account (you, once)

- [ ] Sign up at https://publish.solanamobile.com and fill in the publisher profile.
- [ ] Complete **KYC/KYB** in the portal, using the identity you will publish under. The listing's publisher name must match it.
- [ ] Create a **dedicated publisher wallet** in a browser extension (Phantom, Solflare or Backpack). **Keep it forever**, because every future Mempire release must be submitted from it. Back up its recovery phrase offline.
- [ ] Fund it with about **0.2 SOL on mainnet**. That is real money: it pays the transaction fees and the ArDrive storage for the APK (about 61 MB) and the images (about 12 MB). Use the portal's storage cost estimator and **Top Up Balance** if it shows the ArDrive balance going negative.
- [ ] Connect the wallet to the portal and choose **ArDrive** as the storage provider.

## 3. Add the dApp ("Add a dApp" > "New dApp")

| Portal field | Value / file |
|---|---|
| dApp Name (max 25) | `Mempire` |
| Package Name | `fun.mempire.app` |
| Subtitle (max 30) | `Every coin is a fighter` |
| Description | the long description in `LISTING.md` |
| dApp Icon 512×512 | `clockin/store/icon-512.png` |
| Banner 1200×600 | `clockin/store/banner-1200x600.png` |
| dApp Preview (1080×2400, at least 4, at most 3 MB each) | `clockin/store/screenshots/01-arena.png` … `06-devnet.png`, in that order |
| Video (optional, mp4 ≤ 30 MB) | none yet. The narrated hackathon demo could be cut to ≤ 30 MB at 1080p. |
| Anything else the form asks for | category **Games**, website `https://mempire.fun`, privacy URL, support email, testing instructions: all in `LISTING.md`. The feature graphic `feature-1200x1200.png` is there if the form asks for one. |

Press **Save**. You can still edit the details before you submit.

## 4. Submit the first release

- [ ] On the app's **Home**, press **New Version** and upload the APK from step 1. Upload an APK, not an AAB. Fill in "What's new" from `LISTING.md`.
- [ ] Press **Submit**, then **approve every signing request** in the wallet without skipping any. These requests upload the assets to Arweave and mint the release NFT. A skipped request leaves assets missing.
- [ ] Wait 3–5 business days for an email from `publishersupport@dappstore.solanamobile.com`. If nothing arrives after 5 days, post an *App Review Inquiry* in `#dev-answers` on https://discord.gg/solanamobile (get the Developer role first).

## 5. After approval

- [ ] Record the App and Release NFT addresses, the APK sha256 and the versionCode in `DEPLOY.md`.
- [ ] Add a dApp Store deep link to the README and the website (https://docs.solanamobile.com/dapp-store/link-to-dapp-listing-page).

## 6. Updates (from the CLI)

```bash
npm i -g @solana-mobile/dapp-store-cli          # 1.0.1 as of Oct 2026, portal-backed, updates only
export DAPP_STORE_API_KEY=…                      # create at publish.solanamobile.com/dashboard/settings/api-keys
dapp-store --apk-file "/Volumes/Extreme SSD/Projects/clockin/apks/mempire-clockin.apk" \
  --keypair /path/OUTSIDE/the/repo/publisher.json --whats-new "…"
```
- Bump `versionCode` and `version` every time, and sign with the same release key.
- `--keypair` must be a Solana CLI keypair file. The docs call it the "signer keypair" and don't say whether it must be the publisher wallet. **[unverified]** Check in the portal before you export a browser-wallet key to a file. If it must be the publisher wallet, keep that file encrypted and off any synced folder, and never put it in the repo.
- You can also update without the CLI: in the portal, go to the app, then Details to change listing text, then **New Version** to upload a new APK. Choose "use existing APK" when only the listing changed.
