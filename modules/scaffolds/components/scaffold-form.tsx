"use client";

import { useState, useTransition, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Lock, Users } from "lucide-react";
import { createScaffold, updateScaffold } from "@/modules/scaffolds/actions";
import { listEligibleErectionTeamsAction } from "@/modules/scaffolds/team-actions";
import { SCAFFOLD_TYPES, SCAFFOLD_TYPE_LABELS, type ScaffoldType, type ScaffoldDetail } from "@/modules/scaffolds/types";
import { EmployeeComboboxField, type EmployeeOption } from "@/components/shared/employee-combobox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";

type EligibleErectionTeam = { id: string; name: string; shift: string | null; workArea: string | null; foremanName: string | null; workerCount: number };

type ScaffoldFormProps = {
  companyId: string;
  projectId: string;
  projectName: string;
  foremanOptions: EmployeeOption[];
  /** V2: locks the Responsible Foreman field to the caller's own name (mustSelfLockResponsibleForeman()'s result) — a Foreman relying only on the self-only creation path can never pick anyone else, even by tampering with the client. Ignored in edit mode (editing is unchanged, hseq_manager/hse_officer/inspector only). */
  selfLockedForemanId?: string | null;
  today: string;
} & ({ mode: "create"; scaffold?: undefined } | { mode: "edit"; scaffold: ScaffoldDetail });

/**
 * Combined create/edit scaffold-registration form — see the audit's
 * Scaffold Register V2 implementation report for the "before" state.
 * V2 changes (Part 4 of the post-audit implementation package): the old
 * "Scaffold team size" + "Team member 1/2/3…" manual roster is replaced
 * with "Teams assigned to scaffold erection" — one or more real Today's
 * Teams, refetched whenever the erection date changes (never a stale
 * list for a different date). A Foreman relying only on the self-only
 * creation path sees the Responsible Foreman field locked to their own
 * name (server-enforced regardless — see validate_scaffold_insert()) and
 * only their OWN Today's Teams offered as erection-team choices.
 */
export function ScaffoldForm({ companyId, projectId, projectName, foremanOptions, selfLockedForemanId, today, mode, scaffold }: ScaffoldFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [scaffoldType, setScaffoldType] = useState<ScaffoldType>(scaffold?.scaffold_type ?? "independent");
  const [responsibleForemanId, setResponsibleForemanId] = useState(scaffold?.responsible_foreman_id ?? selfLockedForemanId ?? "");
  const [erectedAt, setErectedAt] = useState(scaffold?.erected_at ?? today);

  // `eligibleTeams === null` IS the loading state — deliberately no
  // separate `loading` boolean set synchronously inside the effect body
  // (react-hooks/set-state-in-effect flags that as a cascading-render
  // risk; see the identical convention in
  // modules/lmra/components/lmra-add-daily-team-dialog.tsx). Every
  // setState call below happens inside the fetch's .then()/.catch(),
  // never synchronously in the effect body itself.
  const [eligibleTeams, setEligibleTeams] = useState<EligibleErectionTeam[] | null>(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(mode === "edit" ? scaffold.erectionTeams.map((t) => t.dailyTeamId) : []);

  // Refetch eligible teams whenever the erection date changes — never a
  // stale list for a date the caller has since moved away from. Also
  // clears/revalidates any selected team that no longer appears in the
  // refreshed list (e.g. the date changed to one that team didn't work).
  useEffect(() => {
    if (!erectedAt) return;
    let cancelled = false;
    listEligibleErectionTeamsAction(companyId, projectId, erectedAt)
      .then((teams) => {
        if (cancelled) return;
        setEligibleTeams(teams);
        setSelectedTeamIds((prev) => prev.filter((id) => teams.some((t) => t.id === id)));
      })
      .catch(() => {
        if (!cancelled) setEligibleTeams([]);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, projectId, erectedAt]);

  function toggleTeam(teamId: string, checked: boolean) {
    setSelectedTeamIds((prev) => (checked ? [...prev, teamId] : prev.filter((id) => id !== teamId)));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const effectiveForemanId = selfLockedForemanId ?? responsibleForemanId;
    if (!effectiveForemanId) {
      setFormError("Choose the Responsible Foreman.");
      return;
    }
    if (selectedTeamIds.length === 0) {
      setFormError("Select at least one Today's Team that erected this scaffold.");
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
      // server-side (see modules/scaffolds/validation.ts's header comment).
      heightMetres: String(formData.get("heightMetres") ?? ""),
      lengthMetres: String(formData.get("lengthMetres") ?? ""),
      widthMetres: String(formData.get("widthMetres") ?? ""),
      erectedBy: String(formData.get("erectedBy") ?? ""),
      responsibleForemanId: effectiveForemanId,
      erectedAt,
      notes: String(formData.get("notes") ?? ""),
      erectionTeamIds: selectedTeamIds,
    };

    startTransition(async () => {
      const result = mode === "create" ? await createScaffold(companyId, input) : await updateScaffold(companyId, scaffold.id, projectId, input);

      if (!result.ok) {
        setFormError(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
      }
    });
  }

  function fieldError(name: string) {
    return fieldErrors[name];
  }

  const selfLockedForemanOption = selfLockedForemanId ? foremanOptions.find((option) => option.value === selfLockedForemanId) : null;

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
        <SectionHeader title="Responsible Foreman" />

        {selfLockedForemanId ? (
          <div className="flex flex-col gap-1.5">
            <Label>Responsible Foreman</Label>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <Lock className="size-3.5 text-muted-foreground" />
              <span>{selfLockedForemanOption?.label ?? "You"} (yourself)</span>
            </div>
            <p className="text-xs text-muted-foreground">As a Foreman, you can only register a scaffold with yourself as the Responsible Foreman.</p>
          </div>
        ) : foremanOptions.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No active Foremen are assigned to this project."
            description="A Foreman must hold the Foreman role and an active Foreman team assignment on this project before they can be selected here."
          />
        ) : (
          <EmployeeComboboxField
            label="Responsible Foreman"
            htmlFor="responsibleForemanId"
            value={responsibleForemanId || null}
            onValueChange={(id) => setResponsibleForemanId(id ?? "")}
            options={foremanOptions}
            placeholder="Search Foreman by name or employee number…"
            emptyMessage="No active Foremen are assigned to this project."
            clearable={false}
            error={fieldError("responsibleForemanId")}
          />
        )}
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader title="Dates" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="erectedAt">Erection date</Label>
            <Input id="erectedAt" name="erectedAt" type="date" required value={erectedAt} onChange={(event) => setErectedAt(event.target.value)} aria-invalid={Boolean(fieldError("erectedAt"))} />
            {fieldError("erectedAt") && <p className="text-sm text-destructive">{fieldError("erectedAt")}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="erectedBy">Erected by (subcontractor crew, if applicable — optional)</Label>
            <Input id="erectedBy" name="erectedBy" defaultValue={scaffold?.erected_by ?? ""} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader title="Teams assigned to scaffold erection" />
        <p className="text-sm text-muted-foreground">Select one or more of that date&apos;s Today&apos;s Teams. Changing the erection date refreshes which teams are available.</p>

        {mode === "edit" && scaffold.teamMembers.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-md border bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase">Legacy team roster (preserved as recorded)</p>
            <p className="text-sm text-muted-foreground">
              {scaffold.teamMembers.map((member) => `${member.firstName} ${member.lastName}`).join(", ")}
            </p>
            <p className="text-xs text-muted-foreground">This scaffold was registered before Today&apos;s Team linking existed — its original roster is kept exactly as recorded and is no longer editable here. Use the picker below to additionally link real Today&apos;s Teams going forward.</p>
          </div>
        )}

        {eligibleTeams === null ? (
          <p className="text-sm text-muted-foreground">Loading teams for {erectedAt}…</p>
        ) : eligibleTeams.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No Today's Teams found for this date"
            description={selfLockedForemanId ? "You have no Today's Team on this date for this project — create one first, then come back to register the scaffold." : "No Today's Teams exist for this project on this date yet."}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {eligibleTeams.map((team) => (
              <label key={team.id} className="flex items-center gap-3 rounded-md border p-3 text-sm hover:bg-muted/40">
                <Checkbox checked={selectedTeamIds.includes(team.id)} onCheckedChange={(checked) => toggleTeam(team.id, checked === true)} />
                <span className="flex-1">
                  <span className="font-medium">{team.name}</span>
                  {team.workArea ? <span className="text-muted-foreground"> · {team.workArea}</span> : null}
                  {team.foremanName ? <span className="text-muted-foreground"> · Foreman: {team.foremanName}</span> : null}
                  <span className="text-muted-foreground"> · {team.workerCount} {team.workerCount === 1 ? "worker" : "workers"}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        {fieldError("erectionTeamIds") && <p className="text-sm text-destructive">{fieldError("erectionTeamIds")}</p>}
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader title="Notes" />
        <div className="flex flex-col gap-1.5">
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
