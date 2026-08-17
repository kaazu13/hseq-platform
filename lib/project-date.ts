/**
 * Task 3 Part 15 — project-local "today," distinct from event timestamps
 * (created_at/updated_at/etc, which always stay real UTC instants — this
 * only affects which CALENDAR DATE a day-scoped operational record
 * (Today's Teams, attendance, worked hours, LMRA default date, scaffold
 * erection default, daily locking, team-copy defaults) is considered to
 * belong to). Falls back to server-local (UTC) when the project has no
 * timezone set, matching the pre-existing behavior exactly — this is
 * additive, never a regression for a project that hasn't configured one.
 */
export function getProjectLocalDate(timezone: string | null | undefined, reference: Date = new Date()): string {
  if (!timezone) {
    return reference.toISOString().slice(0, 10);
  }
  try {
    // en-CA formats as YYYY-MM-DD, exactly the format every "today" call
    // site here already expects (matches toISOString().slice(0, 10)'s shape).
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(reference);
  } catch {
    return reference.toISOString().slice(0, 10);
  }
}
