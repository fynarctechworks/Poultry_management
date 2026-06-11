// Jest config for PoultryOS — picks up tests from both PoultryOS/ and ../tests/components/
// Preset: jest-expo (handles RN transforms, mocks, and environment)

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>', '<rootDir>/../tests/components'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!(' +
      '(jest-)?react-native' +
      '|@react-native(-community)?' +
      '|expo(nent)?' +
      '|@expo(nent)?/.*' +
      '|@expo-google-fonts/.*' +
      '|react-navigation' +
      '|@react-navigation/.*' +
      '|@unimodules/.*' +
      '|unimodules' +
      '|sentry-expo' +
      '|native-base' +
      '|react-native-svg' +
      '|react-native-paper' +
      '|@callstack/react-theme-provider' +
      '|@poultryos/shared' +
    '))',
  ],
  // When tests live outside rootDir (tests/components/), we must tell Jest
  // where to find node_modules. modulePaths adds PoultryOS/node_modules to
  // the resolver search path so cross-directory imports work.
  modulePaths: ['<rootDir>/node_modules'],
  moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
};
