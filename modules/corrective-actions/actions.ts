"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { requireCompanyMembership, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import { canCreateCorrectiveAction, canManageCorrectiveActionDetails, canUpdateCorrectiveActionProgress, canCloseCorrectiveAction } from "./permissions";
import { isCallerProjectManager } from "./queries";
import { isCallerProjectAccessible } from "@/modules/observations/queries";
import {
  correctiveActionFormSchema,
  correctiveActionProgressFormSchema,
  correctiveActionCloseFormSchema,
  correctiveActionReasonFormSchema,
  type CorrectiveActionFormInput,
  type CorrectiveActionProgressFormInput,
  type CorrectiveActionCloseFormInput,
  type CorrectiveActionReasonFormInput,
} from "./validation";

/**
 * Server Functions for the Corrective Actions domain — same fixed recipe
 * as every other module (docs/API_CONVENTIONS.md §3). Every gate below
 * mirrors modules/corrective-actions/permissions.ts, which itself mirrors
 * the database's can_close_corrective_action()/validate_corrective_action_update()
 * exactly — see that migration's header comment for the full role
 * breakdown this module implements.
 */

async function getMyEmployeeId(companyId: string, userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id")
    .eq("company_id", companyId)
    .eq("profile_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function requireCreateAccess(companyId: string, projectId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, isProjectManager, hasProjectAccess] = await Promise.all([
    getUserRoleNames(companyId),
    isCallerProjectManager(projectId),
    isCallerProjectAccessible(projectId),
  ]);

  if (!canCreateCorrectiveAction(roleNames, isProjectManager, hasProjectAccess)) {
    forbidden();
  }

  return { user };
}

async function requireManageDetailsAccess(companyId: string, projectId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, isProjectManager, hasProjectAccess] = await Promise.all([
    getUserRoleNames(companyId),
    isCallerProjectManager(projectId),
    isCallerProjectAccessible(projectId),
  ]);

  if (!canManageCorrectiveActionDetails(roleNames, isProjectManager, hasProjectAccess)) {
    forbidden();
  }

  return { user };
}

async function requireProgressAccess(companyId: string, projectId: string, responsiblePersonId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, isProjectManager, hasProjectAccess, myEmployeeId] = await Promise.all([
    getUserRoleNames(companyId),
    isCallerProjectManager(projectId),
    isCallerProjectAccessible(projectId),
    getMyEmployeeId(companyId, user.id),
  ]);

  const isAssignee = myEmployeeId !== null && myEmployeeId === responsiblePersonId;
  if (!canUpdateCorrectiveActionProgress(roleNames, isProjectManager, hasProjectAccess, isAssignee)) {
    forbidden();
  }

  return { user };
}

async function requireCloseAccess(companyId: string, projectId: string, createdBy: string | null, responsiblePersonId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, isProjectManager, myEmployeeId] = await Promise.all([
    getUserRoleNames(companyId),
    isCallerProjectManager(projectId),
    getMyEmployeeId(companyId, user.id),
  ]);

  const isOwnEntry = createdBy === user.id || (myEmployeeId !== null && myEmployeeId === responsiblePersonId);
  if (!canCloseCorrectiveAction(roleNames, isProjectManager, isOwnEntry)) {
    forbidden();
  }

  return { user };
}

export async function createCorrectiveAction(
  companyId: string,
  observationId: string,
  projectId: string,
  input: CorrectiveActionFormInput,
): Promise<ActionResult<{ actionId: string }>> {
  const parsed = correctiveActionFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireCreateAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("corrective_actions")
    .insert({
      company_id: companyId,
      observation_id: observationId,
      project_id: projectId,
      description: parsed.data.description,
      responsible_person_id: parsed.data.responsiblePersonId,
      priority: parsed.data.priority,
      due_date: parsed.data.dueDate,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't create the corrective action. Try again." } };
  }

  revalidatePath(`/observations/${observationId}`);
  return { ok: true, data: { actionId: data.id } };
}

export async function updateCorrectiveActionDetails(
  companyId: string,
  actionId: string,
  observationId: string,
  projectId: string,
  input: CorrectiveActionFormInput,
): Promise<ActionResult<null>> {
  const parsed = correctiveActionFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireManageDetailsAccess(companyId, projectId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("corrective_actions")
    .update(
      {
        description: parsed.data.description,
        responsible_person_id: parsed.data.responsiblePersonId,
        priority: parsed.data.priority,
        due_date: parsed.data.dueDate,
        updated_by: user.id,
      },
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .eq("id", actionId);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save changes. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Corrective action not found." } };
  }

  revalidatePath(`/observations/${observationId}`);
  return { ok: true, data: null };
}

export async function updateCorrectiveActionProgress(
  companyId: string,
  actionId: string,
  observationId: string,
  projectId: string,
  responsiblePersonId: string,
  input: CorrectiveActionProgressFormInput,
): Promise<ActionResult<null>> {
  const parsed = correctiveActionProgressFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the status update.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireProgressAccess(companyId, projectId, responsiblePersonId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("corrective_actions")
    .update(
      { status: parsed.data.status, completion_notes: parsed.data.completionNotes ?? null, updated_by: user.id },
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .eq("id", actionId)
    .not("status", "in", "(closed,rejected)");

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't update the status. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Corrective action not found, or it's already closed/rejected." } };
  }

  revalidatePath(`/observations/${observationId}`);
  return { ok: true, data: null };
}

export async function closeCorrectiveAction(
  companyId: string,
  actionId: string,
  observationId: string,
  projectId: string,
  createdBy: string | null,
  responsiblePersonId: string,
  input: CorrectiveActionCloseFormInput,
): Promise<ActionResult<null>> {
  const parsed = correctiveActionCloseFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the closure evidence." } };
  }

  const { user } = await requireCloseAccess(companyId, projectId, createdBy, responsiblePersonId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("corrective_actions")
    .update(
      {
        status: "closed",
        closure_evidence: parsed.data.closureEvidence ?? null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .eq("id", actionId)
    .eq("status", "awaiting_verification");

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't close this action. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Corrective action not found, or it isn't awaiting verification." } };
  }

  revalidatePath(`/observations/${observationId}`);
  return { ok: true, data: null };
}

export async function rejectCorrectiveAction(
  companyId: string,
  actionId: string,
  observationId: string,
  projectId: string,
  createdBy: string | null,
  responsiblePersonId: string,
  input: CorrectiveActionReasonFormInput,
): Promise<ActionResult<null>> {
  const parsed = correctiveActionReasonFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A reason is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireCloseAccess(companyId, projectId, createdBy, responsiblePersonId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("corrective_actions")
    .update(
      { status: "rejected", reopen_reason: parsed.data.reason, reviewed_by: user.id, reviewed_at: new Date().toISOString(), updated_by: user.id },
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .eq("id", actionId)
    .eq("status", "awaiting_verification");

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't reject this action. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Corrective action not found, or it isn't awaiting verification." } };
  }

  revalidatePath(`/observations/${observationId}`);
  return { ok: true, data: null };
}

export async function reopenCorrectiveAction(
  companyId: string,
  actionId: string,
  observationId: string,
  projectId: string,
  createdBy: string | null,
  responsiblePersonId: string,
  input: CorrectiveActionReasonFormInput,
): Promise<ActionResult<null>> {
  const parsed = correctiveActionReasonFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A reason is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireCloseAccess(companyId, projectId, createdBy, responsiblePersonId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("corrective_actions")
    .update(
      { status: "open", reopen_reason: parsed.data.reason, updated_by: user.id },
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .eq("id", actionId)
    .in("status", ["closed", "rejected"]);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't reopen this action. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Corrective action not found, or it isn't closed/rejected." } };
  }

  revalidatePath(`/observations/${observationId}`);
  return { ok: true, data: null };
}
