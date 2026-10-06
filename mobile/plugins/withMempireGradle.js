const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Two things `app/build.gradle` needs that Expo does not put there.
 *
 * `android/` is generated and gitignored, so every `expo prebuild --clean`
 * throws away anything hand-edited into it. Both of these were hand-edited
 * once, and the very next clean prebuild silently reverted them — the release
 * build went back to being signed with the debug key, which produces an APK
 * that installs fine and can never be updated by a properly signed one.
 *
 * A plugin runs on every prebuild, so the generated project is correct by
 * construction rather than by someone remembering a step in DEPLOY.md.
 *
 *  1. **Release signing.** From MEMPIRE_KEYSTORE / MEMPIRE_KEYSTORE_PASSWORD
 *     (kept outside the public repo); debug key only as a labelled fallback.
 *  2. **ABIs.** arm64-v8a (Seeker and any modern phone) plus x86_64 (emulators),
 *     in one APK.
 */
const SIGNING = `
        // Added by plugins/withMempireGradle.js — do not hand-edit, prebuild
        // regenerates this file. The keystore and its passwords live OUTSIDE
        // the repo and arrive by environment (see HANDOFF.md). Without them a
        // release build falls back to the debug key, loudly.
        mempireRelease {
            if (System.getenv('MEMPIRE_KEYSTORE')) {
                storeFile file(System.getenv('MEMPIRE_KEYSTORE'))
                storePassword System.getenv('MEMPIRE_KEYSTORE_PASSWORD')
                keyAlias System.getenv('MEMPIRE_KEY_ALIAS') ?: 'mempire'
                keyPassword System.getenv('MEMPIRE_KEY_PASSWORD') ?: System.getenv('MEMPIRE_KEYSTORE_PASSWORD')
            } else {
                println("WARNING: MEMPIRE_KEYSTORE not set - release APK will be signed with the DEBUG key")
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }
`;

const ABIS = `
        // Added by plugins/withMempireGradle.js: Seeker and modern phones are
        // arm64; x86_64 keeps the APK installable on an emulator. One APK,
        // no 32-bit ARM, roughly a third smaller than a four-ABI universal.
        ndk { abiFilters "arm64-v8a", "x86_64" }
`;

module.exports = function withMempireGradle(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;

    if (!src.includes('mempireRelease')) {
      src = src.replace('    signingConfigs {', `    signingConfigs {${SIGNING}`);
      // The template signs release with the debug key and says so in a comment.
      // Matched loosely because that comment's wording has changed between
      // React Native versions and an exact match would silently no-op.
      src = src.replace(
        /(release\s*\{[^}]*?signingConfig\s+signingConfigs\.)debug/,
        '$1mempireRelease',
      );
    }

    if (!src.includes('abiFilters')) {
      src = src.replace(/(defaultConfig \{\n)/, `$1${ABIS}`);
    }

    cfg.modResults.contents = src;
    return cfg;
  });
};
