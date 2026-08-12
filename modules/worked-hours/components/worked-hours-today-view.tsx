"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { WorkedHoursTable } from "@/modules/worked-hours/components/worked-hours-table";
import { WorkedHoursMobileList } from "@/modules/worked-hours/components/worked-hours-mobile-list";
import type { WorkedHoursWithEmployee } from "@/modules/worked-hours/types";
import type { BasicEmployee, DailyAttendanceStatus } from "@/modules/daily-workforce/types";
import { DAILY_ATTENDANCE_STATUS_LABELS, dailyAttendancePermitsWork } from "@/modules/daily-workforce/types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type WorkedHoursTodayRow = { employee: BasicEmployee; workedHours: WorkedHoursWithEmployee | null; attendanceStatus: DailyAttendanceStatus };

type StatusFilter = "all" | "missing" | "entered" | "submitted" | "unavailable";

/** Item 2: search + status filter bar over the compact table/mobile-list pair — "All / Missing Hours / Entered / Submitted / Absent (unavailable)". */
export function WorkedHoursTodayView({ companyId, projectId, workDate, rows, canManage }: { companyId: string; projectId: string; workDate: string; rows: WorkedHoursTodayRow[]; canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

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
      .filter((row) => !query || `${row.employee.first_name} ${row.employee.last_name}`.toLowerCase().includes(query));
  }, [rows, search, filter]);

  const tableRows = filtered.map((row) => ({
    employee: row.employee,
    workedHours: row.workedHours,
    disabledReason: dailyAttendancePermitsWork(row.attendanceStatus) ? undefined : `Marked ${DAILY_ATTENDANCE_STATUS_LABELS[row.attendanceStatus]} — hours locked at 0`,
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
