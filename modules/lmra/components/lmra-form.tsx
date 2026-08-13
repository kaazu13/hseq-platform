"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { createLmraComplete, updateLmraComplete } from "@/modules/lmra/actions";
import { LMRA_SHIFTS, LMRA_SHIFT_LABELS, LMRA_WORK_AREA_MAX_LENGTH, LMRA_WORK_ACTIVITY_MAX_LENGTH, LMRA_NOTES_MAX_LENGTH, type LmraAssessmentDetail, type LmraHazardInput, type LmraResult, type LmraShift } from "@/modules/lmra/types";
import { EmployeeComboboxField, type EmployeeOption } from "@/components/shared/employee-combobox";
import { LmraWorkersSection } from "@/modules/lmra/components/lmra-workers-section";
import { LmraHazardsAndControls } from "@/modules/lmra/components/lmra-hazards-and-controls";
import { LmraFinalConfirmation } from "@/modules/lmra/components/lmra-final-confirmation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type LmraFormProps = {
  companyId: string;
  projectId: string;
  projectName: string;
  candidates: EmployeeOption[];
  todayDate: string;
  hazardRows: LmraHazardInput[];
  participantIds: string[];
  /** Item 2: HSE Manager/project Foreman may browse and pick ANY of that day's teams via "Select Today's Team"; everyone else only gets "Add My Today's Team". */
  canSelectAnyTeam: boolean;
} & (
  | {
      mode: "create";
      /** Whether the caller may set completed-by to someone other than themselves (HSE Manager/Foreman) — an ordinary worker never sees this field as editable. */
      isElevated: boolean;
      myEmployeeId: string | null;
      /** Item 5: pins this LMRA to the exact Today's Team card it was started from (never re-resolved by name/date later) — set only when arriving via "[ LMRA ]" on a team card. */
      dailyTeamId?: string;
      assessment?: undefined;
      hazardsEditable?: undefined;
    }
  | {
      mode: "edit";
      assessment: LmraAssessmentDetail;
      hazardsEditable: boolean;
      isElevated?: undefined;
      myEmployeeId?: undefined;
    }
);

/**
 * One professional, mobile-first LMRA form (Phase 7) — work details,
 * workers involved, hazards+controls, and (create only) final confirmation,
 * saved atomically via one Server Function call. No per-section save
 * buttons — a single "Save LMRA" / "Save Draft" (create) or "Save changes"
 * (edit) action, disabled while pending to prevent double submission, and
 * entered data is preserved (component state, not reset) if validation
 * fails.
 */
export function LmraForm(props: LmraFormProps) {
  const { companyId, projectId, projectName, candidates, todayDate, canSelectAnyTeam } = props;
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [workArea, setWorkArea] = useState(props.mode === "edit" ? props.assessment.work_area : "");
  const [workActivity, setWorkActivity] = useState(props.mode === "edit" ? props.assessment.work_activity : "");
  const [workDate, setWorkDate] = useState(props.mode === "edit" ? props.assessment.work_date : todayDate);
  const [shift, setShift] = useState<LmraShift>(props.mode === "edit" ? props.assessment.shift : "day");
  const [completedByEmployeeId] = useState(
    props.mode === "edit" ? props.assessment.completed_by_employee_id : (props.myEmployeeId ?? ""),
  );
  const [pickedCompletedBy, setPickedCompletedBy] = useState(completedByEmployeeId);
  const [responsiblePersonId, setResponsiblePersonId] = useState<string | null>(
    props.mode === "edit" ? props.assessment.responsible_person_id : null,
  );
  const [notes, setNotes] = useState(props.mode === "edit" ? (props.assessment.notes ?? "") : "");
  const [participantIds, setParticipantIds] = useState<string[]>(props.participantIds);
  const [hazardRows, setHazardRows] = useState<LmraHazardInput[]>(props.hazardRows);
  const [result, setResult] = useState<LmraResult>("go");
  const [stopWorkReason, setStopWorkReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  // Bug fix: this used to be read directly off `props.dailyTeamId` at save
  // time — a static prop only ever populated via the `?dailyTeamId=` query
  // param path (clicking "[ LMRA ]" on a Today's Team card). "Add My
  // Today's Team"/"Select Today's Team" never had any way to communicate
  // the team they resolved back up to this component, so an LMRA created
  // via either of those never got daily_team_id set — exactly why Today's
  // Teams' completion indicator stayed neutral for it. State now, wired to
  // LmraWorkersSection's onTeamLinked below.
  const [dailyTeamId, setDailyTeamId] = useState<string | undefined>(props.mode === "create" ? props.dailyTeamId : props.assessment.daily_team_id ?? undefined);

  const canPickCompletedBy = props.mode === "create" && props.isElevated;
  const hazardsEditable = props.mode === "create" || props.hazardsEditable;

  // Item 1: "Responsible person" (assessment-level and per-hazard) may only
  // be one of Workers Involved — never the full project roster. Filtering
  // `candidates` down to `participantIds` here (rather than inside
  // LmraHazardsAndControls) is the single source of truth both the
  // assessment-level field and every per-hazard field below share.
  const participantCandidates = candidates.filter((candidate) => participantIds.includes(candidate.value));

  function handleParticipantIdsChange(nextIds: string[]) {
    setParticipantIds(nextIds);
    // A worker removed from Workers Involved can no longer be anyone's
    // Responsible person — clear rather than silently keep an invalid
    // reference the server would reject anyway.
    setResponsiblePersonId((current) => (current && !nextIds.includes(current) ? null : current));
    setHazardRows((rows) => rows.map((row) => (row.responsiblePersonId && !nextIds.includes(row.responsiblePersonId) ? { ...row, responsiblePersonId: null } : row)));
  }

  function fieldError(name: string) {
    return fieldErrors[name];
  }

  function handleWorkDateChange(nextWorkDate: string) {
    setWorkDate(nextWorkDate);
    // A daily_team_id link is only ever valid for the team's OWN work_date
    // (the create/update RPCs enforce this server-side too) — changing the
    // date invalidates whatever team was previously resolved, so clear it
    // rather than let a stale link fail confusingly at save time.
    setDailyTeamId(undefined);
  }

  function handleSave(submit: boolean) {
    setFormError(null);
    setFieldErrors({});

    startTransition(async () => {
      if (props.mode === "create") {
        const result_ = await createLmraComplete(companyId, {
          projectId,
          workArea,
          workActivity,
          workDate,
          shift,
          completedByEmployeeId: canPickCompletedBy ? pickedCompletedBy : completedByEmployeeId,
          responsiblePersonId,
          notes,
          participantEmployeeIds: participantIds,
          hazards: hazardRows,
          submit,
          result,
          stopWorkReason,
          confirmed: submit ? confirmed : true,
          dailyTeamId,
        });
        if (!result_.ok) {
          setFormError(result_.error.message);
          setFieldErrors(result_.error.fieldErrors ?? {});
        }
      } else {
        const result_ = await updateLmraComplete(companyId, props.assessment.id, projectId, {
          workArea,
          workActivity,
          workDate,
          shift,
          responsiblePersonId,
          notes,
          participantEmployeeIds: participantIds,
          hazards: hazardRows,
          dailyTeamId,
        });
        if (!result_.ok) {
          setFormError(result_.error.message);
          setFieldErrors(result_.error.fieldErrors ?? {});
        }
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {formError && (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Project</Label>
          <p className="text-sm text-muted-foreground">{projectName}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workArea">Work area</Label>
            <Input
              id="workArea"
              required
              maxLength={LMRA_WORK_AREA_MAX_LENGTH}
              value={workArea}
              onChange={(event) => setWorkArea(event.target.value)}
              aria-invalid={Boolean(fieldError("workArea"))}
            />
            {fieldError("workArea") && <p className="text-sm text-destructive">{fieldError("workArea")}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workActivity">Work activity</Label>
            <Input
              id="workActivity"
              required
              maxLength={LMRA_WORK_ACTIVITY_MAX_LENGTH}
              value={workActivity}
              onChange={(event) => setWorkActivity(event.target.value)}
              aria-invalid={Boolean(fieldError("workActivity"))}
            />
            {fieldError("workActivity") && <p className="text-sm text-destructive">{fieldError("workActivity")}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workDate">Date</Label>
            <Input id="workDate" type="date" required value={workDate} onChange={(event) => handleWorkDateChange(event.target.value)} aria-invalid={Boolean(fieldError("workDate"))} />
            {fieldError("workDate") && <p className="text-sm text-destructive">{fieldError("workDate")}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shift">Shift</Label>
            <Select value={shift} onValueChange={(value) => setShift(value as LmraShift)}>
              <SelectTrigger id="shift" aria-invalid={Boolean(fieldError("shift"))}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LMRA_SHIFTS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {LMRA_SHIFT_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError("shift") && <p className="text-sm text-destructive">{fieldError("shift")}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>LMRA completed by</Label>
            {canPickCompletedBy ? (
              <EmployeeComboboxField
                label=""
                htmlFor="completedBy"
                value={pickedCompletedBy || null}
                onValueChange={(id) => setPickedCompletedBy(id ?? "")}
                options={candidates}
                placeholder="Choose who completed this LMRA"
                clearable={false}
                error={fieldError("completedByEmployeeId")}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{candidates.find((c) => c.value === completedByEmployeeId)?.label ?? "You"}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <EmployeeComboboxField
              label="Person responsible for the work (optional)"
              htmlFor="responsiblePersonId"
              value={responsiblePersonId}
              onValueChange={setResponsiblePersonId}
              options={participantCandidates}
              placeholder={participantCandidates.length === 0 ? "Add Workers involved first" : "Not set"}
              error={fieldError("responsiblePersonId")}
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" rows={3} maxLength={LMRA_NOTES_MAX_LENGTH} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        </div>
      </div>

      <LmraWorkersSection
        companyId={companyId}
        projectId={projectId}
        workDate={workDate}
        options={candidates}
        selectedIds={participantIds}
        onChange={handleParticipantIdsChange}
        readOnly={!hazardsEditable}
        canSelectAnyTeam={canSelectAnyTeam}
        onTeamLinked={setDailyTeamId}
      />

      <LmraHazardsAndControls rows={hazardRows} onChange={setHazardRows} candidates={participantCandidates} readOnly={!hazardsEditable} />

      {props.mode === "create" && (
        <LmraFinalConfirmation
          result={result}
          onResultChange={setResult}
          stopWorkReason={stopWorkReason}
          onStopWorkReasonChange={setStopWorkReason}
          confirmed={confirmed}
          onConfirmedChange={setConfirmed}
          stopWorkReasonError={fieldError("stopWorkReason")}
          confirmedError={fieldError("confirmed")}
          disabled={isPending}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {props.mode === "create" ? (
          <>
            <Button type="button" disabled={isPending} onClick={() => handleSave(true)}>
              {isPending ? <Loader2 className="animate-spin" /> : null}
              Save LMRA
            </Button>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => handleSave(false)}>
              Save Draft
            </Button>
          </>
        ) : (
          <Button type="button" disabled={isPending} onClick={() => handleSave(false)}>
            {isPending ? <Loader2 className="animate-spin" /> : null}
            Save changes
          </Button>
        )}
      </div>
    </div>
  );
}
