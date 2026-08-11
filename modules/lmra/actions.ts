"use server";

import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import { requireCompanyMembership, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import { canCreateLmra, canManageLmra, canArchiveLmra } from "./permissions";
import { isCallerProjectForeman, isCallerProjectAccessible, getMyEmployeeId, listDailyTeamsForDate } from "./queries";
import type { DailyTeamWithMembers } from "@/modules/daily-workforce/types";
import {
  lmraCreateFormSchema,
  lmraEditFormSchema,
  lmraReviewFormSchema,
  lmraSubmitFormSchema,
  type LmraCreateFormInput,
  type LmraEditFormInput,
  type LmraReviewFormInput,
  type LmraSubmitFormInput,
} from "./validation";

/**
 * Server Functions for the LMRA domain — same fixed recipe as every other
 * module (docs/API_CONVENTIONS.md §3). Phase 1 of the redesign opened
 * creation to any eligible project worker; `requireLmraCreateAccess` below
 * resolves the caller's OWN linked employee id and, for a non-elevated
 * caller, that id is the ONLY value ever used for completed_by_employee_id
 * — never a client-supplied one (RLS's is_own_employee() branch is the real
 * backstop even if this were bypassed, but resolving it server-side here
 * gives a clean error instead of a raw RLS violation for the common case).
 */

async function requireLmraCreateAccess(companyId: string, projectId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, isForeman, hasProjectAccess, myEmployeeId] = await Promise.all([
    getUserRoleNames(companyId),
    isCallerProjectForeman(companyId, projectId, user.id),
    isCallerProjectAccessible(projectId),
    getMyEmployeeId(companyId, user.id),
  ]);

  if (!canCreateLmra(roleNames, hasProjectAccess, isForeman)) {
    forbidden();
  }

  const isElevated = roleNames.includes("hseq_manager") || isForeman;
  if (!isElevated && !myEmployeeId) {
    // Eligible for project access but has no linked employee record in
    // this company — there is no valid "completed by" identity to pin.
    forbidden();
  }

  return { user, isElevated, myEmployeeId };
}

async function requireLmraManageAccess(companyId: string, lmraId: string, projectId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const supabase = await createClient();

  const [roleNames, isForeman, myEmployeeId, { data: assessment }] = await Promise.all([
    getUserRoleNames(companyId),
    isCallerProjectForeman(companyId, projectId, user.id),
    getMyEmployeeId(companyId, user.id),
    supabase.from("lmra_assessments").select("completed_by_employee_id").eq("company_id", companyId).eq("id", lmraId).maybeSingle(),
  ]);

  const isOwnAssessment = Boolean(assessment && myEmployeeId && assessment.completed_by_employee_id === myEmployeeId);

  if (!canManageLmra(roleNames, isForeman, isOwnAssessment)) {
    forbidden();
  }

  return { user, roleNames };
}

/**
 * "Add Today's Team" (Phase 3) — the Today's Teams for the LMRA's OWN
 * work_date (never re-resolved dynamically from a "current" team; a
 * backdated LMRA correctly sees that historical day's roster, same
 * guarantee daily_teams' own design already provides). Read-only: gated by
 * plain company membership + project access, same reach as viewing the
 * LMRA create form itself — RLS on daily_teams/daily_team_members is the
 * real scoping (an ordinary worker only sees teams they were themselves a
 * member of that day; a Foreman/PM/HSE/Inspector/company-wide manager sees
 * every team — see that migration's header comment for why this asymmetry
 * is correct, not a bug).
 */
export async function listTodaysTeamsForLmra(companyId: string, projectId: string, workDate: string): Promise<DailyTeamWithMembers[]> {
  await requireCompanyMembership(companyId);
  const hasAccess = await isCallerProjectAccessible(projectId);
  if (!hasAccess) {
    const roleNames = await getUserRoleNames(companyId);
    if (!roleNames.some((role) => ["company_admin", "operations_manager", "hseq_manager"].includes(role))) {
      forbidden();
    }
  }
  return listDailyTeamsForDate(companyId, projectId, workDate);
}

/**
 * The one-shot create path (Phase 7) — work details, workers involved,
 * hazards+controls, and (if `submit`) the final go/no-go confirmation, all
 * saved atomically via create_lmra_assessment(). Redirects to the new
 * assessment's canonical view page on success — never leaves the caller on
 * the creation form.
 */
export async function createLmraComplete(companyId: string, input: LmraCreateFormInput): Promise<ActionResult<null>> {
  const parsed = lmraCreateFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { isElevated, myEmployeeId } = await requireLmraCreateAccess(companyId, parsed.data.projectId);
  const completedByEmployeeId = isElevated ? parsed.data.completedByEmployeeId : (myEmployeeId as string);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_lmra_assessment", {
    target_company_id: companyId,
    target_project_id: parsed.data.projectId,
    target_work_area: parsed.data.workArea,
    target_work_activity: parsed.data.workActivity,
    target_work_date: parsed.data.workDate,
    target_shift: parsed.data.shift,
    target_completed_by_employee_id: completedByEmployeeId,
    target_responsible_person_id: parsed.data.responsiblePersonId as string,
    target_notes: (parsed.data.notes ?? null) as string,
    target_participant_employee_ids: parsed.data.participantEmployeeIds,
    target_hazards: parsed.data.hazards.map((h) => ({
      hazard_type: h.hazardType,
      is_applicable: h.isApplicable,
      controls: h.controls || null,
      selected_controls: h.selectedControls,
      responsible_person_id: h.responsiblePersonId,
      controls_confirmed: h.controlsConfirmed,
      other_description: h.otherDescription || null,
    })),
    target_submit: parsed.data.submit,
    target_result: parsed.data.result,
    target_stop_work_reason: (parsed.data.result === "no_go" ? (parsed.data.stopWorkReason ?? null) : null) as string,
  });

  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save the LMRA. Try again." } };
  }

  revalidatePath("/lmra");
  redirect(`/lmra/${data.id}`);
}

/**
 * The one-shot edit path (Phase 9) — core fields always; hazards/
 * participants only while still draft (update_lmra_assessment() silently
 * leaves them untouched otherwise, matching the read-only UI for a
 * submitted/approved/rejected record). Redirects to the view page on
 * success.
 */
export async function updateLmraComplete(companyId: string, lmraId: string, projectId: string, input: LmraEditFormInput): Promise<ActionResult<null>> {
  const parsed = lmraEditFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireLmraManageAccess(companyId, lmraId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("update_lmra_assessment", {
    target_lmra_id: lmraId,
    target_work_area: parsed.data.workArea,
    target_work_activity: parsed.data.workActivity,
    target_work_date: parsed.data.workDate,
    target_shift: parsed.data.shift,
    target_responsible_person_id: parsed.data.responsiblePersonId as string,
    target_notes: (parsed.data.notes ?? null) as string,
    target_participant_employee_ids: parsed.data.participantEmployeeIds,
    target_hazards: parsed.data.hazards.map((h) => ({
      hazard_type: h.hazardType,
      is_applicable: h.isApplicable,
      controls: h.controls || null,
      selected_controls: h.selectedControls,
      responsible_person_id: h.responsiblePersonId,
      controls_confirmed: h.controlsConfirmed,
      other_description: h.otherDescription || null,
    })),
  });

  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save changes. Try again." } };
  }

  revalidatePath("/lmra");
  revalidatePath(`/lmra/${lmraId}`);
  redirect(`/lmra/${lmraId}`);
}

/** Requires explicit confirmation before submission (docs/UI_GUIDELINES.md §5) — the calling UI shows a ConfirmDialog; this is the point where the go/no-go decision and, if stopping work, the reason, are actually recorded for a draft saved earlier via "Save Draft." */
export async function submitLmra(companyId: string, lmraId: string, projectId: string, input: LmraSubmitFormInput): Promise<ActionResult<null>> {
  const parsed = lmraSubmitFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the go/no-go decision.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireLmraManageAccess(companyId, lmraId, projectId);
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

  const { user } = await requireLmraManageAccess(companyId, lmraId, projectId);
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
  await requireLmraManageAccess(companyId, lmraId, projectId);
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
 * Archive — HSE Manager only (docs' "F" vs Foreman's/an ordinary worker's
 * "M"). The database trigger (validate_lmra_assessment_update) is the real
 * enforcement of that distinction; `canArchiveLmra` here is UI-gating only,
 * same discipline as every other permissions.ts check in this codebase.
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
