import { getCountries, getCountryCallingCode, isValidPhoneNumber, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

/**
 * Shared phone-number helpers (Task 3 Part 6) built on libphonenumber-js —
 * the maintained library for parsing/validating/formatting phone numbers,
 * used instead of hand-rolled regex so international numbers are handled
 * correctly. The `/min` build is used everywhere (client and server) to
 * keep the bundle small (Part 39's "no giant bundles" constraint) — it
 * covers validation/formatting/country metadata, which is all this app
 * needs; it does not include the extra example-number/carrier data the
 * full build ships.
 */

export const PHONE_COUNTRIES: CountryCode[] = getCountries();

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

export function isValidE164(value: string): boolean {
  return E164_REGEX.test(value);
}

/** Country display name (e.g. "United States") via the built-in Intl API — no extra dependency needed for country names. */
export function countryDisplayName(country: CountryCode, locale = "en"): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(country) ?? country;
  } catch {
    return country;
  }
}

export function callingCodeFor(country: CountryCode): string {
  return `+${getCountryCallingCode(country)}`;
}

/** Parses a national-format number for the given country into E.164, or null if it isn't a valid number for that country. */
export function toE164(nationalNumber: string, country: CountryCode): string | null {
  const parsed = parsePhoneNumberFromString(nationalNumber, country);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/** Best-effort human-readable formatting of an already-E.164 number for display (falls back to the raw value if it can't be parsed). */
export function formatE164ForDisplay(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatInternational() : e164;
}

export function isValidE164ForAnyCountry(e164: string): boolean {
  return isValidPhoneNumber(e164);
}

/**
 * Regional-indicator flag emoji for a country code (e.g. "US" -> "🇺🇸") —
 * no image assets needed, every ISO 3166-1 alpha-2 code maps onto a pair of
 * Unicode regional indicator symbols. Used by the phone/country pickers'
 * Account redesign (Phase 4) to make the option list scannable without
 * relying on the country name text alone.
 */
export function flagEmoji(country: CountryCode): string {
  return String.fromCodePoint(...[...country.toUpperCase()].map((char) => 127397 + char.charCodeAt(0)));
}
