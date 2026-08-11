"use client";

import { X } from "lucide-react";
import { EmployeeCombobox } from "@/components/shared/employee-combobox";
import type { EmployeeOption } from "@/modules/employees/employee-options";
import { Button } from "@/components/ui/button";

type EmployeeMultiSelectProps = {
  options: EmployeeOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  /** Hard cap on how many can be selected — the combobox itself disables once reached (Phase 10's "worker participant count: sensible upper limit"). */
  maxCount?: number;
};

/**
 * Shared searchable multi-select — search-and-add over `EmployeeCombobox`,
 * selections rendered as compact removable rows below rather than a
 * checkbox wall (replaces the plain "grid of checkboxes over the whole
 * roster" pattern every prior participants picker in this codebase used —
 * modules/lmra/components/lmra-participants-picker.tsx,
 * modules/observations/components/observation-participants-picker.tsx —
 * for the LMRA redesign specifically; those other call sites are left
 * exactly as they were, per this milestone's "do not refactor unrelated
 * modules broadly" scope). Built as a shared component (not LMRA-only)
 * since it's a genuinely reusable UI pattern — the same "search, add
 * individually, remove, see count/role" requirement will recur for
 * Toolbox Meetings/Safety Observations per the Daily Workforce milestone's
 * own Phase I intent, even though only LMRA calls it today.
 */
export function EmployeeMultiSelect({ options, selectedIds, onChange, placeholder, emptyMessage, disabled, maxCount }: EmployeeMultiSelectProps) {
  const selectedSet = new Set(selectedIds);
  // Preserve the selection order the caller passed in (e.g. "team added
  // first, then individually added workers"), not the candidate list's own
  // order — first find each id's option, skipping ones no longer present
  // in `options` (a stale id from a prior date/project) rather than
  // crashing on lookup failure.
  const selectedOptions = selectedIds
    .map((id) => options.find((option) => option.value === id))
    .filter((option): option is EmployeeOption => Boolean(option));

  const atMax = maxCount !== undefined && selectedIds.length >= maxCount;

  function handleAdd(id: string | null) {
    if (!id || selectedSet.has(id) || atMax) return;
    onChange([...selectedIds, id]);
  }

  function handleRemove(id: string) {
    onChange(selectedIds.filter((existing) => existing !== id));
  }

  return (
    <div className="flex flex-col gap-2">
      <EmployeeCombobox
        value={null}
        onValueChange={handleAdd}
        options={options}
        excludeIds={selectedIds}
        placeholder={atMax ? `Maximum of ${maxCount} reached` : (placeholder ?? "Search employee…")}
        emptyMessage={emptyMessage}
        disabled={disabled || atMax}
        clearable={false}
      />

      {selectedOptions.length > 0 && (
        <div className="flex flex-col divide-y overflow-hidden rounded-lg border">
          {selectedOptions.map((option) => (
            <div key={option.value} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate font-medium">{option.label}</span>
              <div className="flex shrink-0 items-center gap-2">
                {option.roleLabel && <span className="text-xs text-muted-foreground">{option.roleLabel}</span>}
                {!disabled && (
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => handleRemove(option.value)} aria-label={`Remove ${option.label}`}>
                    <X />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
