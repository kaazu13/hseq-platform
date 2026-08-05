"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { createInspection } from "@/modules/scaffolds/actions";
import { SCAFFOLD_INSPECTION_REASONS, SCAFFOLD_INSPECTION_REASON_LABELS, type ScaffoldInspectionReason, type ScaffoldInspection } from "@/modules/scaffolds/types";
import { EmployeeComboboxField, type EmployeeOption } from "@/components/shared/employee-combobox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type InspectionFormProps = {
  organizationId: string;
  scaffoldId: string;
  projectId: string;
  candidates: EmployeeOption[];
  /** Prior inspections for this scaffold — the picker for previousInspectionId, required when the reason is "re-inspection following defects." */
  priorInspections: ScaffoldInspection[];
};

/** Starts a new inspection — core fields only; the checklist is created automatically (24 fixed rows) and edited on the next page. */
export function InspectionForm({ organizationId, scaffoldId, projectId, candidates, priorInspections }: InspectionFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [inspectionReason, setInspectionReason] = useState<ScaffoldInspectionReason>("routine_inspection");
  const [inspectorId, setInspectorId] = useState("");
  const [previousInspectionId, setPreviousInspectionId] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const input = {
      inspectionReason,
      previousInspectionId,
      inspectorId,
      inspectedAt: String(formData.get("inspectedAt") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    };

    startTransition(async () => {
      const result = await createInspection(organizationId, scaffoldId, projectId, input);
      if (!result.ok) {
        setFormError(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
      }
    });
  }

  function fieldError(name: string) {
    return fieldErrors[name];
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inspectionReason">Inspection reason</Label>
          <Select value={inspectionReason} onValueChange={(value) => setInspectionReason(value as ScaffoldInspectionReason)}>
            <SelectTrigger id="inspectionReason" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCAFFOLD_INSPECTION_REASONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {SCAFFOLD_INSPECTION_REASON_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <EmployeeComboboxField
          label="Inspector"
          htmlFor="inspectorId"
          value={inspectorId || null}
          onValueChange={(id) => setInspectorId(id ?? "")}
          options={candidates}
          placeholder="Search by name or employee number…"
          emptyMessage="No eligible inspectors found for this project."
          clearable={false}
          error={fieldError("inspectorId")}
        />

        {(inspectionReason === "reinspection_following_defects" || priorInspections.length > 0) && (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="previousInspectionId">
              Previous inspection {inspectionReason === "reinspection_following_defects" ? "" : "(optional)"}
            </Label>
            <Select value={previousInspectionId} onValueChange={(value) => setPreviousInspectionId(value ?? "")}>
              <SelectTrigger id="previousInspectionId" className="w-full" aria-invalid={Boolean(fieldError("previousInspectionId"))}>
                <SelectValue placeholder="Reference the earlier inspection" />
              </SelectTrigger>
              <SelectContent>
                {priorInspections.map((inspection) => (
                  <SelectItem key={inspection.id} value={inspection.id}>
                    {new Date(inspection.inspected_at).toLocaleDateString()} — {inspection.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError("previousInspectionId") && <p className="text-sm text-destructive">{fieldError("previousInspectionId")}</p>}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inspectedAt">Date and time of inspection</Label>
          <Input id="inspectedAt" name="inspectedAt" type="datetime-local" required defaultValue={new Date().toISOString().slice(0, 16)} aria-invalid={Boolean(fieldError("inspectedAt"))} />
          {fieldError("inspectedAt") && <p className="text-sm text-destructive">{fieldError("inspectedAt")}</p>}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea id="notes" name="notes" rows={2} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : null}
          {isPending ? "Starting…" : "Start inspection"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
