import { createClient } from "@/lib/supabase/server";
import type { RoleName } from "@/modules/organizations/types";
import type { ProjectAssignmentRole } from "@/modules/projects/types";
import type { AccountOverview, AccountRole, AccountProjectAssignment } from "./types";

/**
 * Server-only data access for the composed account-overview view — see
 * modules/account/types.ts's header comment for why this is its own
 * module. RLS (`profiles_select_own`, `organization_memberships_select_own_or_active_member`,
 * `employees_select_managers_or_own_record`, `project_assignments_select`)
 * is the real scoping; every query below is explicitly organization- and
 * user-scoped on top of that for readability/index usage, same convention
 * as every other module's queries.ts this session.
 *
 * A NOTE ON EMAIL: `auth.users.email` (the actual login email) is not a
 * `public` schema table — it is never exposed via PostgREST/RLS to any
 * role except the user's own `supabase.auth.getUser()` call for
 * themselves. `lib/supabase/admin.ts`'s service-role client CAN read it,
 * but its own header comment explicitly forbids using it from any Server
 * Function reachable by a regular user request — an admin-page load is
 * exactly that. So `listOrganizationMembersOverview` below surfaces the
 * linked employee's `work_email` column instead (a real, legitimately
 * RLS-readable field for company_admin/operations_manager) — labelled as
 * such in the UI, never presented as if it were the login email.
 */

type AccountOverviewCore = Omit<AccountOverview, "email" | "lastSignInAt">;

/**
 * Everything about `userId`'s standing in `organizationId` EXCEPT email and
 * last-sign-in — those live on the Supabase Auth `User` object
 * (`supabase.auth.getUser()`), not any table this function can query, so
 * the caller (a Server Component that already called `requireUser()`)
 * merges them in. Returns null only if `organizationId` doesn't resolve to
 * an organizations row at all (RLS/missing-org look identical here, same
 * as every other "get one thing scoped to an org" query this session).
 */
export async function getAccountOverview(organizationId: string, userId: string): Promise<AccountOverviewCore | null> {
  const supabase = await createClient();

  const [{ data: org, error: orgError }, { data: profile, error: profileError }, { data: membership, error: membershipError }] = await Promise.all([
    supabase.from("organizations").select("id, name, slug").eq("id", organizationId).maybeSingle(),
    supabase.from("profiles").select("id, full_name, phone, user_number").eq("id", userId).maybeSingle(),
    supabase.from("organization_memberships").select("id, status, joined_at, invited_at").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
  ]);
  if (orgError) throw orgError;
  if (profileError) throw profileError;
  if (membershipError) throw membershipError;
  if (!org || !profile || !membership) return null;

  const { data: roleAssignments, error: roleAssignmentsError } = await supabase.from("membership_roles").select("id, role_id").eq("membership_id", membership.id);
  if (roleAssignmentsError) throw roleAssignmentsError;

  let roles: AccountRole[] = [];
  if (roleAssignments && roleAssignments.length > 0) {
    const { data: roleRows, error: roleRowsError } = await supabase
      .from("roles")
      .select("id, name, display_label")
      .in(
        "id",
        roleAssignments.map((a) => a.role_id),
      );
    if (roleRowsError) throw roleRowsError;
    const roleById = new Map((roleRows ?? []).map((r) => [r.id, r]));
    roles = roleAssignments
      .filter((a) => roleById.has(a.role_id))
      .map((a) => {
        const role = roleById.get(a.role_id)!;
        return { membershipRoleId: a.id, roleId: a.role_id, name: role.name as RoleName, label: role.display_label };
      });
  }

  const { data: employeeRow, error: employeeError } = await supabase
    .from("employees")
    .select("id, employee_number, first_name, last_name, work_email, position_title, employment_status, archived_at")
    .eq("organization_id", organizationId)
    .eq("profile_id", userId)
    .maybeSingle();
  if (employeeError) throw employeeError;

  let projectAssignments: AccountProjectAssignment[] = [];
  if (employeeRow) {
    const { data: assignments, error: assignmentsError } = await supabase
      .from("project_assignments")
      .select("project_id, assignment_role, end_at")
      .eq("organization_id", organizationId)
      .eq("employee_id", employeeRow.id)
      .is("end_at", null);
    if (assignmentsError) throw assignmentsError;

    if (assignments && assignments.length > 0) {
      const { data: projects, error: projectsError } = await supabase
        .from("projects")
        .select("id, name")
        .in(
          "id",
          assignments.map((a) => a.project_id),
        );
      if (projectsError) throw projectsError;
      const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]));
      projectAssignments = assignments.map((a) => ({
        projectId: a.project_id,
        projectName: projectNameById.get(a.project_id) ?? "Unknown project",
        assignmentRole: a.assignment_role as ProjectAssignmentRole,
        endAt: a.end_at,
      }));
    }
  }

  return {
    profile: { id: profile.id, fullName: profile.full_name, phone: profile.phone, userNumber: profile.user_number },
    organization: org,
    membership: { id: membership.id, status: membership.status, joinedAt: membership.joined_at, invitedAt: membership.invited_at },
    roles,
    employee: employeeRow
      ? {
          id: employeeRow.id,
          employeeNumber: employeeRow.employee_number ?? "",
          firstName: employeeRow.first_name,
          lastName: employeeRow.last_name,
          workEmail: employeeRow.work_email,
          positionTitle: employeeRow.position_title,
          employmentStatus: employeeRow.employment_status,
          archivedAt: employeeRow.archived_at,
        }
      : null,
    projectAssignments,
  };
}

export type OrganizationMemberOverview = {
  membershipId: string;
  userId: string;
  status: AccountOverviewCore["membership"]["status"];
  /** Only ever resolvable via a linked employee record — `profiles` RLS restricts reads to a user's OWN row, so there is no bulk name lookup for members without one (see the "useful empty state" this implies in the admin page). */
  employee: AccountOverviewCore["employee"];
  roles: AccountRole[];
  projectAssignments: AccountProjectAssignment[];
};

/**
 * Every member's status/roles/linked-employee/project-assignments in one
 * pass, for the /admin/members list — batched (constant number of queries
 * regardless of member count), same pattern as
 * modules/employees/queries.ts's getEmployeeRoleInfoBulk. Resolves the
 * linked employee's `work_email`, NOT the login email — see this file's
 * header comment for why the login email can't be shown here at all.
 */
export async function listOrganizationMembersOverview(organizationId: string): Promise<OrganizationMemberOverview[]> {
  const supabase = await createClient();

  const { data: memberships, error: membershipsError } = await supabase
    .from("organization_memberships")
    .select("id, user_id, status")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (membershipsError) throw membershipsError;
  if (!memberships || memberships.length === 0) return [];

  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select("id, profile_id, employee_number, first_name, last_name, work_email, position_title, employment_status, archived_at")
    .eq("organization_id", organizationId)
    .in(
      "profile_id",
      memberships.map((m) => m.user_id),
    );
  if (employeesError) throw employeesError;
  const employeeByProfileId = new Map((employees ?? []).filter((e) => e.profile_id).map((e) => [e.profile_id as string, e]));

  const { data: roleAssignments, error: roleAssignmentsError } = await supabase
    .from("membership_roles")
    .select("id, membership_id, role_id")
    .in(
      "membership_id",
      memberships.map((m) => m.id),
    );
  if (roleAssignmentsError) throw roleAssignmentsError;

  const { data: allRoles, error: allRolesError } = await supabase.from("roles").select("id, name, display_label");
  if (allRolesError) throw allRolesError;
  const roleById = new Map((allRoles ?? []).map((r) => [r.id, r]));

  const rolesByMembershipId = new Map<string, AccountRole[]>();
  for (const a of roleAssignments ?? []) {
    const role = roleById.get(a.role_id);
    if (!role) continue;
    const bucket = rolesByMembershipId.get(a.membership_id) ?? [];
    bucket.push({ membershipRoleId: a.id, roleId: a.role_id, name: role.name as RoleName, label: role.display_label });
    rolesByMembershipId.set(a.membership_id, bucket);
  }

  const employeeIds = (employees ?? []).map((e) => e.id);
  const assignmentsByEmployeeId = new Map<string, AccountProjectAssignment[]>();
  if (employeeIds.length > 0) {
    const { data: assignments, error: assignmentsError } = await supabase
      .from("project_assignments")
      .select("employee_id, project_id, assignment_role, end_at")
      .eq("organization_id", organizationId)
      .in("employee_id", employeeIds)
      .is("end_at", null);
    if (assignmentsError) throw assignmentsError;

    const projectIds = [...new Set((assignments ?? []).map((a) => a.project_id))];
    let projectNameById = new Map<string, string>();
    if (projectIds.length > 0) {
      const { data: projects, error: projectsError } = await supabase.from("projects").select("id, name").in("id", projectIds);
      if (projectsError) throw projectsError;
      projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]));
    }

    for (const a of assignments ?? []) {
      const bucket = assignmentsByEmployeeId.get(a.employee_id) ?? [];
      bucket.push({ projectId: a.project_id, projectName: projectNameById.get(a.project_id) ?? "Unknown project", assignmentRole: a.assignment_role as ProjectAssignmentRole, endAt: a.end_at });
      assignmentsByEmployeeId.set(a.employee_id, bucket);
    }
  }

  return memberships.map((m) => {
    const employee = employeeByProfileId.get(m.user_id) ?? null;
    return {
      membershipId: m.id,
      userId: m.user_id,
      status: m.status,
      roles: rolesByMembershipId.get(m.id) ?? [],
      employee: employee
        ? {
            id: employee.id,
            employeeNumber: employee.employee_number ?? "",
            firstName: employee.first_name,
            lastName: employee.last_name,
            workEmail: employee.work_email,
            positionTitle: employee.position_title,
            employmentStatus: employee.employment_status,
            archivedAt: employee.archived_at,
          }
        : null,
      projectAssignments: employee ? (assignmentsByEmployeeId.get(employee.id) ?? []) : [],
    };
  });
}
