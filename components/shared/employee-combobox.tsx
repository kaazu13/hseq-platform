"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxClear,
  ComboboxTrigger,
  ComboboxContent,
  ComboboxList,
  ComboboxEmpty,
  ComboboxItem,
  useComboboxFilter,
} from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import type { EmployeeOption } from "@/modules/employees/employee-options";

// `EmployeeOption`/`toEmployeeOptions` live in modules/employees/employee-options.ts
// (no "use client" directive) specifically so Server Components can call
// toEmployeeOptions() directly — importing ANY export, including a plain
// function, from a "use client" module from a Server Component is invalid
// in the App Router. Re-exporting the type here only, not the function,
// keeps that boundary enforced: this file is the client component, that
// one is the neutral helper. See components/shared/employee-combobox-boundary.test.ts.
export type { EmployeeOption };

type EmployeeComboboxProps = {
  id?: string;
  "aria-label"?: string;
  value: string | null;
  onValueChange: (employeeId: string | null) => void;
  options: EmployeeOption[];
  placeholder?: string;
  emptyMessage?: string;
  /** Employee ids to hide from the results (e.g. people already picked in a sibling team-member slot) — the currently selected value is always still shown even if also listed here, so re-opening a filled slot never appears to "lose" its selection. */
  excludeIds?: string[];
  disabled?: boolean;
  invalid?: boolean;
  clearable?: boolean;
};

/**
 * Shared searchable employee picker — the single replacement for every
 * plain `<Select>` employee dropdown in this codebase. Two problems fixed
 * at once:
 *
 * 1. **UUID display bug**: Base UI's `<Select.Value>` renders the raw
 *    selected `value` by default unless given a label-mapping function —
 *    every existing `<Select>`-based employee picker
 *    (modules/scaffolds/components/scaffold-form.tsx and six others) hits
 *    this exactly, showing the employee's UUID once selected instead of
 *    their name. This component never has that failure mode: `Combobox`'s
 *    `{value, label}` item shape means the input always displays `label`,
 *    and the caller-facing `value`/`onValueChange` here are plain
 *    `string | null` employee ids — the UUID is only ever the submitted
 *    value, never rendered.
 * 2. **Scalability**: a plain `<Select>` renders every candidate as a
 *    static scroll list. This filters client-side, by name AND employee
 *    number, as the user types.
 *
 * Filtering is client-side (no debounce, no server round trip) because
 * every caller today passes an already project/eligibility-scoped
 * candidate list (tens of people at most, from the same
 * project_assignments-based queries every picker already used) — see each
 * call site's own query for the actual eligibility rule, which this
 * component has no opinion on (Part 2's explicit "do not change
 * module-specific eligibility rules while reusing the UI component").
 */
export function EmployeeCombobox({
  id,
  "aria-label": ariaLabel,
  value,
  onValueChange,
  options,
  placeholder = "Search by name or employee number…",
  emptyMessage = "No eligible people found.",
  excludeIds,
  disabled,
  invalid,
  clearable = true,
}: EmployeeComboboxProps) {
  const { contains } = useComboboxFilter({ sensitivity: "base" });

  const availableOptions = useMemo(() => {
    if (!excludeIds || excludeIds.length === 0) return options;
    const excluded = new Set(excludeIds);
    return options.filter((option) => option.value === value || !excluded.has(option.value));
  }, [options, excludeIds, value]);

  const selected = useMemo(() => availableOptions.find((option) => option.value === value) ?? null, [availableOptions, value]);

  return (
    <Combobox
      items={availableOptions}
      value={selected}
      onValueChange={(next) => onValueChange((next as EmployeeOption | null)?.value ?? null)}
      itemToStringLabel={(option: EmployeeOption) => option.label}
      filter={(option: EmployeeOption, query: string) => contains(option.label, query) || (option.employeeNumber ? contains(option.employeeNumber, query) : false)}
      disabled={disabled}
    >
      <ComboboxInputGroup data-invalid={invalid || undefined} className="w-full">
        <ComboboxInput id={id} aria-label={ariaLabel} placeholder={placeholder} />
        {clearable && <ComboboxClear />}
        <ComboboxTrigger />
      </ComboboxInputGroup>
      <ComboboxContent>
        <ComboboxEmpty>
          <div className="flex flex-col items-center gap-1.5 text-center">
            <AlertTriangle className="size-4 text-muted-foreground" aria-hidden="true" />
            <span>{emptyMessage}</span>
          </div>
        </ComboboxEmpty>
        <ComboboxList>
          {(option: EmployeeOption) => (
            <ComboboxItem key={option.value} value={option}>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{option.label}</span>
                {(option.roleLabel || option.employeeNumber) && (
                  <span className="truncate text-xs text-muted-foreground">{[option.roleLabel, option.employeeNumber].filter(Boolean).join(" · ")}</span>
                )}
              </div>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/** Small convenience wrapper pairing a `<Label>` with `EmployeeCombobox` and an inline field error — the shape every scaffold-form field this milestone uses. */
export function EmployeeComboboxField({
  label,
  htmlFor,
  error,
  ...props
}: EmployeeComboboxProps & { label: string; htmlFor: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      <EmployeeCombobox id={htmlFor} invalid={Boolean(error)} {...props} />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
