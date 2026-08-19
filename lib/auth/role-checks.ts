import type { RoleName } from "@/modules/companies/types";

/**
 * Pure role-list helpers with no server-only I/O — split out from
 * lib/auth/session.ts (which imports the `server-only` guard, making it
 * unimportable from a plain Vitest unit test) specifically so this one
 * function can be unit-tested directly. Re-exported from session.ts so
 * every existing `@/lib/auth/session` import keeps working unchanged.
 */

/**
 * True if the caller holds no company role beyond the plain worker-facing
 * `employee` role (including holding no role at all — same treatment,
 * since a bare project member with zero roles has no elevated access
 * either). Used to gate the small set of pages/aggregates that are
 * deliberately management-only and must never be reachable by a plain
 * Employee, even by direct URL (Employee-role correction milestone) —
 * `false` for anyone who ALSO holds a second, elevated role alongside
 * `employee`, so a genuinely multi-role account is never wrongly narrowed.
 * Deliberately narrower than "not employee" — this task is scoped to
 * Employee only and must never change behavior for any other role.
 */
export function isEmployeeOnlyAccount(roleNames: RoleName[]): boolean {
  return roleNames.length === 0 || roleNames.every((role) => role === "employee");
}

/**
 * Inspector role correction (manual role testing) — same shape as
 * isEmployeeOnlyAccount() above, extended to also treat a plain Inspector
 * (or an Employee+Inspector combo, still no OTHER role) as lacking access
 * to the small set of management-only surfaces Inspector was wrongly
 * reaching: the Equipment management screen (redirects to My Equipment,
 * same treatment as Employee) and Safety Overview (forbidden, same
 * treatment as Employee). `false` for anyone who ALSO holds a genuine
 * management/broad role alongside employee/inspector, so a multi-role
 * account is never wrongly narrowed — same "never infer broad access
 * denial from role name alone" principle as isEmployeeOnlyAccount().
 */
export function isEmployeeOrInspectorOnlyAccount(roleNames: RoleName[]): boolean {
  return roleNames.length === 0 || roleNames.every((role) => role === "employee" || role === "inspector");
}
