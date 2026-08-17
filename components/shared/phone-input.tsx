"use client";

import { useMemo, useState } from "react";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import { Combobox, ComboboxInputGroup, ComboboxInput, ComboboxTrigger, ComboboxContent, ComboboxList, ComboboxEmpty, ComboboxItem, useComboboxFilter } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { PHONE_COUNTRIES, callingCodeFor, countryDisplayName, toE164 } from "@/lib/phone";

type CountryOption = { value: CountryCode; label: string; callingCode: string };

const COUNTRY_OPTIONS: CountryOption[] = PHONE_COUNTRIES.map((country) => ({
  value: country,
  label: countryDisplayName(country),
  callingCode: callingCodeFor(country),
})).sort((a, b) => a.label.localeCompare(b.label));

const DEFAULT_COUNTRY: CountryCode = "US";

function splitE164(value: string): { country: CountryCode; nationalNumber: string } {
  const parsed = value ? parsePhoneNumberFromString(value) : undefined;
  if (parsed?.country) {
    return { country: parsed.country, nationalNumber: parsed.formatNational().replace(/[^\d]/g, "") };
  }
  return { country: DEFAULT_COUNTRY, nationalNumber: "" };
}

type PhoneInputProps = {
  id?: string;
  /** The current value as E.164 ("+15551234567") or "" when empty. */
  value: string;
  /** Called with the new E.164 value on every change, or "" if the field is now empty/incomplete. */
  onChange: (e164: string) => void;
  invalid?: boolean;
  disabled?: boolean;
};

/**
 * Country-code picker + national-number input, always producing E.164 —
 * Task 3 Part 6. Built on libphonenumber-js (lib/phone.ts) rather than a
 * hand-rolled country list/regex. The country combobox reuses this
 * codebase's existing Combobox primitives (components/shared/employee-
 * combobox.tsx's precedent) instead of a plain `<Select>`, for the same
 * reason: consistent searchable-picker UX across the app.
 */
export function PhoneInput({ id, value, onChange, invalid, disabled }: PhoneInputProps) {
  const initial = useMemo(() => splitE164(value), [value]);
  const [country, setCountry] = useState<CountryCode>(initial.country);
  const [nationalNumber, setNationalNumber] = useState(initial.nationalNumber);
  const { contains } = useComboboxFilter({ sensitivity: "base" });

  const selectedCountry = COUNTRY_OPTIONS.find((option) => option.value === country) ?? null;

  function emit(nextCountry: CountryCode, nextNationalNumber: string) {
    if (!nextNationalNumber.trim()) {
      onChange("");
      return;
    }
    onChange(toE164(nextNationalNumber, nextCountry) ?? "");
  }

  return (
    <div className="flex gap-2">
      <Combobox
        items={COUNTRY_OPTIONS}
        value={selectedCountry}
        onValueChange={(next) => {
          const option = next as CountryOption | null;
          if (!option) return;
          setCountry(option.value);
          emit(option.value, nationalNumber);
        }}
        itemToStringLabel={(option: CountryOption) => option.label}
        filter={(option: CountryOption, query: string) => contains(option.label, query) || contains(option.callingCode, query)}
        disabled={disabled}
      >
        <ComboboxInputGroup className="w-28 shrink-0">
          <ComboboxInput id={id ? `${id}-country` : undefined} aria-label="Country code" readOnly value={selectedCountry?.callingCode ?? ""} />
          <ComboboxTrigger />
        </ComboboxInputGroup>
        <ComboboxContent>
          <ComboboxEmpty>No matching country.</ComboboxEmpty>
          <ComboboxList>
            {(option: CountryOption) => (
              <ComboboxItem key={option.value} value={option}>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate">{option.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{option.callingCode}</span>
                </div>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        aria-label="Phone number"
        aria-invalid={invalid}
        disabled={disabled}
        value={nationalNumber}
        onChange={(event) => {
          const next = event.target.value;
          setNationalNumber(next);
          emit(country, next);
        }}
        className="flex-1"
        placeholder="Phone number"
      />
    </div>
  );
}
