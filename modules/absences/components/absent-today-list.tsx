import { DAILY_ATTENDANCE_STATUS_LABELS } from "@/modules/daily-workforce/types";
import type { AbsentTodayRow } from "@/modules/absences/types";
import { Badge } from "@/components/ui/badge";

/** Every currently-rostered employee whose status doesn't permit work — read-only list; corrections happen via MarkAbsentDialog / the reports review below, keeping one write path (Phase 4). */
export function AbsentTodayList({ rows }: { rows: AbsentTodayRow[] }) {
  if (rows.length === 0) {
    return <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">No one is marked absent for this day.</p>;
  }

  return (
    <div className="flex flex-col divide-y rounded-lg border">
      {rows.map((row) => (
        <div key={row.employee.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">
              {row.employee.first_name} {row.employee.last_name}
            </span>
            {row.note && <span className="truncate text-xs text-muted-foreground">{row.note}</span>}
          </div>
          <Badge className="bg-destructive/10 text-destructive dark:bg-destructive/20">{DAILY_ATTENDANCE_STATUS_LABELS[row.status]}</Badge>
        </div>
      ))}
    </div>
  );
}
