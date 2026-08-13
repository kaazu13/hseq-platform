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
export type WorkedHoursBreakdown = Database["public"]["Tables"]["worked_hours_breakdown"]["Row"];
export type WorkedHoursCorrection = Database["public"]["Tables"]["worked_hours_corrections"]["Row"];
export type WorkedHoursDiscrepancy = Database["public"]["Tables"]["worked_hours_discrepancies"]["Row"];
export type AppNotification = Database["public"]["Tables"]["notifications"]["Row"];

export type WorkedHoursStatus = Enums<"worked_hours_status">;
export type WorkedHoursDiscrepancyStatus = Enums<"worked_hours_discrepancy_status">;

/**
 * Worked Hours V2 (Operational Quality milestone, Phase 1) — controlled
 * hour categories, replacing the single generic total. worked_hours.hours
 * itself is now a DERIVED sum of these categories (kept in sync by
 * sync_worked_hours_total()'s trigger — see
 * supabase/migrations/20260819091000_worked_hours_categories.sql) — every
 * existing total-only reader keeps working unchanged.
 */
export type WorkedHoursCategory = Enums<"worked_hours_category">;

export const WORKED_HOURS_CATEGORIES: WorkedHoursCategory[] = ["regular", "overtime", "night", "travel", "other"];

export const WORKED_HOURS_CATEGORY_LABELS: Record<WorkedHoursCategory, string> = {
  regular: "Regular Hours",
  overtime: "Overtime Hours",
  night: "Night Hours",
  travel: "Travel Hours",
  other: "Other Hours",
};

/** Short label for compact table/export headers where "Hours" is already implied by context. */
export const WORKED_HOURS_CATEGORY_SHORT_LABELS: Record<WorkedHoursCategory, string> = {
  regular: "Regular",
  overtime: "Overtime",
  night: "Night",
  travel: "Travel",
  other: "Other",
};

/** A day's full category breakdown, always keyed by every category (0 for any category with no recorded hours) — the shape every category-aware UI/export renders from, so a caller never has to guess whether a category is "missing" vs "zero." */
export type WorkedHoursCategoryBreakdown = Record<WorkedHoursCategory, number>;

/** Sums a set of category rows into a full breakdown (every category present, defaulting to 0). */
export function toWorkedHoursCategoryBreakdown(rows: Pick<WorkedHoursBreakdown, "category" | "hours">[]): WorkedHoursCategoryBreakdown {
  const breakdown = Object.fromEntries(WORKED_HOURS_CATEGORIES.map((category) => [category, 0])) as WorkedHoursCategoryBreakdown;
  for (const row of rows) breakdown[row.category] = Number(row.hours);
  return breakdown;
}

/** Sum across every category in a breakdown — the day's grand total, mirroring sync_worked_hours_total()'s own sum so the UI never has to trust a possibly-stale worked_hours.hours value when it already has the live breakdown in hand. */
export function sumWorkedHoursCategoryBreakdown(breakdown: WorkedHoursCategoryBreakdown): number {
  return WORKED_HOURS_CATEGORIES.reduce((sum, category) => sum + breakdown[category], 0);
}

export const WORKED_HOURS_STATUSES: WorkedHoursStatus[] = ["draft", "submitted"];

export const WORKED_HOURS_STATUS_LABELS: Record<WorkedHoursStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
};

/** Item 5: `open` displays as "In Review" — the raw enum value ("Open") read as unclear/inactive to both employees and managers; the actual state is "management is reviewing this," which "In Review" says directly. The underlying DB value stays `open` — only the label changes (docs/API_CONVENTIONS.md's "internal values remain unchanged unless a real schema change is necessary"). */
export const WORKED_HOURS_DISCREPANCY_STATUS_LABELS: Record<WorkedHoursDiscrepancyStatus, string> = {
  open: "In Review",
  accepted: "Accepted",
  rejected: "Rejected",
};

/** One employee's worked-hours row for a date, resolved with their display name and full category breakdown — the Worked Hours day view's row shape. */
export type WorkedHoursWithEmployee = WorkedHours & {
  employee: BasicEmployee;
  breakdown: WorkedHoursCategoryBreakdown;
};

/** worked_hours bounds, mirroring the database's worked_hours_bounds check constraint — validated client-side first, enforced server-side regardless. */
export const WORKED_HOURS_MIN = 0;
export const WORKED_HOURS_MAX = 24;

/** One employee's worked hours across a multi-day period (week/month view or export) — the "This Month" view's and the Week/Month matrix export's shared row shape, dates keyed by ISO ('YYYY-MM-DD'). `categoryTotals` sums each category across every date in the period (Phase 3's per-category export totals); `totalHours` is the grand total across all categories and dates. */
export type WorkedHoursMatrixRow = {
  employee: BasicEmployee;
  hoursByDate: Record<string, number>;
  categoryTotals: WorkedHoursCategoryBreakdown;
  totalHours: number;
};

/** Worked Hours export employee scope (Phase 6) — always resolved server-side against the selected company/project, never trusted from the client beyond which mode was picked. */
export type WorkedHoursEmployeeScope = "all_workers" | "hours_only" | "selected";

export const WORKED_HOURS_EMPLOYEE_SCOPES: WorkedHoursEmployeeScope[] = ["all_workers", "hours_only", "selected"];

export const WORKED_HOURS_EMPLOYEE_SCOPE_LABELS: Record<WorkedHoursEmployeeScope, string> = {
  all_workers: "All project workers",
  hours_only: "Workers with recorded hours only",
  selected: "Selected workers",
};
