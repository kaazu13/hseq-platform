"use server";

import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import { requireCompanyMembership, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRlsViolation, isRaisedException, isUniqueViolation } from "@/lib/supabase/errors";
import { canManageScaffold, canCreateScaffold } from "./permissions";
import { isCallerProjectAccessible, isCallerEligibleScaffoldForeman } from "./queries";
import {
  scaffoldFormSchema,
  inspectionFormSchema,
  inspectionItemsFormSchema,
  finalizeInspectionFormSchema,
  correctionReasonFormSchema,
  voidInspectionFormSchema,
  type ScaffoldFormInput,
  type InspectionFormInput,
  type InspectionItemsFormInput,
  type FinalizeInspectionFormInput,
  type CorrectionReasonFormInput,
  type VoidInspectionFormInput,
} from "./validation";

/**
 * Server Functions for the Scaffolds/Scaffold Inspections domain — same
 * fixed recipe as every other module (docs/API_CONVENTIONS.md §3).
 * requireScaffoldManageAccess() (unchanged) gates EDIT/inspection actions;
 * requireScaffoldCreateAccess() (V2, Part 4 of the post-audit
 * implementation package) is broader — see modules/scaffolds/permissions.ts's
 * header comment for exactly which roles/paths each covers.
 */

async function requireScaffoldManageAccess(companyId: string, projectId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, hasProjectAccess] = await Promise.all([getUserRoleNames(companyId), isCallerProjectAccessible(projectId)]);

  if (!canManageScaffold(roleNames, hasProjectAccess)) {
    forbidden();
  }

  return { user, roleNames };
}

async function requireScaffoldCreateAccess(companyId: string, projectId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, hasProjectAccess, isEligibleForeman] = await Promise.all([
    getUserRoleNames(companyId),
    isCallerProjectAccessible(projectId),
    isCallerEligibleScaffoldForeman(companyId, projectId),
  ]);

  if (!canCreateScaffold(roleNames, hasProjectAccess, isEligibleForeman)) {
    forbidden();
  }

  return { user, roleNames };
}

export async function createScaffold(companyId: string, input: ScaffoldFormInput): Promise<ActionResult<{ scaffoldId: string }>> {
  const parsed = scaffoldFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireScaffoldCreateAccess(companyId, parsed.data.projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scaffolds")
    .insert({
      company_id: companyId,
      project_id: parsed.data.projectId,
      tag_number: parsed.data.tagNumber,
      work_area: parsed.data.workArea,
      structure_reference: parsed.data.structureReference ?? null,
      scaffold_type: parsed.data.scaffoldType,
      intended_use: parsed.data.intendedUse,
      max_load_class: parsed.data.maxLoadClass,
      height_metres: parsed.data.heightMetres ?? null,
      length_metres: parsed.data.lengthMetres ?? null,
      width_metres: parsed.data.widthMetres ?? null,
      erected_by: parsed.data.erectedBy ?? null,
      responsible_foreman_id: parsed.data.responsibleForemanId,
      erected_at: parsed.data.erectedAt,
      notes: parsed.data.notes ?? null,
      inspection_interval_type: parsed.data.inspectionIntervalType,
      inspection_interval_days: parsed.data.inspectionIntervalDays,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isUniqueViolation(error)) {
      return { ok: false, error: { code: "conflict", message: "That tag number is already used on this project.", fieldErrors: { tagNumber: "Already in use on this project" } } };
    }
    if (error && isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't register the scaffold. Try again." } };
  }

  // V2 (Part 4C): bulk-insert the erection-team links in ONE call — a
  // single multi-row INSERT is one statement/transaction, so an
  // ineligible/mismatched-date/forged team id anywhere in the batch rolls
  // back the ENTIRE set (never a partial link list) rather than failing
  // row-by-row. The scaffold record itself is already committed at this
  // point (a separate, earlier statement) — if the team-link insert
  // fails, the scaffold still exists with zero erection teams, and the
  // caller is sent to its edit page to add them rather than losing
  // everything just entered.
  const erectionTeamRows = parsed.data.erectionTeamIds.map((dailyTeamId) => ({
    // company_id/project_id are re-derived and validated by
    // validate_scaffold_erection_team_insert() regardless of what's sent
    // here (never client-trusted) — passed explicitly only because the
    // generated Insert type requires them (no DB-level default).
    company_id: companyId,
    project_id: parsed.data.projectId,
    scaffold_id: data.id,
    daily_team_id: dailyTeamId,
    added_by: user.id,
  }));
  const { error: teamError } = await supabase.from("scaffold_erection_teams").insert(erectionTeamRows);
  if (teamError) {
    revalidatePath(`/companies/${companyId}/projects/${parsed.data.projectId}/scaffolds`);
    redirect(`/companies/${companyId}/projects/${parsed.data.projectId}/scaffolds/${data.id}/edit?teamError=1`);
  }

  // Part 5: return to the Scaffold Register list (not the detail page) —
  // the new scaffold is immediately visible there, with a success toast
  // and an optional "View scaffold" action (see ScaffoldRegisterListClient).
  revalidatePath(`/companies/${companyId}/projects/${parsed.data.projectId}/scaffolds`);
  revalidatePath(`/companies/${companyId}/projects/${parsed.data.projectId}`);
  redirect(`/companies/${companyId}/projects/${parsed.data.projectId}/scaffolds?created=${data.id}&tag=${encodeURIComponent(parsed.data.tagNumber)}`);
}

export async function updateScaffold(companyId: string, scaffoldId: string, projectId: string, input: ScaffoldFormInput): Promise<ActionResult<null>> {
  const parsed = scaffoldFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireScaffoldManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("scaffolds")
    .update(
      {
        tag_number: parsed.data.tagNumber,
        work_area: parsed.data.workArea,
        structure_reference: parsed.data.structureReference ?? null,
        scaffold_type: parsed.data.scaffoldType,
        intended_use: parsed.data.intendedUse,
        max_load_class: parsed.data.maxLoadClass,
        height_metres: parsed.data.heightMetres ?? null,
        length_metres: parsed.data.lengthMetres ?? null,
        width_metres: parsed.data.widthMetres ?? null,
        erected_by: parsed.data.erectedBy ?? null,
        responsible_foreman_id: parsed.data.responsibleForemanId,
        erected_at: parsed.data.erectedAt,
        notes: parsed.data.notes ?? null,
        inspection_interval_type: parsed.data.inspectionIntervalType,
        inspection_interval_days: parsed.data.inspectionIntervalDays,
        latitude: parsed.data.latitude ?? null,
        longitude: parsed.data.longitude ?? null,
        updated_by: user.id,
      },
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .eq("id", scaffoldId);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isUniqueViolation(error)) {
      return { ok: false, error: { code: "conflict", message: "That tag number is already used on this project.", fieldErrors: { tagNumber: "Already in use on this project" } } };
    }
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save changes. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Scaffold not found." } };
  }

  const teamResult = await reconcileScaffoldErectionTeams(supabase, companyId, projectId, scaffoldId, user.id, parsed.data.erectionTeamIds);
  if (!teamResult.ok) {
    return teamResult;
  }

  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffolds`);
  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffolds/${scaffoldId}`);
  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffolds/${scaffoldId}/edit`);
  return { ok: true, data: null };
}

/**
 * Reconciles a scaffold's erection-team links (Part 4C) to exactly
 * `nextDailyTeamIds`. Unlike the legacy `scaffold_team_members` roster,
 * `scaffold_erection_teams` has no soft-delete/history concept of its own
 * (the historical record IS the underlying `daily_teams` row, which is
 * never touched here) — a link is either present or removed, so this is a
 * plain diff/insert/delete rather than a removed_at-style archive.
 */
async function reconcileScaffoldErectionTeams(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  projectId: string,
  scaffoldId: string,
  actingUserId: string,
  nextDailyTeamIds: string[],
): Promise<ActionResult<null>> {
  const { data: current, error: currentError } = await supabase.from("scaffold_erection_teams").select("id, daily_team_id").eq("scaffold_id", scaffoldId);
  if (currentError) throw currentError;

  const nextSet = new Set(nextDailyTeamIds);
  const currentByDailyTeamId = new Map((current ?? []).map((row) => [row.daily_team_id, row]));

  const toRemove = (current ?? []).filter((row) => !nextSet.has(row.daily_team_id));
  const toAdd = nextDailyTeamIds.filter((dailyTeamId) => !currentByDailyTeamId.has(dailyTeamId));

  if (toRemove.length > 0) {
    const { error: removeError } = await supabase
      .from("scaffold_erection_teams")
      .delete()
      .in(
        "id",
        toRemove.map((row) => row.id),
      );
    if (removeError) {
      return { ok: false, error: { code: "server_error", message: "Couldn't update the erection teams. Try again." } };
    }
  }

  if (toAdd.length > 0) {
    const teamRows = toAdd.map((dailyTeamId) => ({
      company_id: companyId,
      project_id: projectId,
      scaffold_id: scaffoldId,
      daily_team_id: dailyTeamId,
      added_by: actingUserId,
    }));
    const { error: addError } = await supabase.from("scaffold_erection_teams").insert(teamRows);
    if (addError) {
      if (isRaisedException(addError)) {
        return { ok: false, error: { code: "validation_error", message: addError.message } };
      }
      return { ok: false, error: { code: "server_error", message: "Couldn't add the new erection teams. Try again." } };
    }
  }

  return { ok: true, data: null };
}

export async function createInspection(
  companyId: string,
  scaffoldId: string,
  projectId: string,
  input: InspectionFormInput,
): Promise<ActionResult<{ inspectionId: string }>> {
  const parsed = inspectionFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireScaffoldManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scaffold_inspections")
    .insert({
      company_id: companyId,
      scaffold_id: scaffoldId,
      // project_id is re-derived and validated by
      // sync_scaffold_inspection_project_id() regardless of what's sent
      // here (never client-trusted) — passed explicitly only because the
      // generated Insert type requires it (no DB-level default).
      project_id: projectId,
      inspection_reason: parsed.data.inspectionReason,
      previous_inspection_id: parsed.data.previousInspectionId ?? null,
      inspector_id: parsed.data.inspectorId,
      inspected_at: new Date(parsed.data.inspectedAt).toISOString(),
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
    return { ok: false, error: { code: "server_error", message: "Couldn't start the inspection. Try again." } };
  }

  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffolds/${scaffoldId}`);
  redirect(`/companies/${companyId}/projects/${projectId}/scaffolds/${scaffoldId}/inspections/${data.id}/edit`);
}

/** Starts a correction to an already-finalized inspection — a new draft inspection with `corrects_inspection_id` set, requiring a reason. Goes through the exact same create path (and draft workflow) as any other inspection; finalizing it is what actually links it back to the original (see finalize_scaffold_inspection() in the migration). */
export async function startInspectionCorrection(
  companyId: string,
  scaffoldId: string,
  projectId: string,
  correctsInspectionId: string,
  input: CorrectionReasonFormInput,
): Promise<ActionResult<{ inspectionId: string }>> {
  const parsed = correctionReasonFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A reason is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireScaffoldManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data: original, error: originalError } = await supabase.from("scaffold_inspections").select("inspection_reason, inspector_id, inspected_at, notes").eq("id", correctsInspectionId).single();
  if (originalError || !original) {
    return { ok: false, error: { code: "not_found", message: "The inspection being corrected could not be found." } };
  }

  const { data, error } = await supabase
    .from("scaffold_inspections")
    .insert({
      company_id: companyId,
      scaffold_id: scaffoldId,
      // project_id is re-derived and validated by
      // sync_scaffold_inspection_project_id() regardless of what's sent
      // here (never client-trusted) — passed explicitly only because the
      // generated Insert type requires it (no DB-level default).
      project_id: projectId,
      inspection_reason: original.inspection_reason,
      inspector_id: original.inspector_id,
      inspected_at: original.inspected_at,
      notes: original.notes,
      corrects_inspection_id: correctsInspectionId,
      correction_reason: parsed.data.correctionReason,
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
    return { ok: false, error: { code: "server_error", message: "Couldn't start the correction. Try again." } };
  }

  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffolds/${scaffoldId}`);
  redirect(`/companies/${companyId}/projects/${projectId}/scaffolds/${scaffoldId}/inspections/${data.id}/edit`);
}

export async function updateInspectionItems(
  companyId: string,
  inspectionId: string,
  scaffoldId: string,
  projectId: string,
  input: InspectionItemsFormInput,
): Promise<ActionResult<null>> {
  const parsed = inspectionItemsFormSchema.safeParse(input);
  if (!parsed.success) {
    // Array schema — same shape as modules/lmra/actions.ts's
    // updateLmraHazards: flattenFieldErrors() expects an object schema's
    // Record<string, string[]> shape, not this array-indexed one.
    return { ok: false, error: { code: "validation_error", message: "Check the checklist — every field is required." } };
  }

  await requireScaffoldManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { error } = await supabase.rpc("save_scaffold_inspection_items", {
    target_inspection_id: inspectionId,
    target_items: parsed.data.map((item) => ({
      item_type: item.itemType,
      result: item.result,
      comment: item.comment || null,
      required_corrective_action: item.requiredCorrectiveAction || null,
      severity: item.severity,
    })),
  });

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save the checklist. Try again." } };
  }

  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffolds/${scaffoldId}/inspections/${inspectionId}/edit`);
  return { ok: true, data: null };
}

export async function finalizeInspection(
  companyId: string,
  inspectionId: string,
  scaffoldId: string,
  projectId: string,
  input: FinalizeInspectionFormInput,
): Promise<ActionResult<null>> {
  const parsed = finalizeInspectionFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the outcome.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireScaffoldManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { error } = await supabase.rpc("finalize_scaffold_inspection", {
    target_inspection_id: inspectionId,
    target_outcome: parsed.data.outcome,
    target_restrictions_notes: parsed.data.restrictionsNotes ?? undefined,
  });

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't finalize the inspection. Try again." } };
  }

  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffolds`);
  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffolds/${scaffoldId}`);
  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffolds/${scaffoldId}/inspections/${inspectionId}`);
  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffold-inspections`);
  revalidatePath(`/companies/${companyId}/projects/${projectId}`);
  // Part AD (live/fresh data): the Inspection Dashboard and Scaffold Map
  // both read getScaffoldInspectionOverview() for this same project —
  // revalidating them here means a finalized inspection's new validity/
  // due-date/priority-list/marker-color state shows up on next navigation
  // or AutoRefresh tick, without a full reload.
  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffold-inspection-dashboard`);
  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffold-map`);
  return { ok: true, data: null };
}

/**
 * Voids a mistaken/abandoned DRAFT inspection — the soft-delete path for
 * this table (no DELETE grant exists; see void_scaffold_inspection() and
 * validate_scaffold_inspection_update()'s void branch in the migration
 * for where the real rules live: draft-only, one-way, a reason required,
 * and immutable afterward). The record stays in the scaffold's inspection
 * history, clearly marked — never removed, matching how a superseded
 * inspection is already handled.
 */
export async function voidInspection(
  companyId: string,
  inspectionId: string,
  scaffoldId: string,
  projectId: string,
  input: VoidInspectionFormInput,
): Promise<ActionResult<null>> {
  const parsed = voidInspectionFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A reason is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireScaffoldManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { error } = await supabase.rpc("void_scaffold_inspection", {
    target_inspection_id: inspectionId,
    target_void_reason: parsed.data.voidReason,
  });

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't void the inspection. Try again." } };
  }

  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffolds`);
  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffolds/${scaffoldId}`);
  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffolds/${scaffoldId}/inspections/${inspectionId}`);
  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffolds/${scaffoldId}/inspections/${inspectionId}/edit`);
  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffold-inspections`);
  return { ok: true, data: null };
}
