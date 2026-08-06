import "server-only";
import { cache } from "react";
import { forbidden, unauthorized } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { RoleName } from "@/modules/companies/types";

/**
 * Reusable server-side auth utilities (docs/ARCHITECTURE.md §4, "lib/auth/
 * session.ts — getSession(), requireUser(), requireRole()").
 *
 * SCOPE NOTE (database foundation milestone): `requireCompanyMembership()`,
 * `requireRole()`, and `requireAnyRole()` take an explicit `companyId`
 * parameter rather than resolving a single "current active company"
 * from a session claim. docs/ARCHITECTURE.md §5 describes requireUser() as
 * also resolving that active company automatically — doing so
 * requires a Custom Access Token Auth Hook configured at the Supabase
 * project/dashboard level (docs/ARCHITECTURE.md §3.2), which is out of
 * reach from a migration or application code change alone. Real tenant
 * isolation does not depend on that hook: every function below makes a
 * live database check for the SPECIFIC company passed in, every
 * time — there is no cached or client-trusted membership/role state
 * anywhere in this file.
 *
 * `requireAnyRole()`/`getUserRoleNames()` (added for the Employee
 * Management milestone) are the first real usage of the "full role array"
 * permission model docs/ARCHITECTURE.md §6 describes — `modules/employees/
 * permissions.ts` is the first `permissions.ts` module built against it.
 */

/**
 * Returns the signed-in user, or null if there isn't one. Never redirects.
 *
 * Wrapped in React's `cache()` — per-request memoization only (a fresh
 * request always gets a fresh call; nothing survives across requests). This
 * function is the base of a call chain several pages hit twice per request
 * (once directly via `requireUser()`, again via `getUserRoleNames()`, which
 * also calls `requireUser()` internally) — memoizing here collapses those
 * into a single `supabase.auth.getUser()` round trip instead of two.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

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
 * `companyId`, or calls `forbidden()` (renders app/forbidden.tsx,
 * HTTP 403). Calls `unauthorized()` first if there's no session at all.
 *
 * Delegates to the `is_company_member()` SQL function (the same one
 * every relevant RLS policy uses — see
 * supabase/migrations/20260725090800_rls_helper_functions.sql) via `.rpc()`
 * rather than re-implementing the membership check in application code, so
 * there is exactly one place this logic lives.
 */
export async function requireCompanyMembership(
  companyId: string,
): Promise<{ user: User; companyId: string }> {
  const { user } = await requireUser();
  const supabase = await createClient();

  const { data: isMember, error } = await supabase.rpc("is_company_member", {
    target_org_id: companyId,
  });

  if (error) {
    throw error;
  }

  if (!isMember) {
    forbidden();
  }

  return { user, companyId };
}

/**
 * Requires the signed-in user to have an ACTIVE membership in
 * `companyId` AND hold `roleName` there, or calls `forbidden()`.
 * Membership is checked first (and separately) so a non-member gets the
 * same 403 either way rather than the role check leaking whether the
 * company exists.
 *
 * `roleName` is typed against the fixed v1 role catalogue
 * (modules/companies/types.ts), but — per this module's scope note —
 * that type is a caller convenience only. The actual decision always comes
 * from `has_company_role()`, a live query against the real `roles` /
 * `membership_roles` tables.
 */
export async function requireRole(
  companyId: string,
  roleName: RoleName,
): Promise<{ user: User; companyId: string; role: RoleName }> {
  const { user } = await requireCompanyMembership(companyId);
  const supabase = await createClient();

  const { data: hasRole, error } = await supabase.rpc("has_company_role", {
    target_org_id: companyId,
    role_name: roleName,
  });

  if (error) {
    throw error;
  }

  if (!hasRole) {
    forbidden();
  }

  return { user, companyId, role: roleName };
}

/**
 * Requires the signed-in user to have an ACTIVE membership in
 * `companyId` AND hold at least one of `roleNames` there, or calls
 * `forbidden()`. Delegates to `has_any_company_role()` — the same
 * function the database-level policies use (e.g. `employees`' insert/
 * update policies) — so the app-side gate and the RLS backstop can never
 * silently drift apart.
 */
export async function requireAnyRole(
  companyId: string,
  roleNames: RoleName[],
): Promise<{ user: User; companyId: string }> {
  const { user } = await requireCompanyMembership(companyId);
  const supabase = await createClient();

  const { data: hasAnyRole, error } = await supabase.rpc("has_any_company_role", {
    target_org_id: companyId,
    role_names: roleNames,
  });

  if (error) {
    throw error;
  }

  if (!hasAnyRole) {
    forbidden();
  }

  return { user, companyId };
}

/**
 * Returns the full array of role names the signed-in user holds via their
 * ACTIVE membership in `companyId` (empty array if none, including if
 * they have no membership there at all — this never throws/redirects,
 * unlike the `require*` functions above, since it's meant for UI-only
 * "what should I show this user" decisions, not access control). The
 * actual access-control decision for any mutation still belongs to
 * `requireRole()`/`requireAnyRole()` (and, ultimately, RLS) — this is a
 * read for rendering, e.g. deciding whether to show an "Add employee"
 * button, never the thing that gates the Server Function it links to.
 *
 * Three plain queries rather than a PostgREST embed, for the same reason
 * as `modules/companies/queries.ts` — see that file's header comment.
 */
export async function getUserRoleNames(companyId: string): Promise<RoleName[]> {
  const { user } = await requireUser();
  const supabase = await createClient();

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("id")
    .eq("company_id", companyId)
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
