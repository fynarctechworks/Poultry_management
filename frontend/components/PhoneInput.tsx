'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  digitsOnly,
  formatPhone,
  parsePhone,
  type Country,
} from '@/lib/constants/countries';

type Props = {
  /** Stored value as an E.164-ish string, e.g. "+919876543210". */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
};

/**
 * Phone field with a country-code selector. The country dictates the maximum
 * number of national digits allowed (India = 10), so users can't overrun the
 * length for their country. Emits a combined "+<dial><digits>" string.
 */
export function PhoneInput({ value, onChange, placeholder, disabled, id }: Props) {
  const { country: parsedCountry, national } = useMemo(() => parsePhone(value), [value]);

  // The selected country is held in local state, NOT derived solely from `value`.
  // An empty national number serialises to an empty string that carries no country
  // prefix, and dial codes can collide (US/Canada both = +1) — in both cases
  // re-parsing `value` would silently snap the selector back to the default. Local
  // state keeps the user's choice stable until they pick a different country.
  const [iso2, setIso2] = useState(parsedCountry.iso2);
  const country = COUNTRIES.find((c) => c.iso2 === iso2) ?? DEFAULT_COUNTRY;
  const maxLen = Math.max(...country.lengths);

  // Adopt the country implied by an externally-changed value (edit prefill, form
  // reset) — but only when the value is non-empty AND its dial code differs from
  // the current selection, so empty resets and same-dial picks (Canada) survive.
  const lastValue = useRef(value);
  useEffect(() => {
    if (value === lastValue.current) return;
    lastValue.current = value;
    if (digitsOnly(value) && parsedCountry.dial !== country.dial) {
      setIso2(parsedCountry.iso2);
    }
  }, [value, parsedCountry.dial, parsedCountry.iso2, country.dial]);

  function selectCountry(nextIso2: string) {
    const next = COUNTRIES.find((c) => c.iso2 === nextIso2) ?? country;
    setIso2(next.iso2);
    // Re-clamp the existing national number to the new country's max length.
    onChange(formatPhone(next, digitsOnly(national).slice(0, Math.max(...next.lengths))));
  }

  function setNational(input: string) {
    const trimmed = digitsOnly(input).slice(0, maxLen);
    onChange(formatPhone(country, trimmed));
  }

  return (
    <div className="flex gap-sm">
      <select
        aria-label="Country code"
        disabled={disabled}
        value={country.iso2}
        onChange={(e) => selectCountry(e.target.value)}
        className="input w-auto shrink-0 pr-sm"
      >
        {COUNTRIES.map((c: Country) => (
          <option key={c.iso2} value={c.iso2}>
            {c.iso2} +{c.dial}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        disabled={disabled}
        value={national}
        maxLength={maxLen}
        onChange={(e) => setNational(e.target.value)}
        placeholder={placeholder ?? `${maxLen}-digit number`}
        className="input"
      />
    </div>
  );
}
