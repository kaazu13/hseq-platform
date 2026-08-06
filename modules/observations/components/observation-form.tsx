"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { createObservation, updateObservation } from "@/modules/observations/actions";
import {
  OBSERVATION_CATEGORIES,
  OBSERVATION_CATEGORY_LABELS,
  OBSERVATION_RISK_LEVELS,
  OBSERVATION_RISK_LEVEL_LABELS,
  type SafetyObservation,
  type ObservationCategory,
  type ObservationRiskLevel,
} from "@/modules/observations/types";
import { EmployeeComboboxField, type EmployeeOption } from "@/components/shared/employee-combobox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ObservationFormProps = {
  companyId: string;
  projectId: string;
  projectName: string;
  candidates: EmployeeOption[];
} & ({ mode: "create"; observation?: undefined } | { mode: "edit"; observation: SafetyObservation });

/** Converts a stored timestamptz to the `datetime-local` input's expected local-time value — no timezone conversion beyond what the browser's Date object already does for display. */
function toLocalDateTimeInputValue(isoString: string | undefined): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Core-fields form — project is fixed context, never a field here, same
 * rationale as modules/lmra/components/lmra-assessment-form.tsx (chosen
 * before this form ever renders, on /observations/new's project-picker
 * step; project_id is an immutable identity column once created).
 */
export function ObservationForm({ companyId, projectId, projectName, candidates, mode, observation }: ObservationFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [observerId, setObserverId] = useState(observation?.observer_id ?? "");
  const [category, setCategory] = useState<ObservationCategory>(observation?.category ?? "positive_observation");
  const [riskLevel, setRiskLevel] = useState<ObservationRiskLevel>(observation?.risk_level ?? "low");
  const [isStopWork, setIsStopWork] = useState(observation?.is_stop_work ?? false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const input = {
      projectId,
      workArea: String(formData.get("workArea") ?? ""),
      observedAt: String(formData.get("observedAt") ?? ""),
      observerId,
      category,
      description: String(formData.get("description") ?? ""),
      immediateActionTaken: String(formData.get("immediateActionTaken") ?? ""),
      riskLevel,
      isStopWork,
    };

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createObservation(companyId, input)
          : await updateObservation(companyId, observation.id, projectId, observation.created_by, input);

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
          <Input id="workArea" name="workArea" required defaultValue={observation?.work_area} aria-invalid={Boolean(fieldError("workArea"))} />
          {fieldError("workArea") && <p className="text-sm text-destructive">{fieldError("workArea")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="observedAt">Date and time observed</Label>
          <Input
            id="observedAt"
            name="observedAt"
            type="datetime-local"
            required
            defaultValue={toLocalDateTimeInputValue(observation?.observed_at)}
            aria-invalid={Boolean(fieldError("observedAt"))}
          />
          {fieldError("observedAt") && <p className="text-sm text-destructive">{fieldError("observedAt")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <EmployeeComboboxField
            label="Observer"
            htmlFor="observerId"
            value={observerId || null}
            onValueChange={(id) => setObserverId(id ?? "")}
            options={candidates}
            placeholder="Who made this observation"
            clearable={false}
            error={fieldError("observerId")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category">Category</Label>
          <Select value={category} onValueChange={(value) => setCategory(value as ObservationCategory)}>
            <SelectTrigger id="category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OBSERVATION_CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {OBSERVATION_CATEGORY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="riskLevel">Risk level</Label>
          <Select value={riskLevel} onValueChange={(value) => setRiskLevel(value as ObservationRiskLevel)}>
            <SelectTrigger id="riskLevel" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OBSERVATION_RISK_LEVELS.map((value) => (
                <SelectItem key={value} value={value}>
                  {OBSERVATION_RISK_LEVEL_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 self-end pb-2">
          <Checkbox id="isStopWork" checked={isStopWork} onCheckedChange={(checked) => setIsStopWork(checked === true)} />
          <Label htmlFor="isStopWork" className="font-normal">
            Work was stopped because of this
          </Label>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={3} required defaultValue={observation?.description} aria-invalid={Boolean(fieldError("description"))} />
          {fieldError("description") && <p className="text-sm text-destructive">{fieldError("description")}</p>}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="immediateActionTaken">Immediate action taken (optional)</Label>
          <Textarea id="immediateActionTaken" name="immediateActionTaken" rows={2} defaultValue={observation?.immediate_action_taken ?? ""} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : null}
          {isPending ? "Saving…" : mode === "create" ? "Create observation" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
