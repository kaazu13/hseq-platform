import type { ScaffoldStatus } from "./types";
import type { ScaffoldInspectionOverviewRow } from "./types";

/**
 * The ONE shared inspection-health classifier — Parts I/J/K/X's explicit
 * "do not mix status logic independently between Dashboard and Map, use
 * one shared resolver" requirement. Pure string/date-string math only, no
 * `Date` timezone reads — `expiresAt` is stored (by
 * validate_scaffold_inspection_update() in the DB) as UTC-midnight of the
 * scaffold's PROJECT-LOCAL due date, so `.slice(0, 10)` always recovers
 * the correct calendar date regardless of the reader's own timezone, and
 * `projectTodayDate` comes from lib/project-date.ts's getProjectLocalDate()
 * — never the browser/server's ambient clock. This is what makes "Due
 * Today"/"Tomorrow" correct even when the caller viewing the dashboard is
 * in a different timezone than the project itself (Part AH).
 */
export type InspectionHealthState = "dismantled" | "awaiting_initial" | "expired" | "due_today" | "expiring_tomorrow" | "valid";

export function addDaysToDateString(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function resolveInspectionHealth(status: ScaffoldStatus, currentInspectionExpiresAt: string | null, projectTodayDate: string): InspectionHealthState {
  if (status === "closed") return "dismantled";
  if (status === "pending_inspection" || !currentInspectionExpiresAt) return "awaiting_initial";

  const dueDate = currentInspectionExpiresAt.slice(0, 10);
  const tomorrow = addDaysToDateString(projectTodayDate, 1);

  if (dueDate < projectTodayDate) return "expired";
  if (dueDate === projectTodayDate) return "due_today";
  if (dueDate === tomorrow) return "expiring_tomorrow";
  return "valid";
}

/** Health-chart bucket — Part J groups `expired` and `due_today` under one RED slice; `dismantled` is excluded from the chart entirely by default (Part I/J). */
export type InspectionHealthBucket = "green" | "orange" | "red" | "gray";

export function healthStateToChartBucket(state: InspectionHealthState): InspectionHealthBucket | null {
  switch (state) {
    case "valid":
      return "green";
    case "expiring_tomorrow":
      return "orange";
    case "expired":
    case "due_today":
      return "red";
    case "awaiting_initial":
      return "gray";
    case "dismantled":
      return null;
  }
}

/** Priority list rows are bounded (Part AE: "no unbounded lists") — a generous cap, high enough that no realistic single project's priority queue is ever silently cut off. Callers can compare the original vs. sliced array length to detect truncation. */
export const PRIORITY_LIST_MAX_ROWS = 50;

/**
 * The ONE place KPI counts, chart buckets, and priority-list membership
 * are derived — computed entirely in TypeScript from a SINGLE aggregate
 * query's result (modules/scaffolds/queries.ts's
 * getScaffoldInspectionOverview()), never a second independent DB scan
 * (Part J/AE). Dismantled/archived scaffolds are excluded from the
 * chart/priority lists by default but still counted in the KPI totals
 * (Part I: "should not count in operational inspection health unless
 * specifically displayed as historical totals" — dismantledArchived IS
 * that historical total).
 */
export function computeInspectionDashboardAggregate(
  rows: ScaffoldInspectionOverviewRow[],
  projectTodayDate: string,
): {
  totalScaffoldsCreated: number;
  activeScaffolds: number;
  dismantledArchived: number;
  currentlyValid: number;
  expiredOrDueToday: number;
  expiringTomorrow: number;
  awaitingInitialInspection: number;
  chartSlices: { bucket: InspectionHealthBucket; count: number }[];
  awaitingInitialRows: ScaffoldInspectionOverviewRow[];
  expiredOrDueTodayRows: ScaffoldInspectionOverviewRow[];
  expiringTomorrowRows: ScaffoldInspectionOverviewRow[];
} {
  const active: { row: ScaffoldInspectionOverviewRow; state: InspectionHealthState }[] = [];
  let dismantledArchived = 0;

  for (const row of rows) {
    const state = resolveInspectionHealth(row.status, row.latestExpiresAt, projectTodayDate);
    if (state === "dismantled") {
      dismantledArchived++;
    } else {
      active.push({ row, state });
    }
  }

  const byState = (state: InspectionHealthState) => active.filter((entry) => entry.state === state);
  const currentlyValid = byState("valid").length;
  const awaitingInitial = byState("awaiting_initial");
  const expiredOrDueToday = [...byState("expired"), ...byState("due_today")];
  const expiringTomorrow = byState("expiring_tomorrow");

  const chartSlices: { bucket: InspectionHealthBucket; count: number }[] = [
    { bucket: "green", count: currentlyValid },
    { bucket: "orange", count: expiringTomorrow.length },
    { bucket: "red", count: expiredOrDueToday.length },
    { bucket: "gray", count: awaitingInitial.length },
  ];

  return {
    totalScaffoldsCreated: rows.length,
    activeScaffolds: active.length,
    dismantledArchived,
    currentlyValid,
    expiredOrDueToday: expiredOrDueToday.length,
    expiringTomorrow: expiringTomorrow.length,
    awaitingInitialInspection: awaitingInitial.length,
    chartSlices,
    awaitingInitialRows: awaitingInitial.slice(0, PRIORITY_LIST_MAX_ROWS).map((e) => e.row),
    expiredOrDueTodayRows: expiredOrDueToday.slice(0, PRIORITY_LIST_MAX_ROWS).map((e) => e.row),
    expiringTomorrowRows: expiringTomorrow.slice(0, PRIORITY_LIST_MAX_ROWS).map((e) => e.row),
  };
}
