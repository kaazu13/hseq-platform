"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Loader2, Users } from "lucide-react";
import { createScaffold, updateScaffold } from "@/modules/scaffolds/actions";
import { SCAFFOLD_TYPES, SCAFFOLD_TYPE_LABELS, SCAFFOLD_TEAM_MIN_SIZE, SCAFFOLD_TEAM_MAX_SIZE, type ScaffoldType, type ScaffoldDetail } from "@/modules/scaffolds/types";
import { EmployeeComboboxField, type EmployeeOption } from "@/components/shared/employee-combobox";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";

type ScaffoldFormProps = {
  organizationId: string;
  projectId: string;
  projectName: string;
  foremanOptions: EmployeeOption[];
  teamMemberOptions: EmployeeOption[];
} & ({ mode: "create"; scaffold?: undefined } | { mode: "edit"; scaffold: ScaffoldDetail });

const TEAM_SIZE_OPTIONS = Array.from({ length: SCAFFOLD_TEAM_MAX_SIZE - SCAFFOLD_TEAM_MIN_SIZE + 1 }, (_, i) => i + SCAFFOLD_TEAM_MIN_SIZE);

/**
 * Combined create/edit scaffold-registration form — see this milestone's
 * implementation report for the full "before" state. Sectioned per Part 6
 * ("Scaffold details" / "Dimensions and loading" / "Responsible team" /
 * "Dates and status") rather than one continuous block. The Responsible
 * Foreman and every team-member slot use the shared EmployeeCombobox
 * (components/shared/employee-combobox.tsx) — never a plain `<Select>`,
 * which is what caused the raw-UUID-after-selection bug this milestone
 * fixes (see that component's header comment for the root cause).
 */
export function ScaffoldForm({ organizationId, projectId, projectName, foremanOptions, teamMemberOptions, mode, scaffold }: ScaffoldFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [scaffoldType, setScaffoldType] = useState<ScaffoldType>(scaffold?.scaffold_type ?? "independent");
  const [responsibleForemanId, setResponsibleForemanId] = useState(scaffold?.responsible_foreman_id ?? "");

  const initialTeamIds = mode === "edit" ? scaffold.teamMembers.map((member) => member.employeeId) : [];
  const [teamSize, setTeamSize] = useState(initialTeamIds.length || SCAFFOLD_TEAM_MIN_SIZE);
  const [teamMemberIds, setTeamMemberIds] = useState<(string | null)[]>(() => {
    const slots = [...initialTeamIds] as (string | null)[];
    while (slots.length < teamSize) slots.push(null);
    return slots;
  });
  const [pendingTeamSize, setPendingTeamSize] = useState<number | null>(null);

  function applyTeamSize(newSize: number) {
    setTeamMemberIds((prev) => {
      const next = prev.slice(0, newSize);
      while (next.length < newSize) next.push(null);
      return next;
    });
    setTeamSize(newSize);
  }

  function handleTeamSizeChange(value: string | null) {
    if (!value) return;
    const newSize = Number(value);
    if (newSize < teamMemberIds.length) {
      const removedNames = teamMemberIds
        .slice(newSize)
        .filter((id): id is string => Boolean(id))
        .map((id) => teamMemberOptions.find((option) => option.value === id)?.label ?? "Unknown");
      if (removedNames.length > 0) {
        setPendingTeamSize(newSize);
        return;
      }
    }
    applyTeamSize(newSize);
  }

  function confirmReduceTeamSize() {
    if (pendingTeamSize !== null) applyTeamSize(pendingTeamSize);
    setPendingTeamSize(null);
  }

  function setSlot(index: number, employeeId: string | null) {
    setTeamMemberIds((prev) => prev.map((id, i) => (i === index ? employeeId : id)));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const filledSlots = teamMemberIds.filter((id): id is string => Boolean(id));
    if (filledSlots.length < teamSize) {
      setFormError(`Select all ${teamSize} scaffold team members before saving — ${teamSize - filledSlots.length} slot(s) still empty.`);
      return;
    }
    if (!responsibleForemanId) {
      setFormError("Choose the Responsible Foreman.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const input = {
      projectId,
      tagNumber: String(formData.get("tagNumber") ?? ""),
      workArea: String(formData.get("workArea") ?? ""),
      structureReference: String(formData.get("structureReference") ?? ""),
      scaffoldType,
      intendedUse: String(formData.get("intendedUse") ?? ""),
      maxLoadClass: String(formData.get("maxLoadClass") ?? ""),
      // Raw strings, passed through untouched — the zod schema is the
      // ONLY place that coerces these to numbers, both client- and
      // server-side. Pre-converting here was the root cause of "Invalid
      // input: expected string, received number" (see
      // modules/scaffolds/validation.ts's header comment).
      heightMetres: String(formData.get("heightMetres") ?? ""),
      lengthMetres: String(formData.get("lengthMetres") ?? ""),
      widthMetres: String(formData.get("widthMetres") ?? ""),
      erectedBy: String(formData.get("erectedBy") ?? ""),
      responsibleForemanId,
      erectedAt: String(formData.get("erectedAt") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      teamSize: String(teamSize),
      teamMemberIds: filledSlots,
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

  const usedElsewhere = (index: number) => [responsibleForemanId, ...teamMemberIds.filter((_, i) => i !== index)].filter((id): id is string => Boolean(id));

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8" noValidate>
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4">
        <SectionHeader title="Scaffold details" />
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
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader title="Dimensions and loading" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="heightMetres">Scaffold height, metres (optional)</Label>
            <Input id="heightMetres" name="heightMetres" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={scaffold?.height_metres ?? ""} aria-invalid={Boolean(fieldError("heightMetres"))} />
            {fieldError("heightMetres") && <p className="text-sm text-destructive">{fieldError("heightMetres")}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lengthMetres">Scaffold length, metres (optional)</Label>
            <Input id="lengthMetres" name="lengthMetres" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={scaffold?.length_metres ?? ""} aria-invalid={Boolean(fieldError("lengthMetres"))} />
            {fieldError("lengthMetres") && <p className="text-sm text-destructive">{fieldError("lengthMetres")}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="widthMetres">Scaffold width, metres (optional)</Label>
            <Input id="widthMetres" name="widthMetres" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={scaffold?.width_metres ?? ""} aria-invalid={Boolean(fieldError("widthMetres"))} />
            {fieldError("widthMetres") && <p className="text-sm text-destructive">{fieldError("widthMetres")}</p>}
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-3">
            <Label htmlFor="maxLoadClass">Maximum permitted load / load class</Label>
            <Input id="maxLoadClass" name="maxLoadClass" required placeholder="e.g. Light Duty (2.0 kN/m2)" defaultValue={scaffold?.max_load_class} aria-invalid={Boolean(fieldError("maxLoadClass"))} />
            {fieldError("maxLoadClass") && <p className="text-sm text-destructive">{fieldError("maxLoadClass")}</p>}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader title="Responsible team" />

        {foremanOptions.length === 0 ? (
          <EmptyState icon={Users} title="No active Foremen are assigned to this project." description="A Foreman must hold the Foreman role and an active Foreman team assignment on this project before they can be selected here." action={<Link href="/admin/members" className="text-sm font-medium text-primary underline-offset-2 hover:underline">Manage project assignments →</Link>} />
        ) : (
          <EmployeeComboboxField
            label="Responsible Foreman"
            htmlFor="responsibleForemanId"
            value={responsibleForemanId || null}
            onValueChange={(id) => setResponsibleForemanId(id ?? "")}
            options={foremanOptions}
            placeholder="Search Foreman by name or employee number…"
            emptyMessage="No active Foremen are assigned to this project."
            excludeIds={teamMemberIds.filter((id): id is string => Boolean(id))}
            clearable={false}
            error={fieldError("responsibleForemanId")}
          />
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="teamSize">Scaffold team size</Label>
          <Select value={String(teamSize)} onValueChange={handleTeamSizeChange}>
            <SelectTrigger id="teamSize" className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEAM_SIZE_OPTIONS.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value} {value === 1 ? "team member" : "team members"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Ordinary scaffold team members only — the Responsible Foreman is counted separately. Total people connected to this scaffold: {teamSize + 1}.
          </p>
        </div>

        {teamMemberOptions.length === 0 ? (
          <EmptyState icon={Users} title="No eligible team members on this project" description="Only active employees assigned to this project, excluding Foreman/HSE/Project Manager/Inspector/Company Administrator roles, can be added." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {teamMemberIds.map((id, index) => (
              <EmployeeComboboxField
                key={index}
                label={`Team member ${index + 1}`}
                htmlFor={`teamMember-${index}`}
                value={id}
                onValueChange={(nextId) => setSlot(index, nextId)}
                options={teamMemberOptions}
                placeholder="Search by name or employee number…"
                emptyMessage="No eligible team members on this project."
                excludeIds={usedElsewhere(index)}
              />
            ))}
          </div>
        )}
        {fieldError("teamMemberIds") && <p className="text-sm text-destructive">{fieldError("teamMemberIds")}</p>}
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader title="Dates and status" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="erectedBy">Erected by (subcontractor crew, if applicable — optional)</Label>
            <Input id="erectedBy" name="erectedBy" defaultValue={scaffold?.erected_by ?? ""} />
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

      <ConfirmDialog
        open={pendingTeamSize !== null}
        onOpenChange={(open) => !open && setPendingTeamSize(null)}
        title="Reduce scaffold team size?"
        description={
          pendingTeamSize !== null
            ? `Reducing to ${pendingTeamSize} will remove: ${teamMemberIds
                .slice(pendingTeamSize)
                .filter((id): id is string => Boolean(id))
                .map((id) => teamMemberOptions.find((option) => option.value === id)?.label ?? "Unknown")
                .join(", ")}. This only removes them from this scaffold's team — it does not affect their project assignment.`
            : undefined
        }
        confirmLabel="Reduce team size"
        onConfirm={confirmReduceTeamSize}
      />
    </form>
  );
}
