"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2, Lock } from "lucide-react";
import { createInspection } from "@/modules/scaffolds/actions";
import { SCAFFOLD_INSPECTION_REASONS, SCAFFOLD_INSPECTION_REASON_LABELS, SCAFFOLD_INSPECTION_STATUS_LABELS, type ScaffoldInspectionReason, type ScaffoldInspection } from "@/modules/scaffolds/types";
import { EmployeeComboboxField, type EmployeeOption } from "@/components/shared/employee-combobox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type InspectionFormProps = {
  companyId: string;
  scaffoldId: string;
  projectId: string;
  /** Part 7/8 — true for Inspector/Foreman-tier callers: the Inspector field is always themselves, no exceptions, never a picker. Real enforcement is the DB trigger (assert_valid_inspection_inspector) — this only controls what's rendered. */
  mustSelfLock: boolean;
  /** The caller's own name, shown in the locked state. Null if the caller (an admin/HSE-tier role with no linked employee record, e.g. a pure platform_super_admin) has no "self" to default to — they must pick an eligible alternate. */
  selfName: string | null;
  selfEmployeeId: string | null;
  /** Part 8 — eligible alternates (company role inspector or foreman, active, project-assigned) for admin/HSE-tier callers. Ignored when mustSelfLock is true. */
  eligibleAlternates: EmployeeOption[];
  /** Prior inspections for this scaffold — the picker for previousInspectionId, required when the reason is "re-inspection following defects." */
  priorInspections: ScaffoldInspection[];
};

/** Starts a new inspection — core fields only; the checklist is created automatically (24 fixed rows) and edited on the next page. */
export function InspectionForm({ companyId, scaffoldId, projectId, mustSelfLock, selfName, selfEmployeeId, eligibleAlternates, priorInspections }: InspectionFormProps) {
  const t = useTranslations("ScaffoldInspection");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [inspectionReason, setInspectionReason] = useState<ScaffoldInspectionReason>("routine_inspection");
  const [inspectorId, setInspectorId] = useState(selfEmployeeId ?? "");
  const [previousInspectionId, setPreviousInspectionId] = useState("");

  // Part 8 — the picker's own candidate list always includes "myself"
  // (when the caller has a linked employee record) alongside the eligible
  // alternates, so an admin/HSE-tier caller can pick themselves back after
  // exploring other options, not just on first render.
  const pickerOptions: EmployeeOption[] =
    selfEmployeeId && selfName && !eligibleAlternates.some((option) => option.value === selfEmployeeId)
      ? [{ value: selfEmployeeId, label: selfName, employeeNumber: null, roleLabel: t("yourself") }, ...eligibleAlternates]
      : eligibleAlternates;

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
      const result = await createInspection(companyId, scaffoldId, projectId, input);
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

        {mustSelfLock ? (
          <div className="flex flex-col gap-1.5">
            <Label>{t("inspector")}</Label>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <Lock className="size-3.5 text-muted-foreground" />
              <span>{selfName ?? t("yourself")}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("inspectorLockedToYou")}</p>
          </div>
        ) : (
          <EmployeeComboboxField
            label={t("inspector")}
            htmlFor="inspectorId"
            value={inspectorId || null}
            onValueChange={(id) => setInspectorId(id ?? "")}
            options={pickerOptions}
            placeholder={t("inspectorSearchPlaceholder")}
            emptyMessage={t("noEligibleInspectors")}
            clearable={false}
            error={fieldError("inspectorId")}
          />
        )}

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
                    {new Date(inspection.inspected_at).toLocaleDateString()} — {SCAFFOLD_INSPECTION_STATUS_LABELS[inspection.status]}
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
