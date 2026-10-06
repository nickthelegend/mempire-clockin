const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/**
 * The native app shares one source of truth with the web game: the
 * deterministic battle simulation in `app/src/sim`. The AI coach runs that same
 * engine on-device, so a coach verdict is a statement about the real game, not
 * a re-implementation of it. Metro is told to watch that folder and to resolve
 * its (dependency-free) imports from this package.
 */
const config = getDefaultConfig(__dirname);
const SIM = path.resolve(__dirname, '../app/src/sim');
config.watchFolders = [...(config.watchFolders || []), SIM];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = config;
