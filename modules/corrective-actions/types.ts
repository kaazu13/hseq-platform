import type { Database, Enums } from "@/types/database";

/**
 * Corrective Actions — one safety observation may have many. See
 * supabase/migrations/20260802120000_safety_observations_and_corrective_actions.sql
 * and docs/DATABASE_SCHEMA.md §6 (`corrective_actions`).
 */
export type CorrectiveAction = Database["public"]["Tables"]["corrective_actions"]["Row"];

export type CorrectiveActionStatus = Enums<"corrective_action_status">;
export type CorrectiveActionPriority = Enums<"corrective_action_priority">;

export const CORRECTIVE_ACTION_STATUSES: CorrectiveActionStatus[] = ["open", "in_progress", "awaiting_verification", "closed", "rejected"];

export const CORRECTIVE_ACTION_STATUS_LABELS: Record<CorrectiveActionStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  awaiting_verification: "Awaiting verification",
  closed: "Closed",
  rejected: "Rejected",
};

/** Statuses that count as "unresolved" — matches assert_no_unresolved_corrective_actions() in the migration exactly; the parent observation cannot close while any action is in one of these. */
export const UNRESOLVED_CORRECTIVE_ACTION_STATUSES: CorrectiveActionStatus[] = ["open", "in_progress", "awaiting_verification"];

export const CORRECTIVE_ACTION_PRIORITIES: CorrectiveActionPriority[] = ["low", "medium", "high", "critical"];

export const CORRECTIVE_ACTION_PRIORITY_LABELS: Record<CorrectiveActionPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/**
 * "Overdue" is NOT a stored column (this milestone's explicit requirement:
 * "must be derived consistently rather than manually assigned") — this is
 * the ONE place that derivation is defined; every query/UI that needs it
 * calls this function rather than re-deriving the same boolean inline. See
 * corrective_actions' table comment in the migration for the matching
 * database-side documentation (there is deliberately no SQL function
 * mirroring this — every count that needs it is expressible as a plain
 * PostgREST filter, see modules/corrective-actions/queries.ts).
 */
export function isCorrectiveActionOverdue(dueDate: string, status: CorrectiveActionStatus): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today && status !== "closed" && status !== "rejected";
}

/**
 * True if any of `actions` is unresolved — mirrors
 * assert_no_unresolved_corrective_actions() in the migration exactly
 * (same UNRESOLVED_CORRECTIVE_ACTION_STATUSES set). Used by
 * app/(app)/observations/[observationId]/page.tsx to proactively disable/
 * explain the Close button rather than only surfacing the database's
 * rejection after the fact — the database trigger remains the actual
 * authority (this is a UX convenience, same trust boundary as every other
 * permissions.ts-style check in this codebase, not a substitute for it).
 */
export function hasUnresolvedCorrectiveActions(actions: Pick<CorrectiveAction, "status">[]): boolean {
  return actions.some((action) => UNRESOLVED_CORRECTIVE_ACTION_STATUSES.includes(action.status));
}

/**
 * The narrow, approved column set `get_basic_employee_info()` returns —
 * see modules/lmra/types.ts's identical comment for why this is derived
 * from the RPC's own return shape, never a raw `employees` select.
 */
export type BasicEmployee = Database["public"]["Functions"]["get_basic_employee_info"]["Returns"][number];

/** One corrective action with its responsible person resolved. */
export type CorrectiveActionDetail = CorrectiveAction & {
  responsiblePerson: BasicEmployee | null;
};

/** The human-readable reference shown on the PDF/shared report — same "derive from the record's own id" convention as modules/lmra/types.ts's formatLmraReference(). */
export function formatCorrectiveActionReference(action: Pick<CorrectiveAction, "id">): string {
  return `CA-${action.id.slice(0, 8).toUpperCase()}`;
}
