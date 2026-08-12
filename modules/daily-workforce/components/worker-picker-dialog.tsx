"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
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
export function WorkerPickerDialog({ open, onOpenChange, title, description, workforce, currentTeamId, currentTeamName, onSelect }: WorkerPickerDialogProps) {
  const [search, setSearch] = useState("");
  const [pendingMove, setPendingMove] = useState<{ employeeId: string; name: string; fromTeamName: string } | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workforce
      .filter((state) => !state.isEligibleForeman)
      .filter((state) => state.assignedTeam?.id !== currentTeamId)
      .filter((state) => !query || `${state.employee.first_name} ${state.employee.last_name}`.toLowerCase().includes(query));
  }, [workforce, search, currentTeamId]);

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
              <p className="py-6 text-center text-sm text-muted-foreground">No workers found.</p>
            ) : (
              filtered.map((state) => {
                const available = employeeIsAvailableForAssignment(state);
                const assignedElsewhere = available && state.assignedTeam !== null;
                const canDirectlySelect = available && !assignedElsewhere;
                return (
                  <div key={state.employee.id} className="flex items-center justify-between gap-3 rounded-md p-2 text-sm">
                    <button
                      type="button"
                      disabled={!canDirectlySelect}
                      onClick={() => handleSelect(state)}
                      title={!available ? `Cannot assign — marked ${DAILY_ATTENDANCE_STATUS_LABELS[state.attendanceStatus]} today` : assignedElsewhere ? "Already assigned — use Move to reassign" : undefined}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left transition-colors enabled:hover:bg-muted/60 disabled:cursor-not-allowed"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">
                          {state.employee.first_name} {state.employee.last_name}
                        </span>
                        {assignedElsewhere && <span className="text-xs text-muted-foreground">Assigned — {state.assignedTeam!.name}</span>}
                      </div>
                      {available ? (
                        assignedElsewhere ? (
                          <Badge variant="secondary">Assigned</Badge>
                        ) : (
                          <Badge className="bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">Available</Badge>
                        )
                      ) : (
                        <Badge variant="destructive">{DAILY_ATTENDANCE_STATUS_LABELS[state.attendanceStatus]}</Badge>
                      )}
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
