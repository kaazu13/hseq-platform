"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveTeamWithAssignments } from "@/modules/teams/actions";
import {
  TEAM_COLORS,
  TEAM_COLOR_LABELS,
  TEAM_COLOR_SWATCH_CLASSES,
  TEAM_STATUSES,
  TEAM_STATUS_LABELS,
  type ProjectRosterCandidate,
  type Team,
  type TeamAssignmentRole,
  type TeamColor,
  type TeamStatus,
} from "@/modules/teams/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type RosterSelection = "none" | TeamAssignmentRole;

type TeamFormDialogProps = {
  companyId: string;
  projectId: string;
  /** Undefined = create mode. */
  team?: Team;
  rosterCandidates: ProjectRosterCandidate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Create/edit Team — General fields plus an Assignments picker (Foreman(s)/
 * Members), per this milestone's "Team Creation / Editing" requirement:
 * both live in one dialog, not a separate screen. The Assignments list is
 * every employee currently rostered onto the project (never outside it —
 * "Only Employees assigned to that Project should be selectable"); picking
 * a role for someone already on a DIFFERENT team in this project moves
 * them (move_employee_to_team()'s close-then-open semantics), shown here
 * as a small "(in <team>)" note rather than left silent.
 */
export function TeamFormDialog({ companyId, projectId, team, rosterCandidates, open, onOpenChange }: TeamFormDialogProps) {
  const router = useRouter();
  const mode = team ? "edit" : "create";
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [color, setColor] = useState<TeamColor>(team?.color ?? "blue");
  const [status, setStatus] = useState<TeamStatus>(team?.status ?? "active");

  const initialSelections = useMemo(() => {
    const selections: Record<string, RosterSelection> = {};
    for (const candidate of rosterCandidates) {
      selections[candidate.employee.id] = candidate.currentTeamId === team?.id && candidate.currentRole ? candidate.currentRole : "none";
    }
    return selections;
  }, [rosterCandidates, team?.id]);
  const [selections, setSelections] = useState<Record<string, RosterSelection>>(initialSelections);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    const formData = new FormData(event.currentTarget);
    const input = {
      name: String(formData.get("name") ?? ""),
      code: String(formData.get("code") ?? ""),
      color,
      description: String(formData.get("description") ?? ""),
      status,
      shift: String(formData.get("shift") ?? ""),
      workArea: String(formData.get("workArea") ?? ""),
      activeFrom: String(formData.get("activeFrom") ?? ""),
      activeUntil: String(formData.get("activeUntil") ?? ""),
    };

    const changedEmployeeIds = Object.keys(selections).filter((employeeId) => selections[employeeId] !== initialSelections[employeeId]);
    const assignmentChanges = changedEmployeeIds.map((employeeId) => ({ employeeId, role: selections[employeeId] }));

    startTransition(async () => {
      // One atomic call — team fields and every assignment change are
      // applied in a single database transaction (save_team_with_assignments(),
      // supabase/migrations/20260728090000_projects_and_teams.sql §12), so
      // there is no partial-failure state (team saved but an assignment
      // rejected, or some members moved and others not).
      const result = await saveTeamWithAssignments(companyId, projectId, team?.id ?? null, input, assignmentChanges);

      if (!result.ok) {
        toast.error(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
        return;
      }

      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "New team" : `Edit ${team!.name}`}</DialogTitle>
            <DialogDescription>
              {mode === "create" ? "Add a team to this project." : "Update this team's details and current assignments."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Team name</Label>
              <Input id="name" name="name" required defaultValue={team?.name} aria-invalid={Boolean(fieldErrors.name)} />
              {fieldErrors.name && <p className="text-sm text-destructive">{fieldErrors.name}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">Team code (optional)</Label>
                <Input id="code" name="code" defaultValue={team?.code ?? ""} aria-invalid={Boolean(fieldErrors.code)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as TeamStatus)}>
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {TEAM_STATUS_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {TEAM_COLORS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setColor(value)}
                    aria-label={TEAM_COLOR_LABELS[value]}
                    aria-pressed={color === value}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-shadow",
                      TEAM_COLOR_SWATCH_CLASSES[value],
                      color === value ? "ring-2 ring-foreground" : "hover:ring-2 hover:ring-muted-foreground/40",
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="shift">Shift (optional)</Label>
                <Input id="shift" name="shift" defaultValue={team?.shift ?? ""} aria-invalid={Boolean(fieldErrors.shift)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="workArea">Work area (optional)</Label>
                <Input id="workArea" name="workArea" defaultValue={team?.work_area ?? ""} aria-invalid={Boolean(fieldErrors.workArea)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="activeFrom">Active from (optional)</Label>
                <Input id="activeFrom" name="activeFrom" type="date" defaultValue={team?.active_from ?? ""} aria-invalid={Boolean(fieldErrors.activeFrom)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="activeUntil">Active until (optional)</Label>
                <Input id="activeUntil" name="activeUntil" type="date" defaultValue={team?.active_until ?? ""} aria-invalid={Boolean(fieldErrors.activeUntil)} />
                {fieldErrors.activeUntil && <p className="text-sm text-destructive">{fieldErrors.activeUntil}</p>}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea id="description" name="description" rows={2} defaultValue={team?.description ?? ""} />
            </div>

            <div className="flex flex-col gap-2 border-t pt-4">
              <Label>Assignments</Label>
              {rosterCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No employees are assigned to this project yet — add them from the Assignments tab first.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {rosterCandidates.map((candidate) => {
                    const movingFromAnotherTeam = candidate.currentTeamId && candidate.currentTeamId !== team?.id;
                    return (
                      <div key={candidate.employee.id} className="flex items-center justify-between gap-2">
                        <div className="flex flex-col">
                          <span className="text-sm">
                            {candidate.employee.first_name} {candidate.employee.last_name}
                          </span>
                          {movingFromAnotherTeam ? (
                            <span className="text-xs text-muted-foreground">In {candidate.currentTeamName}</span>
                          ) : null}
                        </div>
                        <Select
                          value={selections[candidate.employee.id] ?? "none"}
                          onValueChange={(value) =>
                            setSelections((previous) => ({ ...previous, [candidate.employee.id]: value as RosterSelection }))
                          }
                        >
                          <SelectTrigger size="sm" className="w-32" aria-label={`Role for ${candidate.employee.first_name} ${candidate.employee.last_name}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not on team</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="foreman">Foreman</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : mode === "create" ? "Create team" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
