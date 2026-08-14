"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { requireCompanyMembership, requireUser, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRaisedException, isRlsViolation, isUniqueViolation } from "@/lib/supabase/errors";
import { COMPANY_ADMIN_ROLES } from "@/modules/admin/permissions";
import { inviteMemberSchema, revokeInvitationSchema, type InviteMemberInput, type RevokeInvitationInput } from "./validation";
import type { CompanyInvitation } from "./types";

/**
 * Server Functions for the invitation lifecycle (items 13/14/16). Every
 * mutation delegates to a SECURITY DEFINER RPC
 * (supabase/migrations/20260829090000_onboarding.sql) that re-checks
 * authorization itself — the app-layer checks here are the fast
 * pre-filter every other module in this codebase already uses, never the
 * only gate.
 */

function revalidateInvitationPaths() {
  revalidatePath("/admin/members");
  revalidatePath("/onboarding");
}

export type CreateInvitationResult = { invitation: CompanyInvitation; token: string };

export async function createInvitation(companyId: string, input: InviteMemberInput): Promise<ActionResult<CreateInvitationResult>> {
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireCompanyMembership(companyId);
  const roleNames = await getUserRoleNames(companyId);
  if (!roleNames.some((role) => COMPANY_ADMIN_ROLES.includes(role))) {
    forbidden();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_invitation", {
      target_company_id: companyId,
      target_email: parsed.data.email,
      target_full_name: parsed.data.fullName,
      target_role_names: parsed.data.roleNames,
      target_project_id: parsed.data.projectId,
      target_employee_id: parsed.data.employeeId,
    })
    .single();

  if (error || !data) {
    if (isRlsViolation(error)) forbidden();
    if (isUniqueViolation(error)) return { ok: false, error: { code: "conflict", message: "There's already a pending invitation for this email address." } };
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't send the invitation. Try again." } };
  }

  revalidateInvitationPaths();
  return { ok: true, data: { invitation: data.invitation, token: data.token } };
}

export async function resendInvitation(invitationId: string): Promise<ActionResult<CreateInvitationResult>> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resend_invitation", { target_invitation_id: invitationId }).single();

  if (error || !data) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't resend the invitation. Try again." } };
  }

  revalidateInvitationPaths();
  return { ok: true, data: { invitation: data.invitation, token: data.token } };
}

export async function revokeInvitation(invitationId: string, input: RevokeInvitationInput): Promise<ActionResult<CompanyInvitation>> {
  const parsed = revokeInvitationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_invitation", { target_invitation_id: invitationId, target_reason: parsed.data.reason ?? undefined }).single();

  if (error || !data) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't revoke the invitation. Try again." } };
  }

  revalidateInvitationPaths();
  return { ok: true, data };
}

export type AcceptInvitationResult = { companyId: string; employeeId: string | null; membershipId: string; roleNames: string[]; projectId: string | null };

async function runAcceptInvitation(supabase: Awaited<ReturnType<typeof createClient>>, token: string): Promise<ActionResult<AcceptInvitationResult>> {
  const { data, error } = await supabase.rpc("accept_invitation", { target_token: token });

  if (error || !data) {
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't accept the invitation. Try again." } };
  }

  const result = data as { company_id: string; employee_id: string | null; membership_id: string; role_names: string[]; project_id: string | null };
  revalidatePath("/", "layout");
  return { ok: true, data: { companyId: result.company_id, employeeId: result.employee_id, membershipId: result.membership_id, roleNames: result.role_names, projectId: result.project_id } };
}

/** The final step of items 16/17 — called from the accept-invite page once an ALREADY-authenticated invitee (matching email) confirms. */
export async function acceptInvitation(token: string): Promise<ActionResult<AcceptInvitationResult>> {
  await requireUser();
  const supabase = await createClient();
  return runAcceptInvitation(supabase, token);
}

/**
 * Item 16 — "Create/activate auth identity safely" for an invitee who has
 * no account yet. Mirrors modules/auth/actions.ts's login() pattern
 * exactly: a server-side Supabase client's signUp() sets the session
 * cookie directly in THIS response (when the project's email-confirmation
 * setting is off, matching this environment's config), so
 * accept_invitation() can run immediately after in the same request —
 * no insecure temporary shared password is ever generated (item 15's
 * explicit prohibition); the invitee chooses their own password here,
 * exactly like a normal signup. If confirmation IS required (a different
 * environment's auth settings), signUp() succeeds but no session exists
 * yet — the caller is told to confirm their email and revisit this link.
 */
export async function signUpAndAcceptInvitation(token: string, email: string, password: string): Promise<ActionResult<AcceptInvitationResult | { needsEmailConfirmation: true }>> {
  if (!email.trim() || !password || password.length < 8) {
    return { ok: false, error: { code: "validation_error", message: "A valid email and a password of at least 8 characters are required." } };
  }

  const supabase = await createClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) {
    return { ok: false, error: { code: "validation_error", message: signUpError.message } };
  }
  if (!signUpData.session) {
    return { ok: true, data: { needsEmailConfirmation: true } };
  }

  return runAcceptInvitation(supabase, token);
}
