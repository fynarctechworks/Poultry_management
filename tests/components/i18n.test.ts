import { resolveStartingLanguage } from '../../PoultryOS/lib/i18n-resolve';

describe('resolveStartingLanguage', () => {
  it('prefers a persisted supported value over the device locale', () => {
    expect(
      resolveStartingLanguage('hi', [{ languageCode: 'en' }]),
    ).toBe('hi');
  });

  it('ignores a persisted value that is not in the supported set', () => {
    expect(
      resolveStartingLanguage('fr', [{ languageCode: 'ta' }]),
    ).toBe('ta');
  });

  it('falls back to the first supported device locale when nothing is persisted', () => {
    expect(
      resolveStartingLanguage(null, [{ languageCode: 'te' }]),
    ).toBe('te');
  });

  it('walks the device locale list to find the first supported language', () => {
    expect(
      resolveStartingLanguage(null, [
        { languageCode: 'fr' },
        { languageCode: 'es' },
        { languageCode: 'hi' },
        { languageCode: 'ta' },
      ]),
    ).toBe('hi');
  });

  it('falls back to English when no device locale matches', () => {
    expect(
      resolveStartingLanguage(null, [
        { languageCode: 'fr' },
        { languageCode: 'de' },
      ]),
    ).toBe('en');
  });

  it('falls back to English when device locales are empty', () => {
    expect(resolveStartingLanguage(null, [])).toBe('en');
  });

  it('treats undefined / empty persisted values as missing', () => {
    expect(
      resolveStartingLanguage(undefined, [{ languageCode: 'en' }]),
    ).toBe('en');
    expect(
      resolveStartingLanguage('', [{ languageCode: 'hi' }]),
    ).toBe('hi');
  });

  it('handles device locale entries with null languageCode', () => {
    expect(
      resolveStartingLanguage(null, [
        { languageCode: null },
        { languageCode: 'ta' },
      ]),
    ).toBe('ta');
  });
});
