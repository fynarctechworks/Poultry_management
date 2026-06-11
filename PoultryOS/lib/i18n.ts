// PoultryOS — i18n setup.
//
// Languages supported (Phase 6, vernacular launch):
//   en — English (fallback)
//   hi — Hindi (Devanagari)
//   te — Telugu
//   ta — Tamil
//
// Language is detected from the device locale on first launch, then
// persisted to AsyncStorage so the user's choice survives restarts.
// The Settings → Language picker writes to AsyncStorage and calls
// i18n.changeLanguage().
//
// Strings are loaded synchronously at module import time. Translation
// bundles are small (~4 KB each), so the upfront cost is negligible.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from '../locales/en/common.json';
import hi from '../locales/hi/common.json';
import te from '../locales/te/common.json';
import ta from '../locales/ta/common.json';

import {
  resolveStartingLanguage,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from './i18n-resolve';

export { resolveStartingLanguage, SUPPORTED_LANGUAGES };
export type { SupportedLanguage };

const STORAGE_KEY = 'poultryos.language';

// ---------------------------------------------------------------------------
// Initialise i18next synchronously with English as the starting language.
// The async resolveStartingLanguage() runs afterwards and calls
// i18n.changeLanguage() if the persisted / device language differs.
// ---------------------------------------------------------------------------
i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: en },
      hi: { common: hi },
      te: { common: te },
      ta: { common: ta },
    },
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common'],
    interpolation: {
      escapeValue: false, // React Native already escapes
    },
    react: {
      useSuspense: false, // We don't wrap the app in <Suspense>
    },
  });

/**
 * Reads the persisted language from AsyncStorage and (if different from
 * current) calls i18n.changeLanguage(). Falls back to device locale,
 * then English. Safe to call multiple times; the second call is a no-op.
 *
 * App should call this once at root mount (e.g. inside the first
 * useEffect of app/_layout.tsx).
 */
export async function loadPersistedLanguage(): Promise<SupportedLanguage> {
  let stored: string | null = null;
  try {
    stored = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    // AsyncStorage unavailable (e.g. web with disabled storage) — fall back
    stored = null;
  }
  const locales = (() => {
    try {
      return getLocales();
    } catch {
      return [];
    }
  })();
  const target = resolveStartingLanguage(stored, locales);
  if (i18n.language !== target) {
    await i18n.changeLanguage(target);
  }
  return target;
}

/**
 * Persists the user's language choice and switches the active language.
 * Called from the Settings → Language picker.
 */
export async function setLanguage(lang: SupportedLanguage): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Non-fatal — language still switches in memory
  }
  if (i18n.language !== lang) {
    await i18n.changeLanguage(lang);
  }
}

export default i18n;
