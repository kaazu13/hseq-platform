"use client";

import { useMemo } from "react";
import { Combobox, ComboboxInputGroup, ComboboxInput, ComboboxClear, ComboboxTrigger, ComboboxContent, ComboboxList, ComboboxEmpty, ComboboxItem, useComboboxFilter } from "@/components/ui/combobox";

export const IANA_TIMEZONES: string[] = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

type TimezoneOption = { value: string; label: string };

const TIMEZONE_OPTIONS: TimezoneOption[] = IANA_TIMEZONES.map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") })).sort((a, b) => a.label.localeCompare(b.label));

type TimezoneComboboxProps = {
  id?: string;
  "aria-label"?: string;
  value: string | null;
  onValueChange: (timezone: string | null) => void;
  invalid?: boolean;
  disabled?: boolean;
};

/** Searchable IANA timezone picker (~418 entries via the built-in Intl.supportedValuesOf('timeZone') — no extra library, no giant bundled list) — Task 3 Part 12. */
export function TimezoneCombobox({ id, "aria-label": ariaLabel, value, onValueChange, invalid, disabled }: TimezoneComboboxProps) {
  const { contains } = useComboboxFilter({ sensitivity: "base" });
  const selected = useMemo(() => TIMEZONE_OPTIONS.find((option) => option.value === value) ?? null, [value]);

  return (
    <Combobox
      items={TIMEZONE_OPTIONS}
      value={selected}
      onValueChange={(next) => onValueChange((next as TimezoneOption | null)?.value ?? null)}
      itemToStringLabel={(option: TimezoneOption) => option.label}
      filter={(option: TimezoneOption, query: string) => contains(option.label, query)}
      disabled={disabled}
    >
      <ComboboxInputGroup data-invalid={invalid || undefined} className="w-full">
        <ComboboxInput id={id} aria-label={ariaLabel} placeholder="Search timezones…" />
        <ComboboxClear />
        <ComboboxTrigger />
      </ComboboxInputGroup>
      <ComboboxContent>
        <ComboboxEmpty>No matching timezone.</ComboboxEmpty>
        <ComboboxList>{(option: TimezoneOption) => <ComboboxItem key={option.value} value={option}>{option.label}</ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
