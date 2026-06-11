const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @poultryos/shared is a symlinked TS source package living outside the
// project root — Metro must watch its real path to resolve it.
config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.resolve(__dirname, '../packages/shared'),
];

config.transformer = {
  ...config.transformer,
  unstable_allowRequireContext: true,
};

config.resolver = {
  ...config.resolver,
  // Prefer CJS over ESM so packages like zustand don't load .mjs files
  // that contain import.meta (which Metro/Hermes can't handle on web).
  unstable_enablePackageExports: false,
  sourceExts: [...(config.resolver.sourceExts ?? []), 'cjs'],
};

module.exports = config;
