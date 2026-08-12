"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { EmployeeDailyState, DailyAttendanceStatus } from "@/modules/daily-workforce/types";
import { DAILY_ATTENDANCE_STATUS_LABELS, employeeIsAvailableForAssignment, summarizeWorkforceByStatus } from "@/modules/daily-workforce/types";
import { WorkforceStatusDialog } from "@/modules/daily-workforce/components/workforce-status-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { dailyAttendanceStatusTone } from "@/components/shared/status-tone";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type WorkforceFilter = "all" | "present" | "assigned" | "notAssigned" | "absent" | "leave" | "sick" | "otherUnavailable";

type DailyWorkforceRosterProps = {
  companyId: string;
  projectId: string;
  workDate: string;
  workforce: EmployeeDailyState[];
  canManage: boolean;
};

function matchesFilter(state: EmployeeDailyState, filter: WorkforceFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "present":
      return state.attendanceStatus === "present";
    case "assigned":
      return state.assignedTeam !== null;
    case "notAssigned":
      return employeeIsAvailableForAssignment(state) && state.assignedTeam === null;
    case "absent":
      return state.attendanceStatus === "absent";
    case "leave":
      return state.attendanceStatus === "leave";
    case "sick":
      return state.attendanceStatus === "sick";
    case "otherUnavailable":
      return state.attendanceStatus === "training" || state.attendanceStatus === "off_site";
  }
}

/**
 * Item 11: a compact, professional list — never a raw enum string like
 * `not_set` (DAILY_ATTENDANCE_STATUS_LABELS everywhere), never 100
 * always-open `<select>` controls (status changes go through
 * WorkforceStatusDialog, one row at a time). The summary counters double
 * as clickable filters — "Present" narrows the list to present employees,
 * clicking again (or "All statuses") clears it.
 */
export function DailyWorkforceRoster({ companyId, projectId, workDate, workforce, canManage }: DailyWorkforceRosterProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<WorkforceFilter>("all");
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);

  const counts = useMemo(() => summarizeWorkforceByStatus(workforce), [workforce]);
  const editingState = workforce.find((state) => state.employee.id === editingEmployeeId) ?? null;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workforce
      .filter((state) => matchesFilter(state, filter))
      .filter((state) => !query || `${state.employee.first_name} ${state.employee.last_name}`.toLowerCase().includes(query));
  }, [workforce, search, filter]);

  const counters: { key: WorkforceFilter; label: string; value: number }[] = [
    { key: "present", label: "Present", value: counts.present },
    { key: "assigned", label: "Assigned", value: counts.assigned },
    { key: "notAssigned", label: "Not Assigned", value: counts.notAssigned },
    { key: "absent", label: "Absent", value: counts.absent },
    { key: "leave", label: "Leave", value: counts.leave },
    { key: "sick", label: "Sick", value: counts.sick },
    { key: "otherUnavailable", label: "Other unavailable", value: counts.otherUnavailable },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn("rounded-md border px-3 py-1.5 text-sm font-medium transition-colors", filter === "all" ? "border-primary bg-primary/5" : "hover:bg-muted")}
        >
          All ({workforce.length})
        </button>
        {counters.map((counter) => (
          <button
            key={counter.key}
            type="button"
            onClick={() => setFilter(filter === counter.key ? "all" : counter.key)}
            className={cn("rounded-md border px-3 py-1.5 text-sm font-medium transition-colors", filter === counter.key ? "border-primary bg-primary/5" : "hover:bg-muted")}
          >
            {counter.label} ({counter.value})
          </button>
        ))}
      </div>

      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search employees…" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" aria-label="Search employees" />
      </div>

      <div className="flex flex-col divide-y rounded-lg border">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No employees found.</p>
        ) : (
          filtered.map((state) => (
            <button
              key={state.employee.id}
              type="button"
              disabled={!canManage}
              onClick={() => canManage && setEditingEmployeeId(state.employee.id)}
              className="flex w-full items-center justify-between gap-2 p-3 text-left transition-colors enabled:hover:bg-muted/40 disabled:cursor-default"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {state.employee.first_name} {state.employee.last_name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {state.assignedTeam ? state.assignedTeam.name : employeeIsAvailableForAssignment(state) ? "Not assigned" : "No team"}
                </span>
              </div>
              <StatusBadge tone={dailyAttendanceStatusTone(state.attendanceStatus)}>{DAILY_ATTENDANCE_STATUS_LABELS[state.attendanceStatus as DailyAttendanceStatus]}</StatusBadge>
            </button>
          ))
        )}
      </div>

      {canManage && (
        <WorkforceStatusDialog companyId={companyId} projectId={projectId} workDate={workDate} state={editingState} onOpenChange={(open) => !open && setEditingEmployeeId(null)} />
      )}
    </div>
  );
}
