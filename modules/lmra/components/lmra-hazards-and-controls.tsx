"use client";

import { EmployeeComboboxField } from "@/components/shared/employee-combobox";
import type { EmployeeOption } from "@/modules/employees/employee-options";
import { LMRA_HAZARD_TYPE_LABELS, LMRA_COMMON_CONTROLS, type LmraHazardInput, type LmraHazardType } from "@/modules/lmra/types";
import { SectionHeader } from "@/components/shared/section-header";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type LmraHazardsAndControlsProps = {
  rows: LmraHazardInput[];
  /** Optional so a read-only render (e.g. the detail page, a Server Component) never needs to pass a function prop across the server/client boundary. */
  onChange?: (rows: LmraHazardInput[]) => void;
  /** Item 1: already filtered to this LMRA's own Workers Involved by the caller (LmraForm) — never the full project roster. Each "Responsible person" combobox below is scoped to exactly this list. */
  candidates: EmployeeOption[];
  readOnly?: boolean;
};

/**
 * Hazards Identified (Phase 4) + Control Measures (Phase 5) — two distinct
 * sections sharing one `rows` state: a compact toggle list (never oversized
 * per-hazard cards), then, below it, a control-measures block for each
 * hazard currently switched on. Toggling a hazard off doesn't discard its
 * already-entered controls (it stays in `rows`, simply hidden and excluded
 * from what's saved as "applicable") — flipping it back on restores exactly
 * what was there.
 */
export function LmraHazardsAndControls({ rows, onChange, candidates, readOnly }: LmraHazardsAndControlsProps) {
  function updateRow(hazardType: LmraHazardType, patch: Partial<LmraHazardInput>) {
    if (!onChange) return;
    onChange(rows.map((row) => (row.hazardType === hazardType ? { ...row, ...patch } : row)));
  }

  function toggleCommonControl(hazardType: LmraHazardType, control: string, checked: boolean) {
    const row = rows.find((r) => r.hazardType === hazardType);
    if (!row) return;
    const next = checked ? [...new Set([...row.selectedControls, control])] : row.selectedControls.filter((c) => c !== control);
    updateRow(hazardType, { selectedControls: next });
  }

  const applicableRows = rows.filter((row) => row.isApplicable);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <SectionHeader title="Hazards Identified" description="Switch on every hazard that applies to this task." />
        <div className="grid grid-cols-1 gap-1 rounded-lg border p-1 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.hazardType} className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5">
              <Label htmlFor={`hazard-${row.hazardType}`} className="min-w-0 truncate font-normal">
                {LMRA_HAZARD_TYPE_LABELS[row.hazardType]}
              </Label>
              <Switch
                id={`hazard-${row.hazardType}`}
                checked={row.isApplicable}
                disabled={readOnly}
                onCheckedChange={(checked) => updateRow(row.hazardType, { isApplicable: checked })}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Control Measures" description={applicableRows.length === 0 ? "Switch on a hazard above to record its controls." : undefined} />
        {applicableRows.length > 0 && (
          <div className="flex flex-col gap-4">
            {applicableRows.map((row) => {
              const commonControls = LMRA_COMMON_CONTROLS[row.hazardType];
              return (
                <div key={row.hazardType} className="flex flex-col gap-3 rounded-lg border p-4">
                  <span className="font-medium">{LMRA_HAZARD_TYPE_LABELS[row.hazardType]}</span>

                  {row.hazardType === "other" && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`other-${row.hazardType}`}>Describe the hazard</Label>
                      <Textarea
                        id={`other-${row.hazardType}`}
                        rows={2}
                        disabled={readOnly}
                        value={row.otherDescription}
                        onChange={(event) => updateRow(row.hazardType, { otherDescription: event.target.value })}
                        maxLength={150}
                      />
                    </div>
                  )}

                  {commonControls.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <Label>Common controls</Label>
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {commonControls.map((control) => (
                          <div key={control} className="flex items-start gap-2">
                            <Checkbox
                              id={`control-${row.hazardType}-${control}`}
                              checked={row.selectedControls.includes(control)}
                              disabled={readOnly}
                              onCheckedChange={(checked) => toggleCommonControl(row.hazardType, control, checked === true)}
                            />
                            <Label htmlFor={`control-${row.hazardType}-${control}`} className="font-normal">
                              {control}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`additional-${row.hazardType}`}>Additional control measure</Label>
                    <Textarea
                      id={`additional-${row.hazardType}`}
                      rows={2}
                      placeholder="Optional — anything not covered above"
                      disabled={readOnly}
                      value={row.controls}
                      onChange={(event) => updateRow(row.hazardType, { controls: event.target.value })}
                      maxLength={1000}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
                    <EmployeeComboboxField
                      label="Responsible person"
                      htmlFor={`responsible-${row.hazardType}`}
                      value={row.responsiblePersonId}
                      onValueChange={(id) => updateRow(row.hazardType, { responsiblePersonId: id })}
                      options={candidates}
                      placeholder={candidates.length === 0 ? "Add Workers involved first" : "Not assigned"}
                      disabled={readOnly}
                    />

                    <div className="flex items-center gap-2 sm:pb-2">
                      <Checkbox
                        id={`confirmed-${row.hazardType}`}
                        checked={row.controlsConfirmed}
                        disabled={readOnly}
                        onCheckedChange={(checked) => updateRow(row.hazardType, { controlsConfirmed: checked === true })}
                      />
                      <Label htmlFor={`confirmed-${row.hazardType}`} className="font-normal">
                        Controls verified
                      </Label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
