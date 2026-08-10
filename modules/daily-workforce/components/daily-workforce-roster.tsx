"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { setDailyAttendanceStatus } from "@/modules/daily-workforce/actions";
import type { EmployeeDailyState } from "@/modules/daily-workforce/types";
import { DAILY_ATTENDANCE_STATUSES, DAILY_ATTENDANCE_STATUS_LABELS, employeeIsAvailableForAssignment, type DailyAttendanceStatus } from "@/modules/daily-workforce/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type DailyWorkforceRosterProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  workforce: EmployeeDailyState[];
  canManage: boolean;
};

function statusBadgeClassName(status: DailyAttendanceStatus): string {
  if (status === "not_set" || status === "present") return "bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300";
  return "bg-destructive/10 text-destructive dark:bg-destructive/20";
}

/**
 * The project's whole roster for one date, with each employee's daily
 * status and current team assignment — "Only statuses that permit working
 * may be assigned to a daily team" is enforced at the database level
 * (validate_daily_team_member_insert()); this list is where a PM/Admin
 * actually SETS that status. Marking someone unavailable while they're
 * currently on an OPEN team shows a confirmation explaining the team
 * removal before it happens (this milestone's explicit requirement) — the
 * removal itself is atomic regardless (set_daily_attendance_status()), so
 * skipping the confirmation can never leave a contradictory state.
 */
export function DailyWorkforceRoster({ companyId, projectId, workDate, workforce, canManage }: DailyWorkforceRosterProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DailyAttendanceStatus | "all">("all");
  const [pendingChange, setPendingChange] = useState<{ employeeId: string; name: string; status: DailyAttendanceStatus; teamName: string } | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workforce
      .filter((state) => !query || `${state.employee.first_name} ${state.employee.last_name}`.toLowerCase().includes(query))
      .filter((state) => statusFilter === "all" || state.attendanceStatus === statusFilter);
  }, [workforce, search, statusFilter]);

  function applyStatus(employeeId: string, status: DailyAttendanceStatus) {
    startTransition(async () => {
      const result = await setDailyAttendanceStatus(companyId, projectId, employeeId, workDate, { status, note: undefined });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      if (result.data.removedFromTeamId) {
        toast.success("Status updated — removed from today's team.");
      } else {
        toast.success("Status updated.");
      }
      router.refresh();
    });
  }

  function handleStatusChange(state: EmployeeDailyState, status: DailyAttendanceStatus) {
    const willBlockWork = !["not_set", "present"].includes(status);
    if (willBlockWork && state.assignedTeam) {
      setPendingChange({ employeeId: state.employee.id, name: `${state.employee.first_name} ${state.employee.last_name}`, status, teamName: state.assignedTeam.name });
      return;
    }
    applyStatus(state.employee.id, status);
  }

  function confirmPendingChange() {
    if (!pendingChange) return;
    applyStatus(pendingChange.employeeId, pendingChange.status);
    setPendingChange(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search workers…" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" aria-label="Search workers" />
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter((value ?? "all") as DailyAttendanceStatus | "all")}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {DAILY_ATTENDANCE_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {DAILY_ATTENDANCE_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col divide-y rounded-lg border">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No workers found.</p>
        ) : (
          filtered.map((state) => {
            const available = employeeIsAvailableForAssignment(state);
            return (
              <div key={state.employee.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {state.employee.first_name} {state.employee.last_name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {state.assignedTeam ? `On ${state.assignedTeam.name}` : available ? "Not assigned today" : "—"}
                  </span>
                </div>

                {canManage ? (
                  <Select value={state.attendanceStatus} onValueChange={(value) => handleStatusChange(state, value as DailyAttendanceStatus)} disabled={isPending}>
                    <SelectTrigger size="sm" className="w-40" aria-label={`Status for ${state.employee.first_name} ${state.employee.last_name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAILY_ATTENDANCE_STATUSES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {DAILY_ATTENDANCE_STATUS_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge className={statusBadgeClassName(state.attendanceStatus)}>{DAILY_ATTENDANCE_STATUS_LABELS[state.attendanceStatus]}</Badge>
                )}
              </div>
            );
          })
        )}
      </div>

      <AlertDialog open={pendingChange !== null} onOpenChange={(open) => !open && setPendingChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {pendingChange?.name} as {pendingChange ? DAILY_ATTENDANCE_STATUS_LABELS[pendingChange.status] : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingChange?.name} is currently assigned to {pendingChange?.teamName} today. Confirming will remove them from that team and update their status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingChange(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmPendingChange}>
              Confirm
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
