const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/**
 * The native app shares source with the web game rather than copying it:
 *
 *  - `app/src/sim`   the deterministic battle engine (AI coach + native arena)
 *  - `app/src/three` the 3D arena scene, rendered with @react-three/fiber/native
 *
 * Shared files sit outside this package, so two things are needed:
 *  1. Metro watches `app/src`.
 *  2. Bare imports made *from* `app/src` (three, @react-three/fiber, zustand,
 *     react…) resolve from mobile/node_modules — never app/node_modules —
 *     otherwise the app would load a second React and a second three.js, and
 *     the R3F native polyfills would patch the wrong one.
 *
 * Platform files (`*.native.ts`) in app/src supply the pieces that differ on a
 * phone: baked textures instead of a 2D canvas, bundled cut-out card art.
 */
const config = getDefaultConfig(__dirname);
const APP_SRC = path.resolve(__dirname, '../app/src');
const ANCHOR = path.join(__dirname, 'index.ts');

config.watchFolders = [...(config.watchFolders || []), APP_SRC];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream || context.resolveRequest;
  const bare = !moduleName.startsWith('.') && !path.isAbsolute(moduleName);
  if (bare && context.originModulePath.startsWith(APP_SRC)) {
    return resolve({ ...context, originModulePath: ANCHOR }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
