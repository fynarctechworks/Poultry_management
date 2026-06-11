// Pure helper for picking a starting language. Lives in its own file so
// unit tests can import it without dragging in AsyncStorage / native
// modules.

export type SupportedLanguage = 'en' | 'hi' | 'te' | 'ta';

export const SUPPORTED_LANGUAGES: ReadonlyArray<SupportedLanguage> = [
  'en',
  'hi',
  'te',
  'ta',
] as const;

export function isSupportedLanguage(
  value: string | null | undefined,
): value is SupportedLanguage {
  return value === 'en' || value === 'hi' || value === 'te' || value === 'ta';
}

/**
 * Pick a starting language by:
 *   1. Reading the persisted choice (passed in by the caller)
 *   2. Falling back to the device's primary locale tag (e.g. 'hi-IN' → 'hi')
 *   3. Falling back to 'en'
 */
export function resolveStartingLanguage(
  persistedValue: string | null | undefined,
  deviceLocales: ReadonlyArray<{ languageCode: string | null }>,
): SupportedLanguage {
  if (isSupportedLanguage(persistedValue)) return persistedValue;
  for (const loc of deviceLocales) {
    const code = loc.languageCode ?? '';
    if (isSupportedLanguage(code)) return code;
  }
  return 'en';
}
