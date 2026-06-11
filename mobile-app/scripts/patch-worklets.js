// Patches react-native-worklets@0.5.x exports field.
// The package ships with exports:{} which blocks require('react-native-worklets/plugin').
// babel-preset-expo (SDK 54) requires that subpath — this adds it back.
const fs = require('fs');
const path = require('path');

const pkgPath = path.resolve(__dirname, '../node_modules/react-native-worklets/package.json');

try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.exports = {
    '.': './lib/module/index.js',
    './plugin': './plugin/index.js',
  };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log('✓ patched react-native-worklets exports');
} catch (e) {
  // Package not installed yet — silently skip
}
