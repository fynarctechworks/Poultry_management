// Country dial codes + national-number length rules used by the PhoneInput.
// `lengths` is the set of valid national (post dial-code) digit counts for that
// country — e.g. India is always 10 digits. India is the default / first entry.

export interface Country {
  name: string;
  iso2: string;
  dial: string; // without leading "+"
  lengths: number[]; // allowed national significant number lengths
}

export const COUNTRIES: Country[] = [
  { name: 'India', iso2: 'IN', dial: '91', lengths: [10] },
  { name: 'United States', iso2: 'US', dial: '1', lengths: [10] },
  { name: 'United Kingdom', iso2: 'GB', dial: '44', lengths: [10] },
  { name: 'United Arab Emirates', iso2: 'AE', dial: '971', lengths: [9] },
  { name: 'Singapore', iso2: 'SG', dial: '65', lengths: [8] },
  { name: 'Australia', iso2: 'AU', dial: '61', lengths: [9] },
  { name: 'Canada', iso2: 'CA', dial: '1', lengths: [10] },
  { name: 'Bangladesh', iso2: 'BD', dial: '880', lengths: [10] },
  { name: 'Nepal', iso2: 'NP', dial: '977', lengths: [10] },
  { name: 'Sri Lanka', iso2: 'LK', dial: '94', lengths: [9] },
  { name: 'Pakistan', iso2: 'PK', dial: '92', lengths: [10] },
  { name: 'Saudi Arabia', iso2: 'SA', dial: '966', lengths: [9] },
  { name: 'Malaysia', iso2: 'MY', dial: '60', lengths: [9, 10] },
  { name: 'Germany', iso2: 'DE', dial: '49', lengths: [10, 11] },
  { name: 'France', iso2: 'FR', dial: '33', lengths: [9] },
];

export const DEFAULT_COUNTRY = COUNTRIES[0]; // India

// Longest dial codes first so prefix matching is unambiguous (e.g. "1" vs "971").
const BY_DIAL_DESC = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

/** Strip everything except digits. */
export function digitsOnly(value: string): string {
  return (value ?? '').replace(/\D/g, '');
}

/** Split a stored E.164-ish string into a country + national number. */
export function parsePhone(value: string | undefined | null): {
  country: Country;
  national: string;
} {
  const raw = (value ?? '').trim();
  if (raw.startsWith('+')) {
    const digits = digitsOnly(raw);
    const match = BY_DIAL_DESC.find((c) => digits.startsWith(c.dial));
    if (match) {
      return { country: match, national: digits.slice(match.dial.length) };
    }
  }
  // No country prefix recognised — treat the whole thing as a national number
  // under the default country.
  return { country: DEFAULT_COUNTRY, national: digitsOnly(raw) };
}

/** Build the stored E.164 string from a country + national number. */
export function formatPhone(country: Country, national: string): string {
  const d = digitsOnly(national);
  return d ? `+${country.dial}${d}` : '';
}

/** True when the national number has a valid length for the country. */
export function isValidPhone(country: Country, national: string): boolean {
  return country.lengths.includes(digitsOnly(national).length);
}

/**
 * Validate a stored phone string for use in Zod `.refine(...)`. Empty passes when
 * `optional` (the default); otherwise the digits must form a valid national number
 * for the detected country.
 */
export function isValidPhoneString(
  value: string | undefined | null,
  { optional = true }: { optional?: boolean } = {},
): boolean {
  const v = (value ?? '').trim();
  if (!v) return optional;
  const { country, national } = parsePhone(v);
  return isValidPhone(country, national);
}
