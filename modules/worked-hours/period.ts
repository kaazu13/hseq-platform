/**
 * Worked Hours export period resolution (Phase 5) — exactly three modes,
 * always resolved from project-local/user-local CALENDAR dates (never
 * timestamps), using UTC date arithmetic throughout so the resolution is
 * never locale/timezone-dependent — the same `${value}T00:00:00Z` anchoring
 * convention already used everywhere else in this codebase for a plain
 * `date` column (e.g. app/(app)/lmra/[lmraId]/page.tsx's formatDate()).
 * Deliberately its own module (no "use client", no React) so both the
 * server export route and the client dialog's live preview call the exact
 * same resolution logic — never two divergent implementations of "what
 * week does this date fall in."
 */
export type WorkedHoursPeriodMode = "day" | "week" | "month";

export type WorkedHoursPeriod = {
  mode: WorkedHoursPeriodMode;
  /** Inclusive, ISO 'YYYY-MM-DD'. */
  fromDate: string;
  /** Inclusive, ISO 'YYYY-MM-DD'. */
  toDate: string;
};

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Monday of the ISO week containing `date` — ALWAYS Monday-start, never the locale-dependent Sunday-start `Date` arithmetic would otherwise produce. */
function startOfIsoWeek(date: Date): Date {
  const day = date.getUTCDay(); // Sunday = 0 .. Saturday = 6
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() + mondayOffset);
  return monday;
}

/** Resolves a period mode + any reference date within it to its concrete [fromDate, toDate] bounds. Day: the exact date. Week: Monday through Sunday of the week `referenceDate` falls in. Month: the 1st through the last calendar day of `referenceDate`'s month. */
export function resolveWorkedHoursPeriod(mode: WorkedHoursPeriodMode, referenceDate: string): WorkedHoursPeriod {
  const ref = toUtcDate(referenceDate);

  if (mode === "day") {
    return { mode, fromDate: referenceDate, toDate: referenceDate };
  }

  if (mode === "week") {
    const monday = startOfIsoWeek(ref);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { mode, fromDate: toIsoDate(monday), toDate: toIsoDate(sunday) };
  }

  const firstDay = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  const lastDay = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0));
  return { mode: "month", fromDate: toIsoDate(firstDay), toDate: toIsoDate(lastDay) };
}

/** Every calendar date in [fromDate, toDate], inclusive — the matrix export's date columns. Never produces a date outside the resolved period. */
export function listPeriodDates(period: WorkedHoursPeriod): string[] {
  const dates: string[] = [];
  const cursor = toUtcDate(period.fromDate);
  const end = toUtcDate(period.toDate);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function formatDisplayDate(value: string): string {
  return toUtcDate(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Human-readable period label — "10 Aug 2026" (day) or "10 Aug 2026 – 16 Aug 2026" (week/month), matching the milestone's explicit examples. */
export function formatWorkedHoursPeriodLabel(period: WorkedHoursPeriod): string {
  if (period.mode === "day") return formatDisplayDate(period.fromDate);
  return `${formatDisplayDate(period.fromDate)} – ${formatDisplayDate(period.toDate)}`;
}

/** ISO-8601 week number (1-53) + its ISO week-year for the week containing `date` — used only for the export filename ("Week 33 - 2026"), never for period resolution itself (that's startOfIsoWeek()/resolveWorkedHoursPeriod() above). Standard "nearest Thursday" ISO week algorithm. */
export function getIsoWeekNumber(date: Date): { week: number; weekYear: number } {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7; // Monday = 0 .. Sunday = 6
  target.setUTCDate(target.getUTCDate() - dayNumber + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstThursdayDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNumber + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return { week, weekYear: target.getUTCFullYear() };
}

/** Count of dates with recorded hours > 0 in a pivoted hoursByDate map — the "Days worked" figure on the Employee Dashboard and the Worked Hours matrix export. Callers must already have the map scoped to the intended period (e.g. via listWorkedHoursForPeriod) — this simply counts, it doesn't itself filter by date range. */
export function countDaysWorked(hoursByDate: Record<string, number>): number {
  return Object.values(hoursByDate).filter((hours) => hours > 0).length;
}

function sanitizeForFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Deterministic, readable .xlsx filename — matches the milestone's exact examples: "{Project} - Worked Hours - 2026-08-10.xlsx" (day), "{Project} - Worked Hours - Week 33 - 2026.xlsx" (week), "{Project} - Worked Hours - August 2026.xlsx" (month). */
export function buildWorkedHoursFilename(projectName: string, period: WorkedHoursPeriod): string {
  const project = sanitizeForFilename(projectName) || "Project";

  if (period.mode === "day") {
    return `${project} - Worked Hours - ${period.fromDate}.xlsx`;
  }

  if (period.mode === "week") {
    const { week, weekYear } = getIsoWeekNumber(toUtcDate(period.fromDate));
    return `${project} - Worked Hours - Week ${week} - ${weekYear}.xlsx`;
  }

  const monthLabel = toUtcDate(period.fromDate).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return `${project} - Worked Hours - ${monthLabel}.xlsx`;
}
