"use client";

import { useState, useTransition, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Loader2, Lock, Users, X } from "lucide-react";
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
import { ScaffoldLocationPicker } from "@/modules/scaffolds/components/scaffold-location-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/shared/section-header";
import { cn } from "@/lib/utils";

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
  /** Part 4/36 — pre-fills Step 1's Client field as a suggestion only; the scaffold's own client_name is a separate, editable, per-scaffold value (see the client_name migration's header for why this isn't just a read of projects.client_name). */
  projectClientName?: string | null;
  siteLatitude?: number | null;
  siteLongitude?: number | null;
  foremanOptions: EmployeeOption[];
  /** V2: locks the Responsible Foreman field to the caller's own name (mustSelfLockResponsibleForeman()'s result) — a Foreman relying only on the self-only creation path can never pick anyone else, even by tampering with the client. Ignored in edit mode (editing is unchanged, hseq_manager/hse_officer/inspector only). */
  selfLockedForemanId?: string | null;
  today: string;
  /** Part P — the project's EFFECTIVE inspection interval (company -> project -> system default of seven_days/7), pre-filled so a new scaffold never forces the creator to reselect 7 days every time. Ignored in edit mode (the scaffold's own current values are used instead). */
  effectiveIntervalType?: ScaffoldInspectionIntervalType;
  effectiveIntervalDays?: number;
} & ({ mode: "create"; scaffold?: undefined } | { mode: "edit"; scaffold: ScaffoldDetail });

const STEP_KEYS = ["information", "crew", "inspectionLocation", "review"] as const;
type StepKey = (typeof STEP_KEYS)[number];

/** Which step each server-validated field belongs to — used to jump the wizard back to the first step containing an error after a failed submit, so a create-mode user is never left staring at a "Review" step with no visible explanation. */
const FIELD_STEP: Record<string, StepKey> = {
  tagNumber: "information",
  clientName: "information",
  workArea: "information",
  intendedUse: "information",
  maxLoadClass: "information",
  heightMetres: "information",
  lengthMetres: "information",
  widthMetres: "information",
  responsibleForemanId: "information",
  erectedAt: "information",
  participants: "crew",
  inspectionIntervalDays: "inspectionLocation",
  latitude: "inspectionLocation",
  longitude: "inspectionLocation",
};

/**
 * Combined create/edit scaffold-registration form, restructured (Part 3 of
 * the operational UX package) into a 4-step wizard for CREATE (Step
 * indicator + Back/Next), and the same 4 sections as directly-clickable
 * tabs for EDIT (Part 3's "editing... may use step navigation/tabs rather
 * than forcing all content into one long page. Do not make editing slower
 * than creation" — a manager fixing one field shouldn't have to click
 * through 3 screens first). All fields share ONE flat set of top-level
 * React state regardless of which step is visible, so nothing is
 * unmounted/remounted between steps and Back/Next never loses input.
 */
export function ScaffoldForm({
  companyId,
  projectId,
  projectName,
  projectClientName,
  siteLatitude,
  siteLongitude,
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
  const tWizard = useTranslations("ScaffoldWizard");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<StepKey>("information");

  const [clientName, setClientName] = useState(scaffold?.client_name ?? projectClientName ?? "");
  const [tagNumber, setTagNumber] = useState(scaffold?.tag_number ?? "");
  const [workArea, setWorkArea] = useState(scaffold?.work_area ?? "");
  const [scaffoldType, setScaffoldType] = useState<ScaffoldType>(scaffold?.scaffold_type ?? "independent");
  const [responsibleForemanId, setResponsibleForemanId] = useState(scaffold?.responsible_foreman_id ?? selfLockedForemanId ?? "");
  const [erectedAt, setErectedAt] = useState(scaffold?.erected_at ?? today);
  const [intervalType, setIntervalType] = useState<ScaffoldInspectionIntervalType>(scaffold?.inspection_interval_type ?? effectiveIntervalType);
  const [customIntervalDays, setCustomIntervalDays] = useState(
    String((scaffold?.inspection_interval_type === "custom" ? scaffold.inspection_interval_days : null) ?? effectiveIntervalDays),
  );
  const [latitude, setLatitude] = useState(scaffold?.latitude != null ? String(scaffold.latitude) : "");
  const [longitude, setLongitude] = useState(scaffold?.longitude != null ? String(scaffold.longitude) : "");

  const resolvedIntervalDays = intervalType === "custom" ? Number(customIntervalDays) || 0 : SCAFFOLD_INSPECTION_INTERVAL_TYPE_DAYS[intervalType];

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

  function buildInput(formData: FormData) {
    const effectiveForemanId = selfLockedForemanId ?? responsibleForemanId;
    return {
      projectId,
      tagNumber,
      clientName,
      workArea,
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
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const effectiveForemanId = selfLockedForemanId ?? responsibleForemanId;
    if (!effectiveForemanId) {
      setFormError(tWizard("chooseForemanError"));
      setStep("information");
      return;
    }
    if (participants.length === 0) {
      setFormError(tWizard("emptyCrewError"));
      setStep("crew");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const input = buildInput(formData);

    startTransition(async () => {
      const result = mode === "create" ? await createScaffold(companyId, input) : await updateScaffold(companyId, scaffold.id, projectId, input);

      if (!result.ok) {
        setFormError(result.error.message);
        const errors = result.error.fieldErrors ?? {};
        setFieldErrors(errors);
        const firstErroredField = Object.keys(errors)[0];
        if (firstErroredField && FIELD_STEP[firstErroredField]) {
          setStep(FIELD_STEP[firstErroredField]);
        }
      }
    });
  }

  function fieldError(name: string) {
    return fieldErrors[name];
  }

  const selfLockedForemanOption = selfLockedForemanId ? foremanOptions.find((option) => option.value === selfLockedForemanId) : null;
  const stepIndex = STEP_KEYS.indexOf(step);
  const siteCenter = siteLatitude != null && siteLongitude != null ? { latitude: siteLatitude, longitude: siteLongitude } : null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      {/* Stepper header — Next/Back sequence for create, freely-clickable tabs for edit (Part 3: "do not make editing slower than creation"). */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:gap-2">
        {STEP_KEYS.map((key, index) => {
          const isActive = key === step;
          const isDone = mode === "create" && index < stepIndex;
          const clickable = mode === "edit" || isDone || isActive;
          return (
            <button
              key={key}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && setStep(key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
                isActive ? "border-primary bg-primary/10 text-foreground" : isDone ? "border-transparent text-muted-foreground hover:text-foreground" : "border-transparent text-muted-foreground",
                !clickable && "cursor-not-allowed opacity-60",
              )}
            >
              {isDone ? <Check className="size-3.5" /> : <span className="flex size-4 items-center justify-center rounded-full bg-muted text-[10px] sm:size-5">{index + 1}</span>}
              <span className="hidden sm:inline">{tWizard(`step.${key}`)}</span>
            </button>
          );
        })}
      </div>

      {/* ── Step 1: Information ─────────────────────────────────────── */}
      <div className={cn("flex flex-col gap-6", step !== "information" && "hidden")}>
        <div className="flex flex-col gap-4">
          <SectionHeader title={tWizard("step.information")} />
          <div className="flex flex-col gap-1.5">
            <Label>{tWizard("project")}</Label>
            <p className="text-sm text-muted-foreground">{projectName}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tagNumber">{tWizard("tagNumber")}</Label>
              <Input id="tagNumber" name="tagNumber" required value={tagNumber} onChange={(event) => setTagNumber(event.target.value)} aria-invalid={Boolean(fieldError("tagNumber"))} />
              {fieldError("tagNumber") && <p className="text-sm text-destructive">{fieldError("tagNumber")}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="clientName">{tWizard("client")}</Label>
              <Input id="clientName" name="clientName" required value={clientName} onChange={(event) => setClientName(event.target.value)} aria-invalid={Boolean(fieldError("clientName"))} />
              {fieldError("clientName") && <p className="text-sm text-destructive">{fieldError("clientName")}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="workArea">{tWizard("workArea")}</Label>
              <Input id="workArea" name="workArea" required value={workArea} onChange={(event) => setWorkArea(event.target.value)} aria-invalid={Boolean(fieldError("workArea"))} />
              {fieldError("workArea") && <p className="text-sm text-destructive">{fieldError("workArea")}</p>}
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="structureReference">{tWizard("structureReference")}</Label>
              <Input id="structureReference" name="structureReference" defaultValue={scaffold?.structure_reference ?? ""} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scaffoldType">{tWizard("scaffoldType")}</Label>
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
              <Label htmlFor="intendedUse">{tWizard("intendedUse")}</Label>
              <Input id="intendedUse" name="intendedUse" defaultValue={scaffold?.intended_use ?? ""} aria-invalid={Boolean(fieldError("intendedUse"))} />
              {fieldError("intendedUse") && <p className="text-sm text-destructive">{fieldError("intendedUse")}</p>}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <SectionHeader title={tWizard("dimensionsTitle")} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="heightMetres">{tWizard("heightMetres")}</Label>
              <Input id="heightMetres" name="heightMetres" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={scaffold?.height_metres ?? ""} aria-invalid={Boolean(fieldError("heightMetres"))} />
              {fieldError("heightMetres") && <p className="text-sm text-destructive">{fieldError("heightMetres")}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lengthMetres">{tWizard("lengthMetres")}</Label>
              <Input id="lengthMetres" name="lengthMetres" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={scaffold?.length_metres ?? ""} aria-invalid={Boolean(fieldError("lengthMetres"))} />
              {fieldError("lengthMetres") && <p className="text-sm text-destructive">{fieldError("lengthMetres")}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="widthMetres">{tWizard("widthMetres")}</Label>
              <Input id="widthMetres" name="widthMetres" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={scaffold?.width_metres ?? ""} aria-invalid={Boolean(fieldError("widthMetres"))} />
              {fieldError("widthMetres") && <p className="text-sm text-destructive">{fieldError("widthMetres")}</p>}
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-3">
              <Label htmlFor="maxLoadClass">{tWizard("maxLoadClass")}</Label>
              <Input id="maxLoadClass" name="maxLoadClass" required placeholder={tWizard("maxLoadClassPlaceholder")} defaultValue={scaffold?.max_load_class} aria-invalid={Boolean(fieldError("maxLoadClass"))} />
              {fieldError("maxLoadClass") && <p className="text-sm text-destructive">{fieldError("maxLoadClass")}</p>}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <SectionHeader title={tWizard("responsibleForemanTitle")} />
          {selfLockedForemanId ? (
            <div className="flex flex-col gap-1.5">
              <Label>{tWizard("responsibleForemanTitle")}</Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <Lock className="size-3.5 text-muted-foreground" />
                <span>{tWizard("selfLockedForeman", { name: selfLockedForemanOption?.label ?? tWizard("you") })}</span>
              </div>
              <p className="text-xs text-muted-foreground">{tWizard("selfLockedForemanNote")}</p>
            </div>
          ) : foremanOptions.length === 0 ? (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">{tWizard("noForemenAvailable")}</p>
          ) : (
            <EmployeeComboboxField
              label={tWizard("responsibleForemanTitle")}
              htmlFor="responsibleForemanId"
              value={responsibleForemanId || null}
              onValueChange={(id) => setResponsibleForemanId(id ?? "")}
              options={foremanOptions}
              placeholder={tWizard("searchForemanPlaceholder")}
              emptyMessage={tWizard("noForemenAvailable")}
              clearable={false}
              error={fieldError("responsibleForemanId")}
            />
          )}
        </div>

        <div className="flex flex-col gap-4">
          <SectionHeader title={tWizard("datesTitle")} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="erectedAt">{tWizard("erectionDate")}</Label>
              <Input id="erectedAt" name="erectedAt" type="date" required value={erectedAt} onChange={(event) => setErectedAt(event.target.value)} aria-invalid={Boolean(fieldError("erectedAt"))} />
              {fieldError("erectedAt") && <p className="text-sm text-destructive">{fieldError("erectedAt")}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="erectedBy">{tWizard("erectedBy")}</Label>
              <Input id="erectedBy" name="erectedBy" defaultValue={scaffold?.erected_by ?? ""} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Step 2: Erection Crew ───────────────────────────────────── */}
      <div className={cn("flex flex-col gap-4", step !== "crew" && "hidden")}>
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
            // Part 5 — a compact single line, never a giant empty-state box.
            <p className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              {selfLockedForemanId ? tCrew("noTeamsCompactForeman", { date: erectedAt }) : tCrew("noTeamsCompact", { date: erectedAt })}
            </p>
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
                      <Users />
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

      {/* ── Step 3: Inspection & Location ───────────────────────────── */}
      <div className={cn("flex flex-col gap-6", step !== "inspectionLocation" && "hidden")}>
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
          <ScaffoldLocationPicker
            latitude={latitude}
            longitude={longitude}
            onChange={(nextLat, nextLng) => {
              setLatitude(nextLat);
              setLongitude(nextLng);
            }}
            siteCenter={siteCenter}
            latitudeError={fieldError("latitude")}
            longitudeError={fieldError("longitude")}
          />
          <p className="text-xs text-muted-foreground">{tMap("locationOptionalNote")}</p>
        </div>
      </div>

      {/* ── Step 4: Notes / Photos / Review ─────────────────────────── */}
      <div className={cn("flex flex-col gap-6", step !== "review" && "hidden")}>
        <div className="flex flex-col gap-4">
          <SectionHeader title={tWizard("notesTitle")} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">{tWizard("notesLabel")}</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={scaffold?.notes ?? ""} />
          </div>
          {mode === "edit" && <p className="text-xs text-muted-foreground">{tWizard("photosAfterSaveNote")}</p>}
          {mode === "create" && <p className="text-xs text-muted-foreground">{tWizard("photosAfterCreateNote")}</p>}
        </div>

        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <SectionHeader title={tWizard("reviewTitle")} />
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <ReviewRow label={tWizard("client")} value={clientName || "—"} />
            <ReviewRow label={tWizard("tagNumber")} value={tagNumber || "—"} />
            <ReviewRow label={tWizard("scaffoldType")} value={SCAFFOLD_TYPE_LABELS[scaffoldType]} />
            <ReviewRow label={tWizard("workArea")} value={workArea || "—"} />
            <ReviewRow label={tWizard("responsibleForemanTitle")} value={selfLockedForemanOption?.label ?? foremanOptions.find((o) => o.value === responsibleForemanId)?.label ?? "—"} />
            <ReviewRow label={tCrew("title")} value={tWizard("crewCount", { count: participants.length })} />
            <ReviewRow label={t("title")} value={intervalType === "custom" ? tWizard("customDays", { days: resolvedIntervalDays }) : t(intervalType)} />
            <ReviewRow label={tMap("scaffoldLocation")} value={latitude && longitude ? tWizard("locationSet") : tMap("locationNotSet")} />
          </dl>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-2">
          {stepIndex > 0 && (
            <Button type="button" variant="outline" onClick={() => setStep(STEP_KEYS[stepIndex - 1])} disabled={isPending}>
              <ChevronLeft />
              {tWizard("back")}
            </Button>
          )}
          <Button type="button" variant="ghost" disabled={isPending} onClick={() => router.back()}>
            {tWizard("cancel")}
          </Button>
        </div>
        {stepIndex < STEP_KEYS.length - 1 ? (
          <Button type="button" onClick={() => setStep(STEP_KEYS[stepIndex + 1])}>
            {tWizard("next")}
            <ChevronRight />
          </Button>
        ) : (
          <Button type="submit" disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : null}
            {isPending ? tWizard("saving") : mode === "create" ? tWizard("registerScaffold") : tWizard("saveChanges")}
          </Button>
        )}
      </div>
    </form>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
