"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRaisedException } from "@/lib/supabase/errors";
import { suspendAccountSchema, banAccountSchema, restoreAccountSchema, issuePlatformWarningSchema, type SuspendAccountInput, type BanAccountInput, type RestoreAccountInput, type IssuePlatformWarningInput } from "./validation";
import type { Database } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type PlatformWarning = Database["public"]["Tables"]["platform_warnings"]["Row"];

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
