"use client";

import { useMemo } from "react";
import type { CountryCode } from "libphonenumber-js/min";
import { Combobox, ComboboxInputGroup, ComboboxInput, ComboboxClear, ComboboxTrigger, ComboboxContent, ComboboxList, ComboboxEmpty, ComboboxItem, useComboboxFilter } from "@/components/ui/combobox";
import { PHONE_COUNTRIES, countryDisplayName } from "@/lib/phone";

type CountryOption = { value: CountryCode; label: string };

const COUNTRY_OPTIONS: CountryOption[] = PHONE_COUNTRIES.map((country) => ({ value: country, label: countryDisplayName(country) })).sort((a, b) => a.label.localeCompare(b.label));

type CountryComboboxProps = {
  id?: string;
  "aria-label"?: string;
  value: string | null;
  onValueChange: (countryCode: string | null) => void;
  invalid?: boolean;
  disabled?: boolean;
};

/** Searchable ISO 3166-1 alpha-2 country picker — same Combobox-over-a-known-list pattern as components/shared/employee-combobox.tsx and modules/daily-workforce (PhoneInput's country selector), reused here for any plain "which country" field (Task 3 Part 12's project country_code). */
export function CountryCombobox({ id, "aria-label": ariaLabel, value, onValueChange, invalid, disabled }: CountryComboboxProps) {
  const { contains } = useComboboxFilter({ sensitivity: "base" });
  const selected = useMemo(() => COUNTRY_OPTIONS.find((option) => option.value === value) ?? null, [value]);

  return (
    <Combobox
      items={COUNTRY_OPTIONS}
      value={selected}
      onValueChange={(next) => onValueChange((next as CountryOption | null)?.value ?? null)}
      itemToStringLabel={(option: CountryOption) => option.label}
      filter={(option: CountryOption, query: string) => contains(option.label, query)}
      disabled={disabled}
    >
      <ComboboxInputGroup data-invalid={invalid || undefined} className="w-full">
        <ComboboxInput id={id} aria-label={ariaLabel} placeholder="Search countries…" />
        <ComboboxClear />
        <ComboboxTrigger />
      </ComboboxInputGroup>
      <ComboboxContent>
        <ComboboxEmpty>No matching country.</ComboboxEmpty>
        <ComboboxList>{(option: CountryOption) => <ComboboxItem key={option.value} value={option}>{option.label}</ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
