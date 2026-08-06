"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { createLmra, updateLmra } from "@/modules/lmra/actions";
import type { LmraAssessment } from "@/modules/lmra/types";
import { EmployeeComboboxField, type EmployeeOption } from "@/components/shared/employee-combobox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type LmraAssessmentFormProps = {
  companyId: string;
  projectId: string;
  projectName: string;
  candidates: EmployeeOption[];
} & ({ mode: "create"; assessment?: undefined } | { mode: "edit"; assessment: LmraAssessment });

/**
 * Core-fields form — project is fixed context, never a field here (it's
 * chosen before this form is ever shown, on /lmra/new's project-picker
 * step, and it's an immutable identity column once created —
 * validate_lmra_assessment_update() in the migration rejects changing it).
 * Same plain-`onSubmit`-with-`preventDefault` shape as
 * modules/projects/components/project-form.tsx, for the same React 19
 * form-reset reason.
 */
export function LmraAssessmentForm({ companyId, projectId, projectName, candidates, mode, assessment }: LmraAssessmentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [foremanId, setForemanId] = useState(assessment?.responsible_foreman_id ?? "");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const input = {
      projectId,
      workArea: String(formData.get("workArea") ?? ""),
      workActivity: String(formData.get("workActivity") ?? ""),
      workDate: String(formData.get("workDate") ?? ""),
      shift: String(formData.get("shift") ?? ""),
      responsibleForemanId: foremanId,
      notes: String(formData.get("notes") ?? ""),
    };

    startTransition(async () => {
      const result = mode === "create" ? await createLmra(companyId, input) : await updateLmra(companyId, assessment.id, input);

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

      <div className="flex flex-col gap-1.5">
        <Label>Project</Label>
        <p className="text-sm text-muted-foreground">{projectName}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workArea">Work area</Label>
          <Input id="workArea" name="workArea" required defaultValue={assessment?.work_area} aria-invalid={Boolean(fieldError("workArea"))} />
          {fieldError("workArea") && <p className="text-sm text-destructive">{fieldError("workArea")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workActivity">Work activity</Label>
          <Input id="workActivity" name="workActivity" required defaultValue={assessment?.work_activity} aria-invalid={Boolean(fieldError("workActivity"))} />
          {fieldError("workActivity") && <p className="text-sm text-destructive">{fieldError("workActivity")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workDate">Date</Label>
          <Input id="workDate" name="workDate" type="date" required defaultValue={assessment?.work_date ?? ""} aria-invalid={Boolean(fieldError("workDate"))} />
          {fieldError("workDate") && <p className="text-sm text-destructive">{fieldError("workDate")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="shift">Shift</Label>
          <Input id="shift" name="shift" required placeholder="e.g. Day, Night" defaultValue={assessment?.shift ?? ""} aria-invalid={Boolean(fieldError("shift"))} />
          {fieldError("shift") && <p className="text-sm text-destructive">{fieldError("shift")}</p>}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <EmployeeComboboxField
            label="Responsible foreman"
            htmlFor="responsibleForemanId"
            value={foremanId || null}
            onValueChange={(id) => setForemanId(id ?? "")}
            options={candidates}
            placeholder="Choose the responsible foreman"
            clearable={false}
            error={fieldError("responsibleForemanId")}
          />
          {candidates.length === 0 && (
            <p className="text-sm text-muted-foreground">No one is currently rostered onto this project — assign workers on the project&apos;s Assignments tab first.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea id="notes" name="notes" rows={3} defaultValue={assessment?.notes ?? ""} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : null}
          {isPending ? "Saving…" : mode === "create" ? "Create LMRA" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
