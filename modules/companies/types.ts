import type { Database } from "@/types/database";

/**
 * Friendly domain aliases over the generated-shape Database type — this is
 * the layer application code actually imports (docs/ARCHITECTURE.md §4:
 * "modules/companies/" holds this domain's types alongside its query/
 * mutation logic).
 */
export type Company = Database["public"]["Tables"]["companies"]["Row"];

/**
 * The subset of `Company` columns actually selected/rendered by the
 * app shell (company switcher, dashboard) — see modules/companies/queries.ts.
 * A narrower type than `Company` so those queries don't need to
 * over-select columns just to satisfy a prop type.
 */
export type CompanySummary = Pick<Company, "id" | "name" | "slug" | "status">;
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type CompanyMembership = Database["public"]["Tables"]["company_memberships"]["Row"];
export type Role = Database["public"]["Tables"]["roles"]["Row"];
export type MembershipRole = Database["public"]["Tables"]["membership_roles"]["Row"];
export type AuditEvent = Database["public"]["Tables"]["audit_events"]["Row"];

/**
 * The fixed v1 role catalogue (docs/ROLES_AND_PERMISSIONS.md §1), matching
 * exactly what supabase/seed.sql inserts into the `roles` table.
 *
 * This is a compile-time convenience for callers of requireRole() —
 * nothing more. The actual authorization decision always comes from a live
 * database check (the has_company_role() SQL function, via
 * lib/auth/session.ts) against the real `roles`/`membership_roles` tables,
 * never from this list in isolation. If the seeded catalogue and this list
 * ever drift, the database check is what's authoritative.
 */
export const ROLE_NAMES = [
  "platform_super_admin",
  "company_admin",
  "operations_manager",
  "project_manager",
  "hseq_manager",
  "hse_officer",
  "foreman",
  "inspector",
  "recruiter",
  "planner",
  "employee",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];
