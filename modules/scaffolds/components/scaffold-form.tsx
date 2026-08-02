"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { createScaffold, updateScaffold } from "@/modules/scaffolds/actions";
import { SCAFFOLD_TYPES, SCAFFOLD_TYPE_LABELS, type Scaffold, type ScaffoldType, type BasicEmployee } from "@/modules/scaffolds/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ScaffoldFormProps = {
  organizationId: string;
  projectId: string;
  projectName: string;
  candidates: BasicEmployee[];
} & ({ mode: "create"; scaffold?: undefined } | { mode: "edit"; scaffold: Scaffold });

/** Core-fields form — project is fixed context, never a field here, same rationale as every other module's create/edit form this session (chosen before this form ever renders; project_id is an immutable identity column once created). */
export function ScaffoldForm({ organizationId, projectId, projectName, candidates, mode, scaffold }: ScaffoldFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [scaffoldType, setScaffoldType] = useState<ScaffoldType>(scaffold?.scaffold_type ?? "independent");
  const [responsibleForemanId, setResponsibleForemanId] = useState(scaffold?.responsible_foreman_id ?? "");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const rawMaxHeightMeters = String(formData.get("maxHeightMeters") ?? "").trim();
    const input = {
      projectId,
      tagNumber: String(formData.get("tagNumber") ?? ""),
      workArea: String(formData.get("workArea") ?? ""),
      structureReference: String(formData.get("structureReference") ?? ""),
      scaffoldType,
      intendedUse: String(formData.get("intendedUse") ?? ""),
      maxLoadClass: String(formData.get("maxLoadClass") ?? ""),
      // ScaffoldFormInput expects the already-coerced number|undefined
      // shape (the zod schema's output type) — the server re-validates
      // regardless, but the client-side object passed to the action must
      // already match that type.
      maxHeightMeters: rawMaxHeightMeters === "" ? undefined : Number(rawMaxHeightMeters),
      erectedBy: String(formData.get("erectedBy") ?? ""),
      responsibleForemanId,
      erectedAt: String(formData.get("erectedAt") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    };

    startTransition(async () => {
      const result = mode === "create" ? await createScaffold(organizationId, input) : await updateScaffold(organizationId, scaffold.id, projectId, input);

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
          <Label htmlFor="tagNumber">Scaffold tag / ID number</Label>
          <Input id="tagNumber" name="tagNumber" required defaultValue={scaffold?.tag_number} aria-invalid={Boolean(fieldError("tagNumber"))} />
          {fieldError("tagNumber") && <p className="text-sm text-destructive">{fieldError("tagNumber")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workArea">Work area / location</Label>
          <Input id="workArea" name="workArea" required defaultValue={scaffold?.work_area} aria-invalid={Boolean(fieldError("workArea"))} />
          {fieldError("workArea") && <p className="text-sm text-destructive">{fieldError("workArea")}</p>}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="structureReference">Structure, equipment, or unit reference (optional)</Label>
          <Input id="structureReference" name="structureReference" defaultValue={scaffold?.structure_reference ?? ""} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scaffoldType">Scaffold type</Label>
          <Select value={scaffoldType} onValueChange={(value) => setScaffoldType(value as ScaffoldType)}>
            <SelectTrigger id="scaffoldType" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCAFFOLD_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {SCAFFOLD_TYPE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="intendedUse">Intended use</Label>
          <Input id="intendedUse" name="intendedUse" required defaultValue={scaffold?.intended_use} aria-invalid={Boolean(fieldError("intendedUse"))} />
          {fieldError("intendedUse") && <p className="text-sm text-destructive">{fieldError("intendedUse")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="maxLoadClass">Maximum permitted load / load class</Label>
          <Input id="maxLoadClass" name="maxLoadClass" required placeholder="e.g. Light Duty (2.0 kN/m2)" defaultValue={scaffold?.max_load_class} aria-invalid={Boolean(fieldError("maxLoadClass"))} />
          {fieldError("maxLoadClass") && <p className="text-sm text-destructive">{fieldError("maxLoadClass")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="maxHeightMeters">Maximum height, metres (optional)</Label>
          <Input id="maxHeightMeters" name="maxHeightMeters" type="number" step="0.1" min="0" defaultValue={scaffold?.max_height_meters ?? ""} aria-invalid={Boolean(fieldError("maxHeightMeters"))} />
          {fieldError("maxHeightMeters") && <p className="text-sm text-destructive">{fieldError("maxHeightMeters")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="erectedBy">Erected by / responsible scaffold team (optional)</Label>
          <Input id="erectedBy" name="erectedBy" defaultValue={scaffold?.erected_by ?? ""} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="responsibleForemanId">Responsible foreman</Label>
          <Select value={responsibleForemanId} onValueChange={(value) => setResponsibleForemanId(value ?? "")}>
            <SelectTrigger id="responsibleForemanId" className="w-full" aria-invalid={Boolean(fieldError("responsibleForemanId"))}>
              <SelectValue placeholder="Choose the responsible foreman" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.first_name} {candidate.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldError("responsibleForemanId") && <p className="text-sm text-destructive">{fieldError("responsibleForemanId")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="erectedAt">Erection date (optional)</Label>
          <Input id="erectedAt" name="erectedAt" type="date" defaultValue={scaffold?.erected_at ?? ""} aria-invalid={Boolean(fieldError("erectedAt"))} />
          {fieldError("erectedAt") && <p className="text-sm text-destructive">{fieldError("erectedAt")}</p>}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea id="notes" name="notes" rows={3} defaultValue={scaffold?.notes ?? ""} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : null}
          {isPending ? "Saving…" : mode === "create" ? "Register scaffold" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
