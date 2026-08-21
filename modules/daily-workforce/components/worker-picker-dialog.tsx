"use client";

import { useMemo, useState } from "react";
import { Search, EyeOff, Eye } from "lucide-react";
import type { EmployeeDailyState } from "@/modules/daily-workforce/types";
import { DAILY_ATTENDANCE_STATUS_LABELS, employeeIsAvailableForAssignment } from "@/modules/daily-workforce/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type WorkerPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  workforce: EmployeeDailyState[];
  /** The team currently being added to — a worker already on THIS team is hidden (nothing to do). */
  currentTeamId?: string;
  currentTeamName?: string;
  onSelect: (employeeId: string) => void;
};

/**
 * The fast worker-search-and-assign picker (item 7: Foremen never appear
 * here — non-Foreman eligible workers only). Milestone G retired this
 * component's old "foreman" mode entirely — Foreman selection now has its
 * own, differently-behaved ForemanPickerDialog (a Foreman managing
 * another team is normal, never disabled/requiring "Move to…" the way a
 * double-booked WORKER still is).
 *
 * An employee already assigned to a DIFFERENT team is shown for context
 * but DISABLED for a plain click — the previous version only showed a
 * badge while leaving the row fully clickable, which is exactly how "David
 * was assignable to Team 2 while already on Team 1" happened. Moving them
 * requires the explicit "Move to…" button, which asks for confirmation
 * before calling the same atomic move_daily_team_member() RPC every
 * assignment already goes through — never a silent double assignment,
 * never a temporary unassigned gap.
 */
const MANAGEMENT_ONLY_ROLES = ["platform_super_admin", "company_admin", "project_manager", "planner"];

/** Part 3/20/29 — why a row is hidden by default: checked independently (never derived from the combined employeeIsAssignableToday() alone), so the picker can show the RIGHT reason rather than a generic "unavailable." */
function blockReason(state: EmployeeDailyState): "management" | "pendingRequest" | "attendance" | null {
  if (state.roleNames.length > 0 && state.roleNames.every((role) => MANAGEMENT_ONLY_ROLES.includes(role))) return "management";
  if (state.hasPendingRequest) return "pendingRequest";
  if (!employeeIsAvailableForAssignment(state)) return "attendance";
  return null;
}

export function WorkerPickerDialog({ open, onOpenChange, title, description, workforce, currentTeamId, currentTeamName, onSelect }: WorkerPickerDialogProps) {
  const [search, setSearch] = useState("");
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [pendingMove, setPendingMove] = useState<{ employeeId: string; name: string; fromTeamName: string } | null>(null);

  const candidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workforce
      .filter((state) => !state.isEligibleForeman)
      .filter((state) => state.assignedTeam?.id !== currentTeamId)
      .filter((state) => !query || `${state.employee.first_name} ${state.employee.last_name}`.toLowerCase().includes(query));
  }, [workforce, search, currentTeamId]);

  // Part 3/20/29 — pre-filter, don't just disable: a management-only
  // account or a pending-request holder never appears in the default
  // list at all (the real enforcement is still the DB trigger — this is
  // only what gets OFFERED). Someone already assigned to a DIFFERENT
  // team stays visible (that's the legitimate "Move to…" case, not a
  // block). A "Show unavailable" toggle reveals the hard-blocked rows
  // with their reason, for management contexts that want to see why.
  const filtered = useMemo(() => candidates.filter((state) => blockReason(state) === null), [candidates]);
  const hidden = useMemo(() => candidates.filter((state) => blockReason(state) !== null), [candidates]);

  function handleSelect(state: EmployeeDailyState) {
    const available = employeeIsAvailableForAssignment(state);
    if (!available) return;
    if (state.assignedTeam) {
      setPendingMove({ employeeId: state.employee.id, name: `${state.employee.first_name} ${state.employee.last_name}`, fromTeamName: state.assignedTeam.name });
      return;
    }
    onSelect(state.employee.id);
    setSearch("");
  }

  function confirmMove() {
    if (!pendingMove) return;
    onSelect(pendingMove.employeeId);
    setPendingMove(null);
    setSearch("");
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search workers…" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" autoFocus />
          </div>

          <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No available workers found.</p>
            ) : (
              filtered.map((state) => {
                const assignedElsewhere = state.assignedTeam !== null;
                return (
                  <div key={state.employee.id} className="flex items-center justify-between gap-3 rounded-md p-2 text-sm">
                    <button
                      type="button"
                      disabled={assignedElsewhere}
                      onClick={() => handleSelect(state)}
                      title={assignedElsewhere ? "Already assigned — use Move to reassign" : undefined}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left transition-colors enabled:hover:bg-muted/60 disabled:cursor-not-allowed"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">
                          {state.employee.first_name} {state.employee.last_name}
                        </span>
                        {assignedElsewhere && <span className="text-xs text-muted-foreground">Assigned — {state.assignedTeam!.name}</span>}
                      </div>
                      {assignedElsewhere ? <Badge variant="secondary">Assigned</Badge> : <Badge className="bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">Available</Badge>}
                    </button>
                    {assignedElsewhere && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => setPendingMove({ employeeId: state.employee.id, name: `${state.employee.first_name} ${state.employee.last_name}`, fromTeamName: state.assignedTeam!.name })}
                      >
                        Move to…
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {hidden.length > 0 && (
            <div className="flex flex-col gap-1 border-t pt-2">
              <button type="button" onClick={() => setShowUnavailable((prev) => !prev)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                {showUnavailable ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                {showUnavailable ? "Hide" : "Show"} unavailable ({hidden.length})
              </button>
              {showUnavailable && (
                <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                  {hidden.map((state) => {
                    const reason = blockReason(state);
                    const reasonLabel = reason === "management" ? "Management role" : reason === "pendingRequest" ? "Pending request" : DAILY_ATTENDANCE_STATUS_LABELS[state.attendanceStatus];
                    return (
                      <div key={state.employee.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/30 p-2 text-sm text-muted-foreground">
                        <span className="truncate">
                          {state.employee.first_name} {state.employee.last_name}
                        </span>
                        <Badge variant="outline">{reasonLabel}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={pendingMove !== null} onOpenChange={(next) => !next && setPendingMove(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move {pendingMove?.name}?</DialogTitle>
            <DialogDescription>
              {pendingMove?.name} is currently on {pendingMove?.fromTeamName}. Moving them to {currentTeamName ?? "this team"} will atomically remove them from {pendingMove?.fromTeamName} — they will
              never be on both at once.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingMove(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmMove}>
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
