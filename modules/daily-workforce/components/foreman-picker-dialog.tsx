"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { EmployeeDailyState } from "@/modules/daily-workforce/types";
import { DAILY_ATTENDANCE_STATUS_LABELS, employeeIsAvailableForAssignment } from "@/modules/daily-workforce/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type ForemanPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  workforce: EmployeeDailyState[];
  /** Employee ids to hide entirely — e.g. Add Foreman excludes everyone already on today's roster. Change Foreman passes none: a Foreman already running other teams is a completely normal, selectable candidate. */
  excludeEmployeeIds?: string[];
  onSelect: (employeeId: string) => void;
};

/**
 * Milestone G, items 2/4/6: the corrected Foreman picker — eligible
 * Foremen only (reuses EmployeeDailyState.isEligibleForeman, the same
 * is_eligible_scaffold_foreman() check the database enforces), unavailable
 * (absent/sick/leave/off_site) shown but disabled. Deliberately does NOT
 * have WorkerPickerDialog's "already assigned to another team — Move to…"
 * logic: a Foreman managing another team is completely normal and fully
 * selectable here, never disabled or requiring a confirmation — that was
 * the old, incorrect "one team per Foreman" assumption this milestone
 * removes.
 */
export function ForemanPickerDialog({ open, onOpenChange, title, description, workforce, excludeEmployeeIds = [], onSelect }: ForemanPickerDialogProps) {
  const [search, setSearch] = useState("");
  const excluded = useMemo(() => new Set(excludeEmployeeIds), [excludeEmployeeIds]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workforce
      .filter((state) => state.isEligibleForeman)
      .filter((state) => !excluded.has(state.employee.id))
      .filter((state) => !query || `${state.employee.first_name} ${state.employee.last_name}`.toLowerCase().includes(query));
  }, [workforce, search, excluded]);

  function handleSelect(state: EmployeeDailyState) {
    if (!employeeIsAvailableForAssignment(state)) return;
    onSelect(state.employee.id);
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
          <Input placeholder="Search foremen…" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" autoFocus />
        </div>

        <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No eligible foremen found for this project.</p>
          ) : (
            filtered.map((state) => {
              const available = employeeIsAvailableForAssignment(state);
              return (
                <button
                  key={state.employee.id}
                  type="button"
                  disabled={!available}
                  onClick={() => handleSelect(state)}
                  title={!available ? `Cannot add — marked ${DAILY_ATTENDANCE_STATUS_LABELS[state.attendanceStatus]} today` : undefined}
                  className="flex items-center justify-between gap-3 rounded-md p-2 text-left text-sm transition-colors enabled:hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {state.employee.first_name} {state.employee.last_name}
                    </span>
                    {state.assignedTeam && <span className="text-xs text-muted-foreground">Also on {state.assignedTeam.name} (as a worker)</span>}
                  </div>
                  {available ? (
                    <Badge className="bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">Available</Badge>
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
