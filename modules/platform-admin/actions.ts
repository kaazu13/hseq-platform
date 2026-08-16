"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRaisedException, isUniqueViolation } from "@/lib/supabase/errors";
import { searchPlatformAccounts } from "./queries";
import type { PlatformAccountSearchResult, RoleRow } from "./types";
import {
  suspendAccountSchema,
  banAccountSchema,
  restoreAccountSchema,
  issuePlatformWarningSchema,
  adminUpdateUserNameSchema,
  createCompanySchema,
  grantCompanyMembershipSchema,
  createCustomRoleSchema,
  updateCustomRolePermissionsSchema,
  upsertCompanySubscriptionSchema,
  type SuspendAccountInput,
  type BanAccountInput,
  type RestoreAccountInput,
  type IssuePlatformWarningInput,
  type AdminUpdateUserNameInput,
  type CreateCompanyInput,
  type GrantCompanyMembershipInput,
  type CreateCustomRoleInput,
  type UpdateCustomRolePermissionsInput,
  type UpsertCompanySubscriptionInput,
} from "./validation";
import type { Database } from "@/types/database";
import type { Company } from "@/modules/companies/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type PlatformWarning = Database["public"]["Tables"]["platform_warnings"]["Row"];
type CompanyMembership = Database["public"]["Tables"]["company_memberships"]["Row"];
type CompanySubscription = Database["public"]["Tables"]["company_subscriptions"]["Row"];

/**
 * Server Functions for Platform Administrator account/security controls
 * (Phases 12-14). Every action here calls requirePlatformSuperAdmin() (a
 * real, RLS-backed check) as its own first line — the underlying RPCs
 * ALSO independently re-check is_platform_super_admin() server-side (see
 * supabase/migrations/20260819095000_platform_admin.sql), so this app-layer
 * check is a fast pre-filter, not the only gate, matching every other
 * module's established convention.
 */

function revalidatePlatformAdminPaths() {
  revalidatePath("/platform-admin");
  revalidatePath("/platform-admin/companies");
  revalidatePath("/platform-admin/users");
  revalidatePath("/platform-admin/roles");
  revalidatePath("/platform-admin/billing");
  revalidatePath("/platform-admin/settings");
}

export async function suspendAccount(targetUserId: string, input: SuspendAccountInput): Promise<ActionResult<Profile>> {
  const parsed = suspendAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A reason is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requirePlatformSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("suspend_account", { target_user_id: targetUserId, target_reason: parsed.data.reason }).single();
  if (error || !data) {
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't suspend the account. Try again." } };
  }

  revalidatePlatformAdminPaths();
  return { ok: true, data };
}

export async function banAccount(targetUserId: string, input: BanAccountInput): Promise<ActionResult<Profile>> {
  const parsed = banAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A reason is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requirePlatformSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ban_account", { target_user_id: targetUserId, target_reason: parsed.data.reason }).single();
  if (error || !data) {
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't ban the account. Try again." } };
  }

  revalidatePlatformAdminPaths();
  return { ok: true, data };
}

export async function restoreAccount(targetUserId: string, input: RestoreAccountInput): Promise<ActionResult<Profile>> {
  const parsed = restoreAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the reason field.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requirePlatformSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_account", { target_user_id: targetUserId, target_reason: parsed.data.reason }).single();
  if (error || !data) {
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't restore the account. Try again." } };
  }

  revalidatePlatformAdminPaths();
  return { ok: true, data };
}

export async function issuePlatformWarning(targetUserId: string, input: IssuePlatformWarningInput): Promise<ActionResult<PlatformWarning>> {
  const parsed = issuePlatformWarningSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A reason is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requirePlatformSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_platform_warning", { target_user_id: targetUserId, target_reason: parsed.data.reason }).single();
  if (error || !data) {
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't issue the warning. Try again." } };
  }

  revalidatePlatformAdminPaths();
  return { ok: true, data };
}

/**
 * "[ Sign out / revoke active sessions ]" (Phase 12) — DISCLOSED LIMITATION:
 * @supabase/auth-js's only session-revocation method is
 * `auth.admin.signOut(jwt, scope)`, which requires the TARGET USER'S OWN
 * access token JWT as its argument (confirmed by reading
 * node_modules/@supabase/auth-js's GoTrueAdminApi/GoTrueClient source —
 * see GoTrueClient.ts's own comment: "you can revoke all refresh tokens
 * for a user by passing a user's JWT... There is no way to revoke a
 * user's access token jwt until it expires"). An administrator does not
 * legitimately possess another user's JWT, so there is NO supported
 * Supabase Admin API path to instantly invalidate a specific user's
 * existing session BY USER ID in this SDK version — per this milestone's
 * explicit "if session revocation requires a path that is not currently
 * safely available, do not fake it" instruction, this action does NOT
 * call any signOut-style API (an earlier draft incorrectly did, passing a
 * user id where a JWT was required — caught before shipping).
 *
 * The STRONGEST safe behavior actually available: getCurrentUser()
 * (lib/auth/session.ts) re-checks profiles.account_status on every single
 * request and force-signs-out + denies access the moment it is not
 * 'active' — suspendAccount()/banAccount() above are what actually,
 * reliably stop a user's application access on their very next request,
 * regardless of whether their still-technically-valid JWT has naturally
 * expired yet. This action exists to give that fact its own explicit,
 * audited admin gesture (a security_events row), not to perform
 * additional revocation this SDK cannot support.
 */
export async function revokeUserSessions(targetUserId: string): Promise<ActionResult<null>> {
  await requirePlatformSuperAdmin();

  const supabase = await createClient();
  const { error } = await supabase.rpc("log_sessions_revoked", { target_user_id: targetUserId });
  if (error) {
    return { ok: false, error: { code: "server_error", message: "Couldn't record the session-revocation event. Try again." } };
  }

  revalidatePlatformAdminPaths();
  return { ok: true, data: null };
}

/** Item 10: the ONE authorized path to change another user's display name — Platform Super Admin only. admin_update_profile_name() independently re-checks is_platform_super_admin() (SECURITY DEFINER), so this app-layer check is a fast pre-filter, not the only gate. */
export async function adminUpdateUserName(targetUserId: string, input: AdminUpdateUserNameInput): Promise<ActionResult<Profile>> {
  const parsed = adminUpdateUserNameSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A name is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requirePlatformSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_update_profile_name", { target_user_id: targetUserId, target_full_name: parsed.data.fullName }).single();
  if (error || !data) {
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't update the name. Try again." } };
  }

  revalidatePlatformAdminPaths();
  return { ok: true, data };
}

export async function grantPlatformSuperAdmin(targetUserId: string): Promise<ActionResult<null>> {
  await requirePlatformSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("grant_platform_super_admin", { target_user_id: targetUserId });
  if (error) {
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't grant platform administrator access. Try again." } };
  }
  revalidatePlatformAdminPaths();
  return { ok: true, data: null };
}

/** A thin client-callable wrapper over the (already Server-only) searchPlatformAccounts query — lets the Create Company wizard's "existing account" picker search live, not just filter an initial snapshot. */
export async function searchAccountsForCompanyCreation(query: string): Promise<PlatformAccountSearchResult[]> {
  await requirePlatformSuperAdmin();
  return searchPlatformAccounts(query || null, 30);
}

/**
 * Onboarding item 1 — "[ Create Company ]". Platform-super-admin-only;
 * create_company() (supabase/migrations/20260829090000_onboarding.sql)
 * independently re-checks is_platform_super_admin() as a SECURITY DEFINER
 * function (the caller is, correctly, not yet a member of the company
 * being created, so plain RLS can't gate this the way every other
 * mutation in this codebase is gated) — this app-layer check is a fast
 * pre-filter, not the only gate. Slug/employee-number-prefix are derived
 * safely server-side when omitted (kebab-case + dedup, uppercase-alnum
 * fallback respectively) — never invented client-side.
 */
export async function createCompany(input: CreateCompanyInput): Promise<ActionResult<Company>> {
  const parsed = createCompanySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requirePlatformSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_company", { target_name: parsed.data.name, target_slug: parsed.data.slug, target_employee_number_prefix: parsed.data.employeeNumberPrefix })
    .single();
  if (error || !data) {
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't create the company. Try again." } };
  }

  revalidatePlatformAdminPaths();
  return { ok: true, data };
}

/**
 * Onboarding item 2, path A — an EXISTING platform account, added directly
 * to a company with the given role(s). No invitation token/round-trip
 * (a platform super admin already vouches for the account's identity —
 * same trust level as grantPlatformSuperAdmin above).
 */
export async function platformAdminGrantCompanyMembership(companyId: string, input: GrantCompanyMembershipInput): Promise<ActionResult<CompanyMembership>> {
  const parsed = grantCompanyMembershipSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requirePlatformSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("platform_admin_grant_company_membership", { target_company_id: companyId, target_user_id: parsed.data.userId, target_role_names: parsed.data.roleNames })
    .single();
  if (error || !data) {
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't add that account to the company. Try again." } };
  }

  revalidatePlatformAdminPaths();
  return { ok: true, data };
}

/**
 * Part 2 — Roles & Permissions page. create_custom_role()/
 * update_custom_role_permissions()/delete_custom_role() (SECURITY DEFINER,
 * 20260831092000_roles_permissions_foundation.sql) already independently
 * enforce platform-admin-only + reserved-permission rejection +
 * system-role protection — this app-layer check is the same fast
 * pre-filter every other action in this file uses.
 */
export async function createCustomRole(input: CreateCustomRoleInput): Promise<ActionResult<RoleRow>> {
  const parsed = createCustomRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requirePlatformSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_custom_role", {
      target_company_id: parsed.data.companyId,
      target_name: parsed.data.name,
      target_description: (parsed.data.description || null) as string,
      target_permission_keys: parsed.data.permissionKeys,
    })
    .single();
  if (error || !data) {
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    if (isUniqueViolation(error)) {
      return { ok: false, error: { code: "conflict", message: "A role with that name already exists for this company.", fieldErrors: { name: "Already in use" } } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't create the role. Try again." } };
  }

  revalidatePlatformAdminPaths();
  return { ok: true, data };
}

export async function updateCustomRolePermissions(roleId: string, input: UpdateCustomRolePermissionsInput): Promise<ActionResult<RoleRow>> {
  const parsed = updateCustomRolePermissionsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requirePlatformSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_custom_role_permissions", { target_role_id: roleId, target_permission_keys: parsed.data.permissionKeys }).single();
  if (error || !data) {
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't update the role's permissions. Try again." } };
  }

  revalidatePlatformAdminPaths();
  return { ok: true, data };
}

export async function deleteCustomRole(roleId: string): Promise<ActionResult<null>> {
  await requirePlatformSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_custom_role", { target_role_id: roleId });
  if (error) {
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't delete the role. Try again." } };
  }

  revalidatePlatformAdminPaths();
  return { ok: true, data: null };
}

/** Part 2 — Usage & Billing. upsert_company_subscription() (SECURITY DEFINER, 20260831091000_billing_usage_foundation.sql) is platform-admin-only and audited; this is a foundation, no payment processing. */
export async function upsertCompanySubscription(companyId: string, input: UpsertCompanySubscriptionInput): Promise<ActionResult<CompanySubscription>> {
  const parsed = upsertCompanySubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requirePlatformSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("upsert_company_subscription", {
      target_company_id: companyId,
      target_plan_name: parsed.data.planName || undefined,
      target_subscription_status: parsed.data.subscriptionStatus,
      target_employee_limit: parsed.data.employeeLimit ?? undefined,
      target_project_limit: parsed.data.projectLimit ?? undefined,
      target_billing_renewal_date: parsed.data.billingRenewalDate || undefined,
      target_notes: parsed.data.notes || undefined,
    })
    .single();
  if (error || !data) {
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't save the billing information. Try again." } };
  }

  revalidatePlatformAdminPaths();
  return { ok: true, data };
}

/** Part 2 — Platform Settings roster. Wraps the existing revoke_platform_super_admin() RPC (grantPlatformSuperAdmin() above already covers the grant path). */
export async function revokePlatformSuperAdmin(targetUserId: string): Promise<ActionResult<null>> {
  await requirePlatformSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_platform_super_admin", { target_user_id: targetUserId });
  if (error) {
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't revoke platform administrator access. Try again." } };
  }
  revalidatePlatformAdminPaths();
  return { ok: true, data: null };
}
