import type { Database, Enums } from "@/types/database";

/**
 * Scaffold Defects — one scaffold inspection may raise many, optionally
 * tied to a specific checklist row. See
 * supabase/migrations/20260803120000_scaffold_inspections.sql. Mirrors
 * modules/corrective-actions/types.ts's shape closely (same status
 * machine, same overdue-derivation principle) — see that migration's
 * header comment for why this is a dedicated table rather than a reuse
 * of `corrective_actions`.
 */
export type ScaffoldDefect = Database["public"]["Tables"]["scaffold_defects"]["Row"];

export type ScaffoldDefectStatus = Enums<"scaffold_defect_status">;
export type ScaffoldDefectSeverity = Enums<"scaffold_defect_severity">;

export const SCAFFOLD_DEFECT_STATUSES: ScaffoldDefectStatus[] = ["open", "in_progress", "awaiting_verification", "closed", "rejected"];

export const SCAFFOLD_DEFECT_STATUS_LABELS: Record<ScaffoldDefectStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  awaiting_verification: "Awaiting verification",
  closed: "Closed",
  rejected: "Rejected",
};

/** Statuses that count as "unresolved" — mirrors assert used inside validate_scaffold_inspection_update()'s unresolved-defect count exactly; an inspection cannot finalize as safe_for_use while any defect is in one of these. */
export const UNRESOLVED_SCAFFOLD_DEFECT_STATUSES: ScaffoldDefectStatus[] = ["open", "in_progress", "awaiting_verification"];

export const SCAFFOLD_DEFECT_SEVERITIES: ScaffoldDefectSeverity[] = ["low", "medium", "high", "critical"];

export const SCAFFOLD_DEFECT_SEVERITY_LABELS: Record<ScaffoldDefectSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/**
 * "Overdue" is NOT a stored column — this milestone's explicit
 * requirement, same principle as modules/corrective-actions/types.ts's
 * isCorrectiveActionOverdue(). The ONE place this derivation is defined.
 */
export function isScaffoldDefectOverdue(dueDate: string, status: ScaffoldDefectStatus): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today && status !== "closed" && status !== "rejected";
}

/**
 * True if any of `defects` is unresolved — mirrors the unresolved-defect
 * count inside validate_scaffold_inspection_update() exactly (same
 * UNRESOLVED_SCAFFOLD_DEFECT_STATUSES set). Used by
 * modules/scaffolds/components/inspection-finalize-card.tsx to
 * proactively disable the "safe for use" outcome rather than only
 * surfacing the database's rejection after the fact — the database
 * remains the actual authority (this is a UX convenience, same trust
 * boundary as every other permissions.ts-style check in this codebase).
 */
export function hasUnresolvedScaffoldDefects(defects: Pick<ScaffoldDefect, "status">[]): boolean {
  return defects.some((defect) => UNRESOLVED_SCAFFOLD_DEFECT_STATUSES.includes(defect.status));
}

/**
 * The narrow, approved column set `get_basic_employee_info()` returns —
 * see modules/lmra/types.ts's identical comment for why this is derived
 * from the RPC's own return shape, never a raw `employees` select.
 */
export type BasicEmployee = Database["public"]["Functions"]["get_basic_employee_info"]["Returns"][number];

/** One defect with its responsible person resolved. */
export type ScaffoldDefectDetail = ScaffoldDefect & {
  responsiblePerson: BasicEmployee | null;
};
