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
import type { EquipmentItem } from "@/modules/equipment/types";

export type EquipmentItemOption = { value: string; label: string; category: string; referenceNumber: string | null; availableQuantity: number };

export function toEquipmentItemOptions(items: EquipmentItem[]): EquipmentItemOption[] {
  return items.map((item) => ({ value: item.id, label: item.name, category: item.category, referenceNumber: item.reference_number, availableQuantity: item.available_quantity }));
}

type EquipmentItemComboboxProps = {
  id?: string;
  "aria-label"?: string;
  value: string | null;
  onValueChange: (itemId: string | null) => void;
  options: EquipmentItemOption[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
};

/** Searchable equipment item picker — mirrors components/shared/employee-combobox.tsx's EmployeeCombobox exactly (same "never render a raw id" / client-side-filter-of-an-already-scoped-list pattern), for the Issue Equipment dialog's item field. */
export function EquipmentItemCombobox({ id, "aria-label": ariaLabel, value, onValueChange, options, placeholder = "Search equipment…", disabled, invalid }: EquipmentItemComboboxProps) {
  const { contains } = useComboboxFilter({ sensitivity: "base" });
  const selected = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value]);

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(next) => onValueChange((next as EquipmentItemOption | null)?.value ?? null)}
      itemToStringLabel={(option: EquipmentItemOption) => option.label}
      filter={(option: EquipmentItemOption, query: string) => contains(option.label, query) || contains(option.category, query) || (option.referenceNumber ? contains(option.referenceNumber, query) : false)}
      disabled={disabled}
    >
      <ComboboxInputGroup data-invalid={invalid || undefined} className="w-full">
        <ComboboxInput id={id} aria-label={ariaLabel} placeholder={placeholder} />
        <ComboboxClear />
        <ComboboxTrigger />
      </ComboboxInputGroup>
      <ComboboxContent>
        <ComboboxEmpty>
          <div className="flex flex-col items-center gap-1.5 text-center">
            <AlertTriangle className="size-4 text-muted-foreground" aria-hidden="true" />
            <span>No equipment found.</span>
          </div>
        </ComboboxEmpty>
        <ComboboxList>
          {(option: EquipmentItemOption) => (
            <ComboboxItem key={option.value} value={option}>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{option.label}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {[option.category, option.referenceNumber, `${option.availableQuantity} available`].filter(Boolean).join(" · ")}
                </span>
              </div>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
