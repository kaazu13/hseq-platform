"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { requireCompanyMembership, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import { canManageScaffoldDefectDetails, canUpdateScaffoldDefectProgress, canCloseScaffoldDefect } from "./permissions";
import { isCallerProjectAccessible } from "@/modules/scaffolds/queries";
import {
  scaffoldDefectFormSchema,
  scaffoldDefectProgressFormSchema,
  scaffoldDefectCloseFormSchema,
  scaffoldDefectReasonFormSchema,
  type ScaffoldDefectFormInput,
  type ScaffoldDefectProgressFormInput,
  type ScaffoldDefectCloseFormInput,
  type ScaffoldDefectReasonFormInput,
} from "./validation";

/**
 * Server Functions for the Scaffold Defects domain — mirrors
 * modules/corrective-actions/actions.ts's shape exactly, with the
 * narrower role set modules/scaffold-defects/permissions.ts documents.
 */

async function getMyEmployeeId(companyId: string, userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("employees").select("id").eq("company_id", companyId).eq("profile_id", userId).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function requireManageDetailsAccess(companyId: string, projectId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, hasProjectAccess] = await Promise.all([getUserRoleNames(companyId), isCallerProjectAccessible(projectId)]);

  if (!canManageScaffoldDefectDetails(roleNames, hasProjectAccess)) {
    forbidden();
  }

  return { user };
}

async function requireProgressAccess(companyId: string, projectId: string, responsiblePersonId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, hasProjectAccess, myEmployeeId] = await Promise.all([getUserRoleNames(companyId), isCallerProjectAccessible(projectId), getMyEmployeeId(companyId, user.id)]);

  const isAssignee = myEmployeeId !== null && myEmployeeId === responsiblePersonId;
  if (!canUpdateScaffoldDefectProgress(roleNames, hasProjectAccess, isAssignee)) {
    forbidden();
  }

  return { user };
}

async function requireCloseAccess(companyId: string, projectId: string, createdBy: string | null, responsiblePersonId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, hasProjectAccess, myEmployeeId] = await Promise.all([getUserRoleNames(companyId), isCallerProjectAccessible(projectId), getMyEmployeeId(companyId, user.id)]);

  const isOwnEntry = createdBy === user.id || (myEmployeeId !== null && myEmployeeId === responsiblePersonId);
  if (!canCloseScaffoldDefect(roleNames, hasProjectAccess, isOwnEntry)) {
    forbidden();
  }

  return { user };
}

export async function createScaffoldDefect(
  companyId: string,
  inspectionId: string,
  scaffoldId: string,
  projectId: string,
  input: ScaffoldDefectFormInput,
): Promise<ActionResult<{ defectId: string }>> {
  const parsed = scaffoldDefectFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireManageDetailsAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scaffold_defects")
    .insert({
      company_id: companyId,
      scaffold_inspection_id: inspectionId,
      // scaffold_id/project_id are re-derived and validated by
      // sync_scaffold_defect_denormalized_columns() regardless of what's
      // sent here (never client-trusted) — passed explicitly only because
      // the generated Insert type requires them (no DB-level default).
      scaffold_id: scaffoldId,
      project_id: projectId,
      inspection_item_id: parsed.data.inspectionItemId ?? null,
      description: parsed.data.description,
      severity: parsed.data.severity,
      responsible_person_id: parsed.data.responsiblePersonId,
      due_date: parsed.data.dueDate,
      immediate_control: parsed.data.immediateControl ?? null,
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
    return { ok: false, error: { code: "server_error", message: "Couldn't record the defect. Try again." } };
  }

  revalidatePath(`/scaffolds/${scaffoldId}/inspections/${inspectionId}/edit`);
  return { ok: true, data: { defectId: data.id } };
}

export async function updateScaffoldDefectDetails(
  companyId: string,
  defectId: string,
  inspectionId: string,
  scaffoldId: string,
  projectId: string,
  input: ScaffoldDefectFormInput,
): Promise<ActionResult<null>> {
  const parsed = scaffoldDefectFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireManageDetailsAccess(companyId, projectId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("scaffold_defects")
    .update(
      {
        description: parsed.data.description,
        severity: parsed.data.severity,
        responsible_person_id: parsed.data.responsiblePersonId,
        due_date: parsed.data.dueDate,
        immediate_control: parsed.data.immediateControl ?? null,
        updated_by: user.id,
      },
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .eq("id", defectId);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save changes. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Defect not found." } };
  }

  revalidatePath(`/scaffolds/${scaffoldId}/inspections/${inspectionId}/edit`);
  return { ok: true, data: null };
}

export async function updateScaffoldDefectProgress(
  companyId: string,
  defectId: string,
  inspectionId: string,
  scaffoldId: string,
  projectId: string,
  responsiblePersonId: string,
  input: ScaffoldDefectProgressFormInput,
): Promise<ActionResult<null>> {
  const parsed = scaffoldDefectProgressFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the status update.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireProgressAccess(companyId, projectId, responsiblePersonId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("scaffold_defects")
    .update({ status: parsed.data.status, completion_notes: parsed.data.completionNotes ?? null, updated_by: user.id }, { count: "exact" })
    .eq("company_id", companyId)
    .eq("id", defectId)
    .not("status", "in", "(closed,rejected)");

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't update the status. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Defect not found, or it's already closed/rejected." } };
  }

  revalidatePath(`/scaffolds/${scaffoldId}/inspections/${inspectionId}/edit`);
  return { ok: true, data: null };
}

export async function closeScaffoldDefect(
  companyId: string,
  defectId: string,
  inspectionId: string,
  scaffoldId: string,
  projectId: string,
  createdBy: string | null,
  responsiblePersonId: string,
  input: ScaffoldDefectCloseFormInput,
): Promise<ActionResult<null>> {
  const parsed = scaffoldDefectCloseFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the verification notes." } };
  }

  const { user } = await requireCloseAccess(companyId, projectId, createdBy, responsiblePersonId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("scaffold_defects")
    .update(
      { status: "closed", verification_notes: parsed.data.verificationNotes ?? null, verified_by: user.id, verified_at: new Date().toISOString(), updated_by: user.id },
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .eq("id", defectId)
    .eq("status", "awaiting_verification");

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't close this defect. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Defect not found, or it isn't awaiting verification." } };
  }

  revalidatePath(`/scaffolds/${scaffoldId}/inspections/${inspectionId}/edit`);
  return { ok: true, data: null };
}

export async function rejectScaffoldDefect(
  companyId: string,
  defectId: string,
  inspectionId: string,
  scaffoldId: string,
  projectId: string,
  createdBy: string | null,
  responsiblePersonId: string,
  input: ScaffoldDefectReasonFormInput,
): Promise<ActionResult<null>> {
  const parsed = scaffoldDefectReasonFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A reason is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireCloseAccess(companyId, projectId, createdBy, responsiblePersonId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("scaffold_defects")
    .update(
      { status: "rejected", reopen_reason: parsed.data.reason, verified_by: user.id, verified_at: new Date().toISOString(), updated_by: user.id },
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .eq("id", defectId)
    .eq("status", "awaiting_verification");

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't reject this defect. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Defect not found, or it isn't awaiting verification." } };
  }

  revalidatePath(`/scaffolds/${scaffoldId}/inspections/${inspectionId}/edit`);
  return { ok: true, data: null };
}

export async function reopenScaffoldDefect(
  companyId: string,
  defectId: string,
  inspectionId: string,
  scaffoldId: string,
  projectId: string,
  createdBy: string | null,
  responsiblePersonId: string,
  input: ScaffoldDefectReasonFormInput,
): Promise<ActionResult<null>> {
  const parsed = scaffoldDefectReasonFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A reason is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireCloseAccess(companyId, projectId, createdBy, responsiblePersonId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("scaffold_defects")
    .update({ status: "open", reopen_reason: parsed.data.reason, updated_by: user.id }, { count: "exact" })
    .eq("company_id", companyId)
    .eq("id", defectId)
    .in("status", ["closed", "rejected"]);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't reopen this defect. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Defect not found, or it isn't closed/rejected." } };
  }

  revalidatePath(`/scaffolds/${scaffoldId}/inspections/${inspectionId}/edit`);
  return { ok: true, data: null };
}
