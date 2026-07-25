import "server-only";
import { forbidden, unauthorized } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { RoleName } from "@/modules/organizations/types";

/**
 * Reusable server-side auth utilities (docs/ARCHITECTURE.md §4, "lib/auth/
 * session.ts — getSession(), requireUser(), requireRole()").
 *
 * SCOPE NOTE (database foundation milestone): `requireOrganizationMembership()`
 * and `requireRole()` take an explicit `organizationId` parameter rather
 * than resolving a single "current active organization" from a session
 * claim. docs/ARCHITECTURE.md §5 describes requireUser() as also resolving
 * that active organization automatically — doing so requires a Custom
 * Access Token Auth Hook configured at the Supabase project/dashboard
 * level (docs/ARCHITECTURE.md §3.2), which is out of reach from a
 * migration or application code change alone. See the implementation
 * report for this milestone. Real tenant isolation does not depend on
 * that hook: both functions below make a live database check for the
 * SPECIFIC organization passed in, every time — there is no cached or
 * client-trusted membership/role state anywhere in this file.
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
