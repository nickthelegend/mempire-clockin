const { withAppBuildGradle, withXcodeProject } = require('expo/config-plugins');

/**
 * Ship the game inside the binary.
 *
 * `scripts/build-www.sh` stages the Vite build at `mobile/web/www`. This plugin
 * makes both native projects carry that folder, so the app loads the game from
 * file:// and needs no hosted web server:
 *
 *  - Android: `mobile/web` is added as an extra assets dir, so the APK holds
 *    `assets/www/index.html` → `file:///android_asset/www/index.html`.
 *  - iOS: a build phase copies `mobile/web/www` into the .app bundle root as a
 *    folder, read at `<bundle>/www/index.html`.
 *
 * Done at build time rather than copied in at prebuild so a client rebuild
 * only needs `build:www` + a native build, not a clean prebuild.
 */
const ANDROID = `
    // Added by plugins/withBundledWeb.js — the game client, from mobile/web/www.
    sourceSets {
        main {
            assets.srcDirs += [new File(rootDir, "../web")]
        }
    }
`;

function withAndroid(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('withBundledWeb')) {
      src = src.replace(/\nandroid \{\n/, `\nandroid {\n${ANDROID}\n`);
    }
    cfg.modResults.contents = src;
    return cfg;
  });
}

const PHASE = 'Bundle Mempire game client';
const SCRIPT = [
  'set -e',
  'SRC="${PROJECT_DIR}/../web/www"',
  'DST="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/www"',
  'if [ ! -f "$SRC/index.html" ]; then echo "error: mobile/web/www missing - run npm run build:www" >&2; exit 1; fi',
  'mkdir -p "$DST"',
  'rsync -a --delete "$SRC/" "$DST/"',
].join('\n');

function withIos(config) {
  return withXcodeProject(config, (cfg) => {
    const proj = cfg.modResults;
    const phases = proj.hash.project.objects.PBXShellScriptBuildPhase || {};
    const exists = Object.values(phases).some(
      (p) => p && typeof p === 'object' && String(p.name || '').includes(PHASE),
    );
    if (!exists) {
      const target = proj.getFirstTarget().uuid;
      proj.addBuildPhase([], 'PBXShellScriptBuildPhase', PHASE, target, {
        shellPath: '/bin/sh',
        shellScript: SCRIPT,
      });
    }
    // Expo's "Bundle React Native code and images" phase runs the RN script
    // through an unquoted backtick substitution, which word-splits any path
    // with a space in it ("/Volumes/Extreme SSD/..."). Quote it.
    for (const p of Object.values(phases)) {
      if (!p || typeof p !== 'object' || !String(p.name || '').includes('Bundle React Native')) continue;
      p.shellScript = String(p.shellScript)
        .replace('`\\"$NODE_BINARY\\" --print', '\\"$(\\"$NODE_BINARY\\" --print')
        .replace("react-native-xcode.sh'\\\"`", "react-native-xcode.sh'\\\")\\\"");
    }
    // The phase reads outside the project and writes into the bundle; Xcode's
    // user-script sandbox would refuse both.
    const configs = proj.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configs)) {
      const bs = configs[key] && configs[key].buildSettings;
      if (bs && bs.PRODUCT_NAME) bs.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
    }
    return cfg;
  });
}

module.exports = function withBundledWeb(config) {
  return withIos(withAndroid(config));
};
