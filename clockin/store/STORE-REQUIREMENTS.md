# Solana dApp Store: current requirements (checked Oct 7, 2026)

These were read from the official Solana Mobile docs on 2026-10-07. Each row says where it comes from.

- **[verified]** means the official docs say it, or a screenshot of the Publisher Portal embedded in those docs shows it.
- **[unverified]** means the docs don't cover it, or the docs and the portal screenshots disagree. Check it in the portal itself. The portal is behind a login, so nobody has looked at it for this kit.

## Sources

| # | Page | URL |
|---|---|---|
| S1 | Submit a New App | https://docs.solanamobile.com/dapp-store/submit-new-app |
| S2 | dApp Listing Page Guidelines | https://docs.solanamobile.com/dapp-store/listing-page-guidelines |
| S3 | Submit an Update | https://docs.solanamobile.com/dapp-store/submit-an-update |
| S4 | dApp Publishing CLI | https://docs.solanamobile.com/dapp-store/publishing-cli |
| S5 | Build and Sign an APK | https://docs.solanamobile.com/dapp-store/build-and-sign-an-apk |
| S6 | Publisher Policy (last updated Jul 21, 2026) | https://legal.solanamobile.com/publisher-policy-web (linked from https://docs.solanamobile.com/dapp-store/publisher-policy) |
| S7 | FAQ | https://docs.solanamobile.com/get-started/faq |
| S8 | Portal screenshot "Let's add your dApp details!" (embedded in S1) | https://mintcdn.com/solanalabs/TqbmPoBvHph_ccql/images/static/publishing_portal/new-dapp-details.png |
| S9 | Portal screenshot "Update your dApp details" (embedded in S3) | https://mintcdn.com/solanalabs/TqbmPoBvHph_ccql/images/static/publishing_portal/update-dapp-details.png |
| S10 | Portal screenshot "Upload … release" (embedded in S1) | https://mintcdn.com/solanalabs/TqbmPoBvHph_ccql/images/static/publishing_portal/dapp-apk-upload.png |
| S11 | npm registry: `npm view @solana-mobile/dapp-store-cli` | version `1.0.1`, last modified 2026-09-14 |

## Portal or CLI

| Item | Requirement | Status |
|---|---|---|
| A new app | Use the **Publisher Portal** at https://publish.solanamobile.com. The steps are: sign up, then KYC/KYB, then connect the publisher wallet, then choose storage, then "Add a dApp" > "New dApp", then fill in the details form. After that go to Home, press "New Version" and upload the APK. Approve every signing prompt; this uploads the assets to Arweave and mints the release NFT. | [verified] S1 |
| The CLI | `@solana-mobile/dapp-store-cli` **1.0.1** publishes **new versions only**. The app must already exist in the portal with its App NFT minted. Usage is `dapp-store --apk-file <apk> --keypair <solana-keypair.json> --whats-new "<notes>"` (or `--apk-url`). The API key comes from `DAPP_STORE_API_KEY` or stdin; generate it at https://publish.solanamobile.com/dashboard/settings/api-keys. The CLI reads the package name from the APK and matches it to your app. | [verified] S4, S11 |
| `config.yaml` | The current CLI docs don't mention it. The `publisher / app / release` YAML with `create publisher|app|release` commands belongs to the old 0.x CLI. `mobile/dapp-store/config.yaml` is kept as the single source of truth for listing text and asset paths, which you copy into the portal form. No current tool reads it. | [verified] by omission in S4. Calling it legacy is my inference |
| Publisher wallet | A browser-extension wallet (Phantom, Solflare or Backpack). "Your publisher wallet is required for all future submissions of this app." | [verified] S1 |
| SOL | "~0.2 SOL" for transaction fees and ArDrive upload costs. The portal has a storage cost estimator. If the ArDrive balance would go negative, use "Top Up Balance". | [verified] S1 |
| Storage | ArDrive (recommended) or AWS S3. | [verified] S1 |
| Review | Results go to the developer email from `publishersupport@dappstore.solanamobile.com` "within 3-5 business days". If nothing arrives after 5 days, ask in Discord `#dev-answers`. | [verified] S1, S3 |
| Fees | Solana Mobile charges no fee on in-app purchases, app purchases or subscriptions. | [verified] S7 |

## Listing fields and assets

| Item | Requirement | Status |
|---|---|---|
| dApp name | The guidelines want it unique and memorable and give no limit. **The portal form says "Maximum 25 characters".** | [verified] S2, S8, S9. **Plan for 25.** The brief's 30-character title limit is looser than the portal's. |
| Package name | Reverse-domain Android package, which must match the APK. Mempire's is `fun.mempire.app`. | [verified] S8 |
| Subtitle (short description) | "Short description cannot exceed 30 characters." It is shown under the name in lists and on the detail page. | [verified] S2, S8 |
| Description (long) | Required. A "well-written, concise overview". No length limit is documented. | [verified] S2. The length limit is [unverified]. |
| Icon | **512×512 px**, required. | [verified] S2, S8 |
| Banner | **1200×600 px**. It sits at the top of the detail page behind the icon. The new-dApp form marks it **"(Required)"**. | [verified] S8, S9. It is not mentioned in S2. |
| Feature graphic (1200×1200) | Not in the current docs or the portal screenshots. Only the old CLI asked for it. | [unverified]. Probably no longer used. One is ready anyway. |
| Screenshots ("dApp Preview") | The guidelines say at least 1080 px in width and height, consistent orientation and an equal aspect ratio. **The portal form says "All must be 1080×2400px (Minimum 4 required)"**, while the update form says "Matching dimensions required (Minimum 4 required)". Accepted formats are jpg, png and webp (**3 MB max** each) and mp4 (**30 MB max**). | [verified] S2, S8, S9. **Plan for 4 or more images at exactly 1080×2400, each under 3 MB.** The kit has 6. |
| Preview video | Optional. `.mp4`, at least 720 px in width and height, 1080p recommended, at most 30 MB in the portal. | [verified] S2, S8 |
| What's new (release notes) | "The 'What's new' section is filled out" is required for each **update**, and users see it on the listing. The CLI requires `--whats-new`. | [verified] S3, S4 |
| Category | Not in the docs or the portal screenshots. S1 says an approved app "will go live immediately under an appropriate category", which suggests Solana Mobile assigns it. We request **Games**. | [unverified] |
| Content / age rating | No rating questionnaire is documented. The Publisher Policy lists prohibited content but sets up no age-rating system. | [unverified] |
| Privacy policy | The Publisher Policy says a dApp must "disclose … practices with respect to the collection, use, and disclosure of User Data in a privacy policy or other statement". **No portal field for a privacy-policy URL is documented.** The legacy `config.yaml` had `privacy_policy_url`. Host one anyway. | [verified] S6 for the duty. The URL field is [unverified]. |
| Testing instructions | The legacy config had `testing_instructions`. The current docs don't mention a field for it. | [unverified]. Ready in `LISTING.md`. |
| Keywords | No field is documented. | [unverified]. Ready in `LISTING.md` in case the form has one. |

## APK

| Item | Requirement | Status |
|---|---|---|
| Format | The docs say "The dApp Store requires an APK instead" of an AAB. **The portal upload screen says "Upload your Android app file in .APK or .AAB format."** | [verified] S5, S10. The docs and portal disagree, so **upload an APK**. Mempire's build script produces one. |
| Signing | Use a **signed release APK** and a **dedicated key per app**. If the app is also on Google Play, the dApp Store key must be different. Losing the key means you can never update the app. | [verified] S5 |
| Signing check | `apksigner verify --print-certs app-release.apk` | [verified] S5 |
| Versioning | Every update needs a higher `versionCode`, and `versionName` must be "properly incremented" too. | [verified] S3, S5 |
| Same key on updates | "The APK is signed with the same Android signing key you used for your initial release." | [verified] S3 |
| min/target SDK, debuggable | Not documented. | [unverified]. Mempire's release build uses `minSdkVersion 24` (from `app.json`) and is not debuggable. |

## Policy points that touch Mempire (S6)

- **Third-party IP:** the policy prohibits "Content that infringes on intellectual property of any third-party" and content "designed to create a likelihood of confusion with a third-party's entity, brand, products or services". It also prohibits claiming a false affiliation. **This matters for the roster.** See the IP-risk section of `README.md`.
- **User data:** collect only what is needed, never obtain consent by deceptive means, and "allow user account deletion". Mempire has no accounts or server. Its local data goes away when you clear app data or uninstall. See `PRIVACY.md`.
- **Gambling or wagering:** S6 has no specific rule. The mobile build has no stakes ("NO STAKE · CHEST ON A WIN"). The web game's SOL-pot ranked matches are not in this APK. [unverified] whether review would treat on-chain wagering as gambling if it ever ships.
