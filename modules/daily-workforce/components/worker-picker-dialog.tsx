"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { EmployeeDailyState } from "@/modules/daily-workforce/types";
import { DAILY_ATTENDANCE_STATUS_LABELS, employeeIsAvailableForAssignment } from "@/modules/daily-workforce/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type WorkerPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  workforce: EmployeeDailyState[];
  /** The team currently being added to — a worker already on THIS team is hidden (nothing to do); a worker on a DIFFERENT team is still selectable (selecting them moves them, per this milestone's "fast moving" requirement) and shown with a note. */
  currentTeamId?: string;
  onSelect: (employeeId: string) => void;
};

/**
 * The fast worker-search-and-assign picker — Today's Teams' "The UI should
 * make creating and moving workers between teams fast" requirement.
 * Visually distinguishes available/present, already-assigned, and
 * unavailable/absent (this milestone's explicit requirement); unavailable
 * employees are NOT selectable here at all — the click handler is simply
 * never wired for them, and the database itself would reject the
 * assignment regardless (validate_daily_team_member_insert()) if this UI
 * check were ever somehow bypassed.
 */
export function WorkerPickerDialog({ open, onOpenChange, title, description, workforce, currentTeamId, onSelect }: WorkerPickerDialogProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workforce
      .filter((state) => state.assignedTeam?.id !== currentTeamId)
      .filter((state) => !query || `${state.employee.first_name} ${state.employee.last_name}`.toLowerCase().includes(query));
  }, [workforce, search, currentTeamId]);

  function handleSelect(employeeId: string, available: boolean) {
    if (!available) return;
    onSelect(employeeId);
    setSearch("");
  }

  return (
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
              return (
                <button
                  key={state.employee.id}
                  type="button"
                  disabled={!available}
                  onClick={() => handleSelect(state.employee.id, available)}
                  className="flex items-center justify-between gap-3 rounded-md p-2 text-left text-sm transition-colors enabled:hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {state.employee.first_name} {state.employee.last_name}
                    </span>
                    {state.assignedTeam && <span className="text-xs text-muted-foreground">Currently on {state.assignedTeam.name}</span>}
                  </div>
                  {available ? (
                    state.assignedTeam ? (
                      <Badge variant="secondary">Assigned</Badge>
                    ) : (
                      <Badge className="bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">Available</Badge>
                    )
                  ) : (
                    <Badge variant="destructive">{DAILY_ATTENDANCE_STATUS_LABELS[state.attendanceStatus]}</Badge>
                  )}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
