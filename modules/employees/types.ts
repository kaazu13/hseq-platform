import type { Database, Enums } from "@/types/database";
import type { RoleName } from "@/modules/companies/types";

/**
 * Employees — company employment records. See docs/DATABASE_SCHEMA.md's
 * `employees` section and docs/PRODUCT_REQUIREMENTS.md for how this
 * relates to `profiles` (login identity) and `company_memberships`
 * (tenant access). This module supports EMPLOYEES ONLY — no generic
 * people/visitor/contractor/external-company concept.
 */
export type Employee = Database["public"]["Tables"]["employees"]["Row"];

// The regenerated types/database.ts (real `supabase gen types` output, see
// its own header) no longer exports these as standalone named types the
// way the old hand-written file did — enum members now only exist inside
// `Database["public"]["Enums"]`. `Enums<...>` is that file's own generated
// helper for pulling one back out.
export type EmploymentStatus = Enums<"employment_status">;
export type EmployeeAccountStatus = Enums<"employee_account_status">;
export type EmploymentEndReason = Enums<"employment_end_reason">;

/**
 * One row of the employment lifecycle timeline — see
 * docs/DATABASE_SCHEMA.md's `employee_employment_periods` section. The
 * single source of truth for employment state; `Employee.employment_status`/
 * `.start_date`/`.end_date` are a synced snapshot derived from these rows,
 * never the other way around.
 */
export type EmploymentPeriod = Database["public"]["Tables"]["employee_employment_periods"]["Row"];

/** The narrow column set the employee list/table actually renders — matches `search_employees()`'s (supabase/migrations/20260726100000_employee_search.sql) generated return shape exactly, so it never drifts from what the RPC actually returns. Never the full `Employee` row. */
export type EmployeeListItem = Database["public"]["Functions"]["search_employees"]["Returns"][number];

export const EMPLOYMENT_STATUSES: EmploymentStatus[] = ["active", "inactive", "on_leave", "terminated"];

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  on_leave: "On leave",
  terminated: "Terminated",
};

export const ACCOUNT_STATUS_LABELS: Record<EmployeeAccountStatus, string> = {
  draft: "Draft",
  invited: "Invited",
  pending_activation: "Pending activation",
  active: "Active",
  suspended: "Suspended",
  archived: "Archived",
};

export const EMPLOYMENT_END_REASONS: EmploymentEndReason[] = [
  "resigned",
  "terminated",
  "layoff",
  "end_of_contract",
  "other",
];

export const EMPLOYMENT_END_REASON_LABELS: Record<EmploymentEndReason, string> = {
  resigned: "Resigned",
  terminated: "Terminated",
  layoff: "Layoff",
  end_of_contract: "End of contract",
  other: "Other",
};

/** Roles a linked employee holds in this company, resolved via company_memberships/membership_roles/roles — never fabricated, empty when there's no linked/active membership. */
export type EmployeeRoleInfo = {
  /** Null when the employee has no `profile_id`, or the linked profile has no membership in this company yet. */
  membershipId: string | null;
  /** `label` is `roles.display_label` — the human-facing name (e.g. "Workforce Coordinator") — always rendered instead of formatting `name` (the stable machine key, e.g. `operations_manager`) for display. */
  roles: { membershipRoleId: string; roleId: string; name: RoleName; label: string }[];
};
