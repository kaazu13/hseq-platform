import type { Database, Enums } from "@/types/database";
import type { BasicEmployee } from "@/modules/daily-workforce/types";

/**
 * Worked Hours — see supabase/migrations/20260813090000_worked_hours.sql.
 * Deliberately separate from the Daily Workforce / Today's Teams domain
 * (see that migration's header comment): Today's Teams answers "where and
 * with whom," Worked Hours answers "how many hours credited" — the two
 * lifecycles never gate each other.
 */
export type WorkedHours = Database["public"]["Tables"]["worked_hours"]["Row"];
export type WorkedHoursCorrection = Database["public"]["Tables"]["worked_hours_corrections"]["Row"];
export type WorkedHoursDiscrepancy = Database["public"]["Tables"]["worked_hours_discrepancies"]["Row"];
export type AppNotification = Database["public"]["Tables"]["notifications"]["Row"];

export type WorkedHoursStatus = Enums<"worked_hours_status">;
export type WorkedHoursDiscrepancyStatus = Enums<"worked_hours_discrepancy_status">;

export const WORKED_HOURS_STATUSES: WorkedHoursStatus[] = ["draft", "submitted"];

export const WORKED_HOURS_STATUS_LABELS: Record<WorkedHoursStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
};

export const WORKED_HOURS_DISCREPANCY_STATUS_LABELS: Record<WorkedHoursDiscrepancyStatus, string> = {
  open: "Open",
  accepted: "Accepted",
  rejected: "Rejected",
};

/** One employee's worked-hours row for a date, resolved with their display name — the Worked Hours day view's row shape. */
export type WorkedHoursWithEmployee = WorkedHours & {
  employee: BasicEmployee;
};

/** worked_hours bounds, mirroring the database's worked_hours_bounds check constraint — validated client-side first, enforced server-side regardless. */
export const WORKED_HOURS_MIN = 0;
export const WORKED_HOURS_MAX = 24;

/** One employee's full month of worked hours — the Worked Hours "This Month" view's row shape, dates keyed by ISO ('YYYY-MM-DD'). */
export type MonthlyWorkedHoursRow = {
  employee: BasicEmployee;
  hoursByDate: Record<string, number>;
  totalHours: number;
};
