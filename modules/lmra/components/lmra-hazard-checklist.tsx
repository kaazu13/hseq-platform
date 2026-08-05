"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { updateLmraHazards } from "@/modules/lmra/actions";
import { LMRA_HAZARD_TYPES, LMRA_HAZARD_TYPE_LABELS, type LmraHazard, type LmraHazardInput } from "@/modules/lmra/types";
import { EmployeeComboboxField, type EmployeeOption } from "@/components/shared/employee-combobox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type LmraHazardChecklistProps = {
  organizationId: string;
  lmraId: string;
  projectId: string;
  hazards: LmraHazard[];
  candidates: EmployeeOption[];
  readOnly: boolean;
};

function toInputs(hazards: LmraHazard[]): LmraHazardInput[] {
  const byType = new Map(hazards.map((h) => [h.hazard_type, h]));
  return LMRA_HAZARD_TYPES.map((hazardType) => {
    const row = byType.get(hazardType);
    return {
      hazardType,
      isApplicable: row?.is_applicable ?? true,
      controls: row?.controls ?? "",
      responsiblePersonId: row?.responsible_person_id ?? null,
      controlsConfirmed: row?.controls_confirmed ?? false,
      otherDescription: row?.other_description ?? "",
    };
  });
}

/**
 * The fixed 12-hazard scaffolding checklist — one row per
 * LMRA_HAZARD_TYPES entry, always in that order (matches
 * create_initial_lmra_hazards()'s seed order in the migration). Saved as one
 * bulk call (save_lmra_hazards RPC via updateLmraHazards), not per-row, so a
 * half-edited checklist is never partially persisted.
 */
export function LmraHazardChecklist({ organizationId, lmraId, projectId, hazards, candidates, readOnly }: LmraHazardChecklistProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [rows, setRows] = useState<LmraHazardInput[]>(() => toInputs(hazards));

  function updateRow(index: number, patch: Partial<LmraHazardInput>) {
    setRows((previous) => previous.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function handleSave() {
    setFormError(null);
    startTransition(async () => {
      const result = await updateLmraHazards(organizationId, lmraId, projectId, rows);
      if (!result.ok) {
        setFormError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col divide-y rounded-lg border">
        {rows.map((row, index) => (
          <div key={row.hazardType} className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium">{LMRA_HAZARD_TYPE_LABELS[row.hazardType]}</span>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`applicable-${row.hazardType}`}
                  checked={row.isApplicable}
                  disabled={readOnly}
                  onCheckedChange={(checked) => updateRow(index, { isApplicable: checked === true })}
                />
                <Label htmlFor={`applicable-${row.hazardType}`} className="font-normal">
                  Applicable
                </Label>
              </div>
            </div>

            {row.isApplicable && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor={`controls-${row.hazardType}`}>Controls</Label>
                  <Textarea
                    id={`controls-${row.hazardType}`}
                    rows={2}
                    disabled={readOnly}
                    value={row.controls}
                    onChange={(event) => updateRow(index, { controls: event.target.value })}
                  />
                </div>

                {row.hazardType === "other" && (
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label htmlFor={`other-${row.hazardType}`}>Describe the hazard</Label>
                    <Textarea
                      id={`other-${row.hazardType}`}
                      rows={2}
                      disabled={readOnly}
                      value={row.otherDescription}
                      onChange={(event) => updateRow(index, { otherDescription: event.target.value })}
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <EmployeeComboboxField
                    label="Responsible person"
                    htmlFor={`responsible-${row.hazardType}`}
                    value={row.responsiblePersonId}
                    onValueChange={(id) => updateRow(index, { responsiblePersonId: id })}
                    options={candidates}
                    placeholder="Not assigned"
                    disabled={readOnly}
                  />
                </div>

                <div className="flex items-center gap-2 self-end">
                  <Checkbox
                    id={`confirmed-${row.hazardType}`}
                    checked={row.controlsConfirmed}
                    disabled={readOnly}
                    onCheckedChange={(checked) => updateRow(index, { controlsConfirmed: checked === true })}
                  />
                  <Label htmlFor={`confirmed-${row.hazardType}`} className="font-normal">
                    Controls confirmed in place
                  </Label>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {!readOnly && (
        <div>
          <Button type="button" onClick={handleSave} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : null}
            {isPending ? "Saving…" : "Save hazard checklist"}
          </Button>
        </div>
      )}
    </div>
  );
}
