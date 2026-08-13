/**
 * Item 12: one centralized semantic status-color convention, independent
 * of the user's chosen accent theme (Phase 18's `--primary`/`--sidebar-*`
 * tokens never touch these — they are, and always were, literal Tailwind
 * color utility classes, same as every existing status badge in this
 * codebase already used before accent theming existed). Selecting an
 * Orange accent theme must never make "Approved" orange.
 *
 * GREEN = positive/successful/completed/accepted. ORANGE = attention/
 * pending/in-progress. RED = negative/failed/problem. GRAY = neutral/
 * inactive. BLUE = informational/navigation/selection.
 *
 * Deliberately a SMALL, centralized helper (5 tone classes + a badge
 * wrapper), not a full retroactive rewrite of every existing status badge
 * in the app — "do not perform a dangerous entire-codebase visual rewrite
 * if a smaller centralized helper can solve it." New/redesigned
 * components in this milestone (Workforce, Absent Today, Worked Hours
 * Today, Today's Team LMRA badge) use it directly; older call sites keep
 * their existing inline classes untouched for now.
 */
export type SemanticTone = "positive" | "attention" | "negative" | "neutral" | "info";

export const SEMANTIC_TONE_BADGE_CLASSES: Record<SemanticTone, string> = {
  positive: "bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
  attention: "bg-amber-500/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  negative: "bg-red-500/15 text-red-800 dark:bg-red-500/20 dark:text-red-300",
  neutral: "bg-muted text-muted-foreground",
  info: "bg-blue-500/15 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",
};

export const SEMANTIC_TONE_TEXT_CLASSES: Record<SemanticTone, string> = {
  positive: "text-emerald-700 dark:text-emerald-400",
  attention: "text-amber-700 dark:text-amber-400",
  negative: "text-red-700 dark:text-red-400",
  neutral: "text-muted-foreground",
  info: "text-blue-700 dark:text-blue-400",
};

/**
 * daily_attendance_status -> semantic tone. present/not_set (permits
 * work) = positive; absent = negative (an operational problem for the
 * day); sick/leave = attention (expected, planned unavailability, not a
 * "failure"); training/off_site = neutral (a normal, planned state, not
 * good or bad).
 */
export function dailyAttendanceStatusTone(status: string): SemanticTone {
  switch (status) {
    case "present":
      return "positive";
    case "absent":
      return "negative";
    case "sick":
    case "leave":
      return "attention";
    case "training":
    case "off_site":
      return "neutral";
    default:
      return "neutral";
  }
}

/** worked_hours.status -> semantic tone — submitted (finalized, credited) = positive; draft (entered but not yet finalized) = attention, same "needs follow-up but not itself a failure" treatment as dailyAttendanceStatusTone's sick/leave. */
export function workedHoursStatusTone(status: string): SemanticTone {
  return status === "submitted" ? "positive" : "attention";
}

/** lmra_status -> semantic tone — approved = positive; submitted = attention (awaiting review); rejected = negative; draft/archived = neutral (not yet a decision, or no longer live). */
export function lmraStatusTone(status: string): SemanticTone {
  switch (status) {
    case "approved":
      return "positive";
    case "submitted":
      return "attention";
    case "rejected":
      return "negative";
    default:
      return "neutral";
  }
}

/** worked_hours_discrepancy status -> semantic tone (item 5) — open ("In Review") = attention; accepted = positive; rejected = negative. */
export function workedHoursDiscrepancyStatusTone(status: string): SemanticTone {
  switch (status) {
    case "accepted":
      return "positive";
    case "rejected":
      return "negative";
    default:
      return "attention";
  }
}

/** observation_type -> semantic tone — positive = positive; negative = negative; general = neutral. */
export function observationTypeTone(observationType: string): SemanticTone {
  switch (observationType) {
    case "positive":
      return "positive";
    case "negative":
      return "negative";
    default:
      return "neutral";
  }
}
