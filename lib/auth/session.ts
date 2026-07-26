import "server-only";
import { forbidden, unauthorized } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { RoleName } from "@/modules/organizations/types";

/**
 * Reusable server-side auth utilities (docs/ARCHITECTURE.md §4, "lib/auth/
 * session.ts — getSession(), requireUser(), requireRole()").
 *
 * SCOPE NOTE (database foundation milestone): `requireOrganizationMembership()`,
 * `requireRole()`, and `requireAnyRole()` take an explicit `organizationId`
 * parameter rather than resolving a single "current active organization"
 * from a session claim. docs/ARCHITECTURE.md §5 describes requireUser() as
 * also resolving that active organization automatically — doing so
 * requires a Custom Access Token Auth Hook configured at the Supabase
 * project/dashboard level (docs/ARCHITECTURE.md §3.2), which is out of
 * reach from a migration or application code change alone. Real tenant
 * isolation does not depend on that hook: every function below makes a
 * live database check for the SPECIFIC organization passed in, every
 * time — there is no cached or client-trusted membership/role state
 * anywhere in this file.
 *
 * `requireAnyRole()`/`getUserRoleNames()` (added for the Employee
 * Management milestone) are the first real usage of the "full role array"
 * permission model docs/ARCHITECTURE.md §6 describes — `modules/employees/
 * permissions.ts` is the first `permissions.ts` module built against it.
 */

/** Returns the signed-in user, or null if there isn't one. Never redirects. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Returns the signed-in user, or calls `unauthorized()` (renders
 * app/unauthorized.tsx, HTTP 401) if there isn't one. Use at the top of any
 * Server Component, Server Function, or Route Handler that requires a
 * session — see docs/API_CONVENTIONS.md §3, step 1.
 */
export async function requireUser(): Promise<{ user: User }> {
  const user = await getCurrentUser();

  if (!user) {
    unauthorized();
  }

  return { user };
}

/**
 * Requires the signed-in user to have an ACTIVE membership in
 * `organizationId`, or calls `forbidden()` (renders app/forbidden.tsx,
 * HTTP 403). Calls `unauthorized()` first if there's no session at all.
 *
 * Delegates to the `is_organization_member()` SQL function (the same one
 * every relevant RLS policy uses — see
 * supabase/migrations/20260725090800_rls_helper_functions.sql) via `.rpc()`
 * rather than re-implementing the membership check in application code, so
 * there is exactly one place this logic lives.
 */
export async function requireOrganizationMembership(
  organizationId: string,
): Promise<{ user: User; organizationId: string }> {
  const { user } = await requireUser();
  const supabase = await createClient();

  const { data: isMember, error } = await supabase.rpc("is_organization_member", {
    target_org_id: organizationId,
  });

  if (error) {
    throw error;
  }

  if (!isMember) {
    forbidden();
  }

  return { user, organizationId };
}

/**
 * Requires the signed-in user to have an ACTIVE membership in
 * `organizationId` AND hold `roleName` there, or calls `forbidden()`.
 * Membership is checked first (and separately) so a non-member gets the
 * same 403 either way rather than the role check leaking whether the
 * organization exists.
 *
 * `roleName` is typed against the fixed v1 role catalogue
 * (modules/organizations/types.ts), but — per this module's scope note —
 * that type is a caller convenience only. The actual decision always comes
 * from `has_organization_role()`, a live query against the real `roles` /
 * `membership_roles` tables.
 */
export async function requireRole(
  organizationId: string,
  roleName: RoleName,
): Promise<{ user: User; organizationId: string; role: RoleName }> {
  const { user } = await requireOrganizationMembership(organizationId);
  const supabase = await createClient();

  const { data: hasRole, error } = await supabase.rpc("has_organization_role", {
    target_org_id: organizationId,
    role_name: roleName,
  });

  if (error) {
    throw error;
  }

  if (!hasRole) {
    forbidden();
  }

  return { user, organizationId, role: roleName };
}

/**
 * Requires the signed-in user to have an ACTIVE membership in
 * `organizationId` AND hold at least one of `roleNames` there, or calls
 * `forbidden()`. Delegates to `has_any_organization_role()` — the same
 * function the database-level policies use (e.g. `employees`' insert/
 * update policies) — so the app-side gate and the RLS backstop can never
 * silently drift apart.
 */
export async function requireAnyRole(
  organizationId: string,
  roleNames: RoleName[],
): Promise<{ user: User; organizationId: string }> {
  const { user } = await requireOrganizationMembership(organizationId);
  const supabase = await createClient();

  const { data: hasAnyRole, error } = await supabase.rpc("has_any_organization_role", {
    target_org_id: organizationId,
    role_names: roleNames,
  });

  if (error) {
    throw error;
  }

  if (!hasAnyRole) {
    forbidden();
  }

  return { user, organizationId };
}

/**
 * Returns the full array of role names the signed-in user holds via their
 * ACTIVE membership in `organizationId` (empty array if none, including if
 * they have no membership there at all — this never throws/redirects,
 * unlike the `require*` functions above, since it's meant for UI-only
 * "what should I show this user" decisions, not access control). The
 * actual access-control decision for any mutation still belongs to
 * `requireRole()`/`requireAnyRole()` (and, ultimately, RLS) — this is a
 * read for rendering, e.g. deciding whether to show an "Add employee"
 * button, never the thing that gates the Server Function it links to.
 *
 * Three plain queries rather than a PostgREST embed, for the same reason
 * as `modules/organizations/queries.ts` — see that file's header comment.
 */
export async function getUserRoleNames(organizationId: string): Promise<RoleName[]> {
  const { user } = await requireUser();
  const supabase = await createClient();

  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) return [];

  const { data: roleAssignments, error: roleAssignmentsError } = await supabase
    .from("membership_roles")
    .select("role_id")
    .eq("membership_id", membership.id);

  if (roleAssignmentsError) throw roleAssignmentsError;
  if (!roleAssignments || roleAssignments.length === 0) return [];

  const { data: roles, error: rolesError } = await supabase
    .from("roles")
    .select("name")
    .in(
      "id",
      roleAssignments.map((assignment) => assignment.role_id),
    );

  if (rolesError) throw rolesError;
  return (roles ?? []).map((role) => role.name as RoleName);
}
