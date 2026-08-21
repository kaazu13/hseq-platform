"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { WorkedHoursTable } from "@/modules/worked-hours/components/worked-hours-table";
import { WorkedHoursMobileList } from "@/modules/worked-hours/components/worked-hours-mobile-list";
import type { WorkedHoursWithEmployee } from "@/modules/worked-hours/types";
import type { BasicEmployee, DailyAttendanceStatus } from "@/modules/daily-workforce/types";
import { DAILY_ATTENDANCE_STATUS_LABELS, dailyAttendancePermitsWork } from "@/modules/daily-workforce/types";
import type { RoleName } from "@/modules/companies/types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type WorkedHoursTodayRow = { employee: BasicEmployee; workedHours: WorkedHoursWithEmployee | null; attendanceStatus: DailyAttendanceStatus; correctionCount?: number; roleNames: RoleName[] };

type StatusFilter = "all" | "missing" | "entered" | "submitted" | "unavailable";

/**
 * Part 2/21's UI-only grouping (never a new authorization tier): reuses
 * the SAME management-only-role signal already established for the
 * Today's Team assignment rule (an employee whose ONLY company roles are
 * platform_super_admin/company_admin/project_manager/planner) — this
 * codebase has no separate employee "job classification" column to
 * inspect, so the existing role model IS the classification signal,
 * consistent with every other place this session already draws the same
 * line. Anyone holding an operational role too (even alongside a
 * management one) is "operational."
 */
const MANAGEMENT_ONLY_ROLES: RoleName[] = ["platform_super_admin", "company_admin", "project_manager", "planner"];
function isManagementRow(roleNames: RoleName[]): boolean {
  return roleNames.length > 0 && roleNames.every((role) => MANAGEMENT_ONLY_ROLES.includes(role));
}
type GroupFilter = "all" | "operational" | "management";

/** Item 2: search + status filter bar over the compact table/mobile-list pair — "All / Missing Hours / Entered / Submitted / Absent (unavailable)". */
export function WorkedHoursTodayView({ companyId, projectId, workDate, rows, canManage }: { companyId: string; projectId: string; workDate: string; rows: WorkedHoursTodayRow[]; canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        switch (filter) {
          case "missing":
            return !row.workedHours || row.workedHours.status !== "submitted";
          case "entered":
            return row.workedHours && row.workedHours.status === "draft";
          case "submitted":
            return row.workedHours?.status === "submitted";
          case "unavailable":
            return !dailyAttendancePermitsWork(row.attendanceStatus);
          case "all":
            return true;
        }
      })
      .filter((row) => {
        if (groupFilter === "operational") return !isManagementRow(row.roleNames);
        if (groupFilter === "management") return isManagementRow(row.roleNames);
        return true;
      })
      .filter((row) => !query || `${row.employee.first_name} ${row.employee.last_name}`.toLowerCase().includes(query));
  }, [rows, search, filter, groupFilter]);

  const tableRows = filtered.map((row) => ({
    employee: row.employee,
    workedHours: row.workedHours,
    disabledReason: dailyAttendancePermitsWork(row.attendanceStatus) ? undefined : `Marked ${DAILY_ATTENDANCE_STATUS_LABELS[row.attendanceStatus]} — hours locked at 0`,
    correctionCount: row.correctionCount,
  }));

  const filters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "missing", label: "Missing Hours" },
    { key: "entered", label: "Entered" },
    { key: "submitted", label: "Submitted" },
    { key: "unavailable", label: "Absent / unavailable" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search employee…" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" aria-label="Search employee" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {filters.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={cn("rounded-md border px-2.5 py-1 text-xs font-medium transition-colors", filter === option.key ? "border-primary bg-primary/5" : "hover:bg-muted")}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Part 2/21 — a separate, orthogonal grouping filter (never a second query): keeps management/administration accounts out of the default scaffold-worker hour-entry list. */}
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { key: "all", label: "All" },
            { key: "operational", label: "Operational workers" },
            { key: "management", label: "Management / Administration" },
          ] as const
        ).map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setGroupFilter(option.key)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              groupFilter === option.key ? "border-primary bg-primary/10 text-foreground" : "border-transparent text-muted-foreground hover:bg-muted",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">No employees match this filter.</p>
      ) : (
        <>
          <WorkedHoursTable companyId={companyId} projectId={projectId} workDate={workDate} rows={tableRows} canManage={canManage} />
          <WorkedHoursMobileList companyId={companyId} projectId={projectId} workDate={workDate} rows={tableRows} canManage={canManage} />
        </>
      )}
    </div>
  );
}
