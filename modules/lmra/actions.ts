"use server";

import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import { requireCompanyMembership, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isUniqueViolation, isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import { canManageLmra, canArchiveLmra } from "./permissions";
import { isCallerProjectForeman } from "./queries";
import {
  lmraAssessmentFormSchema,
  lmraHazardsFormSchema,
  lmraParticipantsFormSchema,
  lmraReviewFormSchema,
  lmraSubmitFormSchema,
  type LmraAssessmentFormInput,
  type LmraHazardsFormInput,
  type LmraParticipantsFormInput,
  type LmraReviewFormInput,
  type LmraSubmitFormInput,
} from "./validation";

/**
 * Server Functions for the LMRA domain — same fixed recipe as every other
 * module (docs/API_CONVENTIONS.md §3). The auth gate is genuinely
 * different from every other module built so far: docs/
 * ROLES_AND_PERMISSIONS.md §5's LMRA row gives Company Manager/Workforce
 * Coordinator View only, not Full — so `requireLmraManageAccess` below is
 * NOT `requireAnyRole(companyId, EMPLOYEE_WRITE_ROLES)`-shaped; it
 * checks hseq_manager OR the caller's own foreman standing on the specific
 * project, mirroring modules/projects/actions.ts's
 * `requireProjectManageAccess` in spirit but against different roles.
 */

async function requireLmraManageAccess(companyId: string, projectId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, isForeman] = await Promise.all([
    getUserRoleNames(companyId),
    isCallerProjectForeman(companyId, projectId, user.id),
  ]);

  if (!canManageLmra(roleNames, isForeman)) {
    forbidden();
  }

  return { user, roleNames };
}

export async function createLmra(companyId: string, input: LmraAssessmentFormInput): Promise<ActionResult<{ lmraId: string }>> {
  const parsed = lmraAssessmentFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireLmraManageAccess(companyId, parsed.data.projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lmra_assessments")
    .insert({
      company_id: companyId,
      project_id: parsed.data.projectId,
      work_area: parsed.data.workArea,
      work_activity: parsed.data.workActivity,
      work_date: parsed.data.workDate,
      shift: parsed.data.shift,
      responsible_foreman_id: parsed.data.responsibleForemanId,
      notes: parsed.data.notes ?? null,
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
    return { ok: false, error: { code: "server_error", message: "Couldn't create the LMRA. Try again." } };
  }

  revalidatePath("/lmra");
  redirect(`/lmra/${data.id}/edit`);
}

export async function updateLmra(companyId: string, lmraId: string, input: LmraAssessmentFormInput): Promise<ActionResult<null>> {
  const parsed = lmraAssessmentFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireLmraManageAccess(companyId, parsed.data.projectId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("lmra_assessments")
    .update({
      work_area: parsed.data.workArea,
      work_activity: parsed.data.workActivity,
      work_date: parsed.data.workDate,
      shift: parsed.data.shift,
      responsible_foreman_id: parsed.data.responsibleForemanId,
      notes: parsed.data.notes ?? null,
      updated_by: user.id,
    }, { count: "exact" })
    .eq("company_id", companyId)
    .eq("id", lmraId);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save changes. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "LMRA not found, or it's no longer editable." } };
  }

  revalidatePath(`/lmra/${lmraId}`);
  revalidatePath(`/lmra/${lmraId}/edit`);
  return { ok: true, data: null };
}

export async function updateLmraHazards(companyId: string, lmraId: string, projectId: string, input: LmraHazardsFormInput): Promise<ActionResult<null>> {
  const parsed = lmraHazardsFormSchema.safeParse(input);
  if (!parsed.success) {
    // Array schema — flattenFieldErrors() expects an object schema's
    // Record<string, string[]> shape, not the array-indexed shape zod
    // produces here. The checklist has exactly 12 fixed rows rendered
    // inline, so a plain message is enough; there's no separate field to
    // point a fieldErrors key at.
    return { ok: false, error: { code: "validation_error", message: "Check the hazard checklist — every field is required." } };
  }

  await requireLmraManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { error } = await supabase.rpc("save_lmra_hazards", {
    target_lmra_id: lmraId,
    target_hazards: parsed.data.map((h) => ({
      hazard_type: h.hazardType,
      is_applicable: h.isApplicable,
      controls: h.controls || null,
      responsible_person_id: h.responsiblePersonId,
      controls_confirmed: h.controlsConfirmed,
      other_description: h.otherDescription || null,
    })),
  });

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save the hazard checklist. Try again." } };
  }

  revalidatePath(`/lmra/${lmraId}/edit`);
  return { ok: true, data: null };
}

export async function updateLmraParticipants(companyId: string, lmraId: string, projectId: string, input: LmraParticipantsFormInput): Promise<ActionResult<null>> {
  const parsed = lmraParticipantsFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the selected workers." } };
  }

  await requireLmraManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data: current, error: currentError } = await supabase
    .from("lmra_participants")
    .select("employee_id")
    .eq("lmra_assessment_id", lmraId);
  if (currentError) return { ok: false, error: { code: "server_error", message: "Couldn't load the current worker list. Try again." } };

  const currentIds = new Set((current ?? []).map((row) => row.employee_id));
  const desiredIds = new Set(parsed.data);
  const toAdd = [...desiredIds].filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !desiredIds.has(id));

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("lmra_participants")
      .insert(toAdd.map((employeeId) => ({ company_id: companyId, lmra_assessment_id: lmraId, employee_id: employeeId })));
    if (error) {
      if (isRlsViolation(error)) forbidden();
      if (isUniqueViolation(error)) {
        return { ok: false, error: { code: "conflict", message: "One of those workers was just added — refresh and try again." } };
      }
      if (isRaisedException(error)) {
        return { ok: false, error: { code: "validation_error", message: error.message } };
      }
      return { ok: false, error: { code: "server_error", message: "Couldn't update the worker list. Try again." } };
    }
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("lmra_participants")
      .delete()
      .eq("lmra_assessment_id", lmraId)
      .in("employee_id", toRemove);
    if (error) {
      if (isRlsViolation(error)) forbidden();
      return { ok: false, error: { code: "server_error", message: "Couldn't update the worker list. Try again." } };
    }
  }

  revalidatePath(`/lmra/${lmraId}/edit`);
  return { ok: true, data: null };
}

/** Requires explicit confirmation before submission (docs/UI_GUIDELINES.md §5) — the calling UI shows a ConfirmDialog; this is the point where the go/no-go decision and, if stopping work, the reason, are actually recorded. */
export async function submitLmra(companyId: string, lmraId: string, projectId: string, input: LmraSubmitFormInput): Promise<ActionResult<null>> {
  const parsed = lmraSubmitFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the go/no-go decision.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireLmraManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("lmra_assessments")
    .update({
      status: "submitted",
      result: parsed.data.result,
      stop_work_reason: parsed.data.result === "no_go" ? (parsed.data.stopWorkReason ?? null) : null,
      submitted_by: user.id,
      submitted_at: new Date().toISOString(),
      updated_by: user.id,
    }, { count: "exact" })
    .eq("company_id", companyId)
    .eq("id", lmraId)
    .eq("status", "draft");

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't submit the LMRA. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "LMRA not found, or it isn't a draft anymore." } };
  }

  revalidatePath("/lmra");
  revalidatePath(`/lmra/${lmraId}`);
  return { ok: true, data: null };
}

/** Review + approve/reject in one step — docs/ROLES_AND_PERMISSIONS.md §5's "M"/"F" legend both include "approve" as part of the same write capability, not a separate role tier. */
export async function reviewLmra(companyId: string, lmraId: string, projectId: string, input: LmraReviewFormInput): Promise<ActionResult<null>> {
  const parsed = lmraReviewFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the review decision.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireLmraManageAccess(companyId, projectId);
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { error, count } = await supabase
    .from("lmra_assessments")
    .update({
      status: parsed.data.decision,
      reviewed_by: user.id,
      reviewed_at: now,
      review_notes: parsed.data.reviewNotes ?? null,
      approved_at: parsed.data.decision === "approved" ? now : null,
      updated_by: user.id,
    }, { count: "exact" })
    .eq("company_id", companyId)
    .eq("id", lmraId)
    .eq("status", "submitted");

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't record the review. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "LMRA not found, or it isn't awaiting review anymore." } };
  }

  revalidatePath("/lmra");
  revalidatePath(`/lmra/${lmraId}`);
  return { ok: true, data: null };
}

/** Reopens an approved/rejected assessment for correction — back to draft, editable again. */
export async function reopenLmra(companyId: string, lmraId: string, projectId: string): Promise<ActionResult<null>> {
  await requireLmraManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("lmra_assessments")
    .update({ status: "draft" }, { count: "exact" })
    .eq("company_id", companyId)
    .eq("id", lmraId)
    .in("status", ["approved", "rejected"]);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't reopen the LMRA. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "LMRA not found, or it can't be reopened from its current status." } };
  }

  revalidatePath(`/lmra/${lmraId}`);
  return { ok: true, data: null };
}

/**
 * Archive — HSE Manager only (docs' "F" vs Foreman's "M"). The database
 * trigger (validate_lmra_assessment_update) is the real enforcement of
 * that distinction; `canArchiveLmra` here is UI-gating only, same
 * discipline as every other permissions.ts check in this codebase.
 */
export async function archiveLmra(companyId: string, lmraId: string): Promise<ActionResult<null>> {
  const { user, roleNames } = await requireCompanyMembershipAndRoles(companyId);
  if (!canArchiveLmra(roleNames)) {
    forbidden();
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("lmra_assessments")
    .update({ status: "archived", archived_by: user.id, archived_at: new Date().toISOString() }, { count: "exact" })
    .eq("company_id", companyId)
    .eq("id", lmraId)
    .neq("status", "archived");

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't archive the LMRA. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "LMRA not found, or it's already archived." } };
  }

  revalidatePath("/lmra");
  revalidatePath(`/lmra/${lmraId}`);
  return { ok: true, data: null };
}

async function requireCompanyMembershipAndRoles(companyId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const roleNames = await getUserRoleNames(companyId);
  return { user, roleNames };
}
