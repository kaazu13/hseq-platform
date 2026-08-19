"use client";

import { useState, useTransition, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2, Lock, MapPin, Plus, Users, X } from "lucide-react";
import { createScaffold, updateScaffold } from "@/modules/scaffolds/actions";
import { listEligibleErectionTeamsAction, listAvailableScaffoldWorkersAction } from "@/modules/scaffolds/team-actions";
import type { EligibleErectionTeam } from "@/modules/scaffolds/queries";
import {
  SCAFFOLD_TYPES,
  SCAFFOLD_TYPE_LABELS,
  SCAFFOLD_INSPECTION_INTERVAL_TYPES,
  SCAFFOLD_INSPECTION_INTERVAL_TYPE_DAYS,
  SCAFFOLD_INSPECTION_CUSTOM_INTERVAL_MIN_DAYS,
  SCAFFOLD_INSPECTION_CUSTOM_INTERVAL_MAX_DAYS,
  DEFAULT_SCAFFOLD_INSPECTION_INTERVAL_TYPE,
  DEFAULT_SCAFFOLD_INSPECTION_INTERVAL_DAYS,
  type ScaffoldType,
  type ScaffoldDetail,
  type ScaffoldInspectionIntervalType,
} from "@/modules/scaffolds/types";
import { EmployeeCombobox, EmployeeComboboxField, type EmployeeOption } from "@/components/shared/employee-combobox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";

type StagedParticipant = {
  employeeId: string;
  firstName: string;
  lastName: string;
  source: "manual" | "team_import";
  sourceDailyTeamId?: string;
  sourceTeamName?: string;
};

type ScaffoldFormProps = {
  companyId: string;
  projectId: string;
  projectName: string;
  foremanOptions: EmployeeOption[];
  /** V2: locks the Responsible Foreman field to the caller's own name (mustSelfLockResponsibleForeman()'s result) — a Foreman relying only on the self-only creation path can never pick anyone else, even by tampering with the client. Ignored in edit mode (editing is unchanged, hseq_manager/hse_officer/inspector only). */
  selfLockedForemanId?: string | null;
  today: string;
  /** Part P — the project's EFFECTIVE inspection interval (company -> project -> system default of seven_days/7), pre-filled so a new scaffold never forces the creator to reselect 7 days every time. Ignored in edit mode (the scaffold's own current values are used instead). */
  effectiveIntervalType?: ScaffoldInspectionIntervalType;
  effectiveIntervalDays?: number;
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
export function ScaffoldForm({
  companyId,
  projectId,
  projectName,
  foremanOptions,
  selfLockedForemanId,
  today,
  effectiveIntervalType = DEFAULT_SCAFFOLD_INSPECTION_INTERVAL_TYPE,
  effectiveIntervalDays = DEFAULT_SCAFFOLD_INSPECTION_INTERVAL_DAYS,
  mode,
  scaffold,
}: ScaffoldFormProps) {
  const t = useTranslations("ScaffoldInspectionFrequency");
  const tMap = useTranslations("ScaffoldMap");
  const tCrew = useTranslations("ScaffoldCrew");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [scaffoldType, setScaffoldType] = useState<ScaffoldType>(scaffold?.scaffold_type ?? "independent");
  const [responsibleForemanId, setResponsibleForemanId] = useState(scaffold?.responsible_foreman_id ?? selfLockedForemanId ?? "");
  const [erectedAt, setErectedAt] = useState(scaffold?.erected_at ?? today);
  const [intervalType, setIntervalType] = useState<ScaffoldInspectionIntervalType>(scaffold?.inspection_interval_type ?? effectiveIntervalType);
  const [customIntervalDays, setCustomIntervalDays] = useState(
    String((scaffold?.inspection_interval_type === "custom" ? scaffold.inspection_interval_days : null) ?? effectiveIntervalDays),
  );
  const [latitude, setLatitude] = useState(scaffold?.latitude != null ? String(scaffold.latitude) : "");
  const [longitude, setLongitude] = useState(scaffold?.longitude != null ? String(scaffold.longitude) : "");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const resolvedIntervalDays = intervalType === "custom" ? Number(customIntervalDays) || 0 : SCAFFOLD_INSPECTION_INTERVAL_TYPE_DAYS[intervalType];

  function useCurrentLocation() {
    setLocationError(null);
    if (!("geolocation" in navigator)) {
      setLocationError(tMap("geolocationUnsupported"));
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setIsLocating(false);
      },
      () => {
        setLocationError(tMap("geolocationDenied"));
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // `eligibleTeams === null` IS the loading state — deliberately no
  // separate `loading` boolean set synchronously inside the effect body
  // (react-hooks/set-state-in-effect flags that as a cascading-render
  // risk; see the identical convention in
  // modules/lmra/components/lmra-add-daily-team-dialog.tsx). Every
  // setState call below happens inside the fetch's .then()/.catch(),
  // never synchronously in the effect body itself.
  const [eligibleTeams, setEligibleTeams] = useState<EligibleErectionTeam[] | null>(null);
  const [availableWorkers, setAvailableWorkers] = useState<EmployeeOption[] | null>(null);
  // Part 3 — a Today's Team is ONLY a fast-fill helper now: importing it
  // populates `participants` (the authoritative crew list) but never
  // permanently ties the scaffold to that team's live membership.
  // `importedTeamIds` is a separate, append-only audit set (which teams
  // were EVER used as an import source this session) — erectionTeamIds
  // on submit, kept even if every imported member is later individually
  // removed from `participants`.
  const [importedTeamIds, setImportedTeamIds] = useState<string[]>(mode === "edit" ? scaffold.erectionTeams.map((t) => t.dailyTeamId) : []);
  const [participants, setParticipants] = useState<StagedParticipant[]>(
    mode === "edit"
      ? scaffold.participants.map((p) => ({ employeeId: p.employeeId, firstName: p.firstName, lastName: p.lastName, source: p.source, sourceTeamName: p.sourceTeamName ?? undefined }))
      : [],
  );

  // Refetch eligible teams + available workers whenever the erection date
  // changes — never a stale list for a date the caller has since moved
  // away from.
  useEffect(() => {
    if (!erectedAt) return;
    let cancelled = false;
    listEligibleErectionTeamsAction(companyId, projectId, erectedAt)
      .then((teams) => {
        if (!cancelled) setEligibleTeams(teams);
      })
      .catch(() => {
        if (!cancelled) setEligibleTeams([]);
      });
    listAvailableScaffoldWorkersAction(companyId, projectId, erectedAt)
      .then((workers) => {
        if (!cancelled) setAvailableWorkers(workers);
      })
      .catch(() => {
        if (!cancelled) setAvailableWorkers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, projectId, erectedAt]);

  function importTeam(team: EligibleErectionTeam) {
    setImportedTeamIds((prev) => (prev.includes(team.id) ? prev : [...prev, team.id]));
    setParticipants((prev) => {
      const existingIds = new Set(prev.map((p) => p.employeeId));
      const imported = team.workers
        .filter((worker) => !existingIds.has(worker.id))
        .map((worker): StagedParticipant => ({ employeeId: worker.id, firstName: worker.firstName, lastName: worker.lastName, source: "team_import", sourceDailyTeamId: team.id, sourceTeamName: team.name }));
      return [...prev, ...imported];
    });
  }

  function addManualWorker(option: EmployeeOption) {
    setParticipants((prev) => {
      if (prev.some((p) => p.employeeId === option.value)) return prev;
      const [firstName, ...rest] = option.label.split(" ");
      return [...prev, { employeeId: option.value, firstName, lastName: rest.join(" "), source: "manual" }];
    });
  }

  function removeParticipant(employeeId: string) {
    setParticipants((prev) => prev.filter((p) => p.employeeId !== employeeId));
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
    if (participants.length === 0) {
      setFormError("Add at least one person to the erection crew.");
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
      erectionTeamIds: importedTeamIds,
      participants: participants.map((p) => ({ employeeId: p.employeeId, source: p.source, sourceDailyTeamId: p.sourceDailyTeamId })),
      inspectionIntervalType: intervalType,
      inspectionIntervalDays: String(resolvedIntervalDays),
      latitude,
      longitude,
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
        <SectionHeader title={tCrew("title")} description={tCrew("description")} />

        {mode === "edit" && scaffold.teamMembers.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-md border bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase">{tCrew("legacyRosterTitle")}</p>
            <p className="text-sm text-muted-foreground">{scaffold.teamMembers.map((member) => `${member.firstName} ${member.lastName}`).join(", ")}</p>
            <p className="text-xs text-muted-foreground">{tCrew("legacyRosterNote")}</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label>{tCrew("addFromTeam")}</Label>
          {eligibleTeams === null ? (
            <p className="text-sm text-muted-foreground">{tCrew("loadingTeams", { date: erectedAt })}</p>
          ) : eligibleTeams.length === 0 ? (
            <EmptyState
              icon={Users}
              title={tCrew("noTeamsTitle")}
              description={selfLockedForemanId ? tCrew("noTeamsDescriptionForeman") : tCrew("noTeamsDescription")}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {eligibleTeams.map((team) => {
                const alreadyImported = importedTeamIds.includes(team.id);
                return (
                  <div key={team.id} className="flex items-center gap-3 rounded-md border p-3 text-sm">
                    <span className="flex-1">
                      <span className="font-medium">{team.name}</span>
                      {team.workArea ? <span className="text-muted-foreground"> · {team.workArea}</span> : null}
                      {team.foremanName ? <span className="text-muted-foreground"> · {tCrew("foremanLabel", { name: team.foremanName })}</span> : null}
                      <span className="text-muted-foreground">
                        {" "}
                        · {tCrew("workerCount", { count: team.workerCount })}
                      </span>
                    </span>
                    <Button type="button" variant="outline" size="sm" onClick={() => importTeam(team)}>
                      <Plus />
                      {alreadyImported ? tCrew("reimportTeam") : tCrew("importTeam")}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label>{tCrew("addWorker")}</Label>
          <EmployeeCombobox
            value={null}
            onValueChange={(id) => {
              const option = (availableWorkers ?? []).find((candidate) => candidate.value === id);
              if (option) addManualWorker(option);
            }}
            options={availableWorkers ?? []}
            excludeIds={participants.map((p) => p.employeeId)}
            placeholder={tCrew("addWorkerPlaceholder")}
            emptyMessage={availableWorkers === null ? tCrew("loadingWorkers") : tCrew("noAvailableWorkers")}
            clearable={false}
          />
          <p className="text-xs text-muted-foreground">{tCrew("availabilityNote")}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label>{tCrew("crewListTitle", { count: participants.length })}</Label>
          {participants.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tCrew("crewEmpty")}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {participants.map((participant) => (
                <div key={participant.employeeId} className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">
                      {participant.firstName} {participant.lastName}
                    </span>
                    {participant.source === "team_import" && participant.sourceTeamName && <span className="text-muted-foreground"> · {tCrew("fromTeam", { name: participant.sourceTeamName })}</span>}
                  </span>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={tCrew("removeWorker", { name: `${participant.firstName} ${participant.lastName}` })} onClick={() => removeParticipant(participant.employeeId)}>
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        {fieldError("participants") && <p className="text-sm text-destructive">{fieldError("participants")}</p>}
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader title={t("title")} description={t("description")} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inspectionIntervalType">{t("title")}</Label>
            <Select value={intervalType} onValueChange={(value) => setIntervalType(value as ScaffoldInspectionIntervalType)}>
              <SelectTrigger id="inspectionIntervalType" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCAFFOLD_INSPECTION_INTERVAL_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {intervalType === "custom" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customIntervalDays">{t("customDaysLabel")}</Label>
              <Input
                id="customIntervalDays"
                type="number"
                inputMode="numeric"
                min={SCAFFOLD_INSPECTION_CUSTOM_INTERVAL_MIN_DAYS}
                max={SCAFFOLD_INSPECTION_CUSTOM_INTERVAL_MAX_DAYS}
                value={customIntervalDays}
                onChange={(event) => setCustomIntervalDays(event.target.value)}
                aria-invalid={Boolean(fieldError("inspectionIntervalDays"))}
              />
            </div>
          )}
        </div>
        {fieldError("inspectionIntervalDays") && <p className="text-sm text-destructive">{fieldError("inspectionIntervalDays")}</p>}
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader title={tMap("scaffoldLocation")} />
        {locationError && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{locationError}</AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="latitude">{tMap("latitude")}</Label>
            <Input id="latitude" type="number" step="0.000001" min={-90} max={90} inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} aria-invalid={Boolean(fieldError("latitude"))} />
            {fieldError("latitude") && <p className="text-sm text-destructive">{fieldError("latitude")}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="longitude">{tMap("longitude")}</Label>
            <Input id="longitude" type="number" step="0.000001" min={-180} max={180} inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} aria-invalid={Boolean(fieldError("longitude"))} />
            {fieldError("longitude") && <p className="text-sm text-destructive">{fieldError("longitude")}</p>}
          </div>
        </div>
        <div>
          <Button type="button" variant="outline" size="sm" disabled={isLocating} onClick={useCurrentLocation}>
            {isLocating ? <Loader2 className="animate-spin" /> : <MapPin />}
            {tMap("useCurrentLocation")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{tMap("locationOptionalNote")}</p>
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
