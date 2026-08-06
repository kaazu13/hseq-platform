import { createClient } from "@/lib/supabase/server";
import type { PageSize } from "@/lib/pagination";
import type { Role, RoleName } from "@/modules/companies/types";
import type {
  Employee,
  EmployeeAccountStatus,
  EmployeeListItem,
  EmployeeRoleInfo,
  EmploymentPeriod,
  EmploymentStatus,
} from "./types";

/**
 * Server-only data access for the employees domain — see
 * docs/API_CONVENTIONS.md §7. Plain queries filtered explicitly by
 * `company_id` (RLS also enforces this — see
 * supabase/migrations/20260725091100_role_helper_and_employees_rls.sql —
 * but explicit scoping keeps index usage and intent readable, per
 * docs/API_CONVENTIONS.md §7). No PostgREST embeds, for the same reason
 * documented in modules/companies/queries.ts: this project's
 * hand-written types/database.ts doesn't model relationships.
 */

export type EmployeeListFilters = {
  search?: string;
  employmentStatus?: EmploymentStatus | "all";
  accountStatus?: EmployeeAccountStatus | "all";
  includeArchived?: boolean;
};

type SearchRpcArgs = {
  target_org_id: string;
  search_term: string | undefined;
  p_employment_status: EmploymentStatus | undefined;
  p_account_status: EmployeeAccountStatus | undefined;
  include_archived: boolean;
};

// The generated RPC arg types (types/database.ts) declare these optional
// params as `T | undefined`, not `T | null` — Postgres/PostgREST treats a
// JSON `null` differently from an omitted key, and the regenerated types
// now hold us to that distinction. `undefined` here serializes to "not
// sent," which is what the SQL functions' own `default null` parameters
// expect for "no filter."
function buildSearchArgs(companyId: string, filters: EmployeeListFilters): SearchRpcArgs {
  return {
    target_org_id: companyId,
    search_term: filters.search?.trim() || undefined,
    p_employment_status: filters.employmentStatus && filters.employmentStatus !== "all" ? filters.employmentStatus : undefined,
    p_account_status: filters.accountStatus && filters.accountStatus !== "all" ? filters.accountStatus : undefined,
    // "Archived" here means the RECORD is archived (employees.archived_at
    // is set), never account_status — account_status is a separate,
    // independent account/access lifecycle value. See
    // supabase/migrations/20260726100000_employee_search.sql's
    // employee_matches_filters() for where this is actually enforced.
    include_archived: filters.includeArchived ?? false,
  };
}

/**
 * A single page of employees visible to the caller in `companyId`,
 * via the `search_employees` SQL function
 * (supabase/migrations/20260726100000_employee_search.sql) rather than a
 * client-composed PostgREST filter — see that migration's comment for
 * why: matching a multi-word search like "john doe" against first_name/
 * last_name/employee_number/work_email needs a per-word AND-of-ORs
 * predicate, which isn't reliably expressible as a single `.or()` filter
 * string. The function is SECURITY INVOKER, so `employees`' own RLS still
 * fully governs which rows come back — this is a search predicate, not a
 * privilege escalation. Returns only the narrow `EmployeeListItem` column
 * set the list UI actually renders, not full `Employee` rows. Ordered
 * deterministically (last_name, first_name, id) inside the SQL function
 * itself, so paging never duplicates or skips a row.
 *
 * Pagination happens entirely in Postgres via `LIMIT`/`OFFSET` — the
 * caller is expected to have already validated/clamped `page`/`pageSize`
 * (see lib/pagination.ts) and, ideally, called `countEmployees` first to
 * confirm `page` is in range.
 */
export async function listEmployees(
  companyId: string,
  filters: EmployeeListFilters,
  page: number,
  pageSize: PageSize,
): Promise<EmployeeListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("search_employees", {
    ...buildSearchArgs(companyId, filters),
    page_limit: pageSize,
    page_offset: (page - 1) * pageSize,
  });

  if (error) throw error;
  return data ?? [];
}

/**
 * Total count of employees matching `filters` (ignoring pagination) — via
 * `count_employees()`, the same SECURITY INVOKER/RLS-scoped predicate
 * `search_employees()` uses (see supabase/migrations/20260726100000_employee_search.sql).
 * Deliberately a separate query rather than a `count(*) over()` window
 * column on `listEmployees`'s result — see that migration's comment for
 * why: a windowed count disappears exactly when it's most needed (an
 * out-of-range page returns zero rows and, with a window column, zero
 * count information too). Call this first to clamp `page` before fetching
 * rows for it.
 */
export async function countEmployees(companyId: string, filters: EmployeeListFilters): Promise<number> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("count_employees", buildSearchArgs(companyId, filters));

  if (error) throw error;
  return data ?? 0;
}

/** A single employee scoped to `companyId` — null if it doesn't exist, belongs to another company, or RLS hides it from the caller (all three look identical from here, which is deliberate: see docs/API_CONVENTIONS.md §6 on not leaking cross-tenant existence). */
export async function getEmployee(companyId: string, employeeId: string): Promise<Employee | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", employeeId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Same as `getEmployee`, keyed by the immutable, user-facing
 * `employee_number` instead of the internal UUID — used by the
 * `/employees/[employeeNumber]` routes (docs/DATABASE_SCHEMA.md — this
 * milestone's route-identifier change). Casing is normalized before the
 * lookup (numbers are always stored uppercase — see
 * `next_employee_number()`), so `/employees/valutris-00001` resolves the
 * same record as `/employees/VALUTRIS-00001`.
 */
export async function getEmployeeByNumber(companyId: string, employeeNumber: string): Promise<Employee | null> {
  const supabase = await createClient();
  const normalized = employeeNumber.trim().toUpperCase();
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("company_id", companyId)
    .eq("employee_number", normalized)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * The company roles held by a linked employee, resolved via
 * `company_memberships`/`membership_roles`/`roles` — never a second
 * role system, per this milestone's explicit constraint. Returns an empty
 * result (not an error) when `profileId` is null or has no active
 * membership in this company yet — an employee record can exist before
 * account activation, and the Roles tab renders that state explicitly
 * rather than treating it as a query failure.
 */
export async function getEmployeeRoleInfo(
  companyId: string,
  profileId: string | null,
): Promise<EmployeeRoleInfo> {
  if (!profileId) return { membershipId: null, roles: [] };

  const supabase = await createClient();
  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", profileId)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) return { membershipId: null, roles: [] };

  const { data: assignments, error: assignmentsError } = await supabase
    .from("membership_roles")
    .select("id, role_id")
    .eq("membership_id", membership.id);

  if (assignmentsError) throw assignmentsError;
  if (!assignments || assignments.length === 0) return { membershipId: membership.id, roles: [] };

  const { data: roles, error: rolesError } = await supabase
    .from("roles")
    .select("id, name, display_label")
    .in(
      "id",
      assignments.map((assignment) => assignment.role_id),
    );

  if (rolesError) throw rolesError;

  const roleById = new Map((roles ?? []).map((role) => [role.id, { name: role.name as RoleName, label: role.display_label }]));

  return {
    membershipId: membership.id,
    roles: assignments
      .filter((assignment) => roleById.has(assignment.role_id))
      .map((assignment) => ({
        membershipRoleId: assignment.id,
        roleId: assignment.role_id,
        ...roleById.get(assignment.role_id)!,
      })),
  };
}

/**
 * Same resolution as `getEmployeeRoleInfo`, batched for an entire employee
 * list — three queries total regardless of list size, rather than three
 * queries PER employee, since the list page needs a "Roles" column for
 * every row at once.
 */
export async function getEmployeeRoleInfoBulk(
  companyId: string,
  employees: Pick<Employee, "id" | "profile_id">[],
): Promise<Map<string, EmployeeRoleInfo>> {
  const result = new Map<string, EmployeeRoleInfo>(
    employees.map((employee) => [employee.id, { membershipId: null, roles: [] }]),
  );

  const profileIds = employees
    .map((employee) => employee.profile_id)
    .filter((profileId): profileId is string => profileId !== null);
  if (profileIds.length === 0) return result;

  const supabase = await createClient();
  const { data: memberships, error: membershipsError } = await supabase
    .from("company_memberships")
    .select("id, user_id")
    .eq("company_id", companyId)
    .eq("status", "active")
    .in("user_id", profileIds);

  if (membershipsError) throw membershipsError;
  if (!memberships || memberships.length === 0) return result;

  const membershipIdByProfileId = new Map(memberships.map((membership) => [membership.user_id, membership.id]));

  const { data: assignments, error: assignmentsError } = await supabase
    .from("membership_roles")
    .select("id, membership_id, role_id")
    .in(
      "membership_id",
      memberships.map((membership) => membership.id),
    );

  if (assignmentsError) throw assignmentsError;

  const { data: roles, error: rolesError } = await supabase.from("roles").select("id, name, display_label");
  if (rolesError) throw rolesError;
  const roleById = new Map((roles ?? []).map((role) => [role.id, { name: role.name as RoleName, label: role.display_label }]));

  const rolesByMembershipId = new Map<string, EmployeeRoleInfo["roles"]>();
  for (const assignment of assignments ?? []) {
    const role = roleById.get(assignment.role_id);
    if (!role) continue;
    const bucket = rolesByMembershipId.get(assignment.membership_id) ?? [];
    bucket.push({ membershipRoleId: assignment.id, roleId: assignment.role_id, ...role });
    rolesByMembershipId.set(assignment.membership_id, bucket);
  }

  for (const employee of employees) {
    if (!employee.profile_id) continue;
    const membershipId = membershipIdByProfileId.get(employee.profile_id);
    if (!membershipId) continue;
    result.set(employee.id, { membershipId, roles: rolesByMembershipId.get(membershipId) ?? [] });
  }

  return result;
}

/**
 * Full employment-period history for one employee, most recent first — the
 * single source of truth for employment state (see
 * supabase/migrations/20260727090000_employment_periods.sql). RLS
 * (employee_employment_periods_select) scopes this to the same reader set
 * as the employee record itself, or the employee viewing their own.
 *
 * `created_by`/`ended_by` are returned as raw profile ids, not resolved to
 * a display name — `profiles` RLS (`profiles_select_own`,
 * 20260725090900_rls_policies.sql) only lets a user read their OWN row, so
 * a bulk name lookup across other members would silently come back mostly
 * null. Nothing else in this codebase resolves `created_by`/`updated_by`/
 * `actor_user_id` to a name anywhere yet either (audit_events has the same
 * shape) — widening `profiles` read access is a real product/privacy
 * decision belonging to a future milestone, not something to take on as a
 * side effect of this one.
 */
export async function listEmploymentPeriods(companyId: string, employeeId: string): Promise<EmploymentPeriod[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_employment_periods")
    .select("*")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/**
 * A lightweight, unpaginated employee picker list (id/name/position only)
 * for company-wide "assign this employee to..." UIs — the Project
 * Assignments tab's roster picker (modules/projects), reused rather than
 * duplicated wherever a future module needs the same "pick an employee"
 * control. Deliberately excludes archived employees (archiving an employee
 * should not leave them selectable for new project/team work) but is not
 * search_employees()-style paginated — expected picker scale (an company's
 * active roster) is far smaller than the full historical employee list
 * search_employees() has to handle.
 */
export async function listActiveEmployeesForPicker(
  companyId: string,
): Promise<Pick<Employee, "id" | "first_name" | "last_name" | "position_title">[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, first_name, last_name, position_title")
    .eq("company_id", companyId)
    .is("archived_at", null)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/** The fixed v1 role catalogue (global, not per-company — see `roles` in docs/DATABASE_SCHEMA.md) for populating the Roles tab's assignment control. Ordered by `display_label` — the human-facing name — rather than the machine key, so the selector reads alphabetically the way a person would expect. */
export async function listAllRoles(): Promise<Pick<Role, "id" | "name" | "display_label">[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .select("id, name, display_label")
    .order("display_label", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
