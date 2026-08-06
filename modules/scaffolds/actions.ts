"use server";

import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import { requireCompanyMembership, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRlsViolation, isRaisedException, isUniqueViolation } from "@/lib/supabase/errors";
import { canManageScaffold } from "./permissions";
import { isCallerProjectAccessible } from "./queries";
import {
  scaffoldFormSchema,
  inspectionFormSchema,
  inspectionItemsFormSchema,
  finalizeInspectionFormSchema,
  correctionReasonFormSchema,
  type ScaffoldFormInput,
  type InspectionFormInput,
  type InspectionItemsFormInput,
  type FinalizeInspectionFormInput,
  type CorrectionReasonFormInput,
} from "./validation";

/**
 * Server Functions for the Scaffolds/Scaffold Inspections domain — same
 * fixed recipe as every other module (docs/API_CONVENTIONS.md §3). The
 * auth gate mirrors modules/observations/actions.ts's shape but with a
 * DIFFERENT eligible-role set (hse_officer/inspector, not foreman/
 * employee) — see modules/scaffolds/permissions.ts's header comment for
 * why Foreman is view-only here, unlike every other HSEQ module so far.
 */

async function requireScaffoldManageAccess(companyId: string, projectId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, hasProjectAccess] = await Promise.all([getUserRoleNames(companyId), isCallerProjectAccessible(projectId)]);

  if (!canManageScaffold(roleNames, hasProjectAccess)) {
    forbidden();
  }

  return { user, roleNames };
}

export async function createScaffold(companyId: string, input: ScaffoldFormInput): Promise<ActionResult<{ scaffoldId: string }>> {
  const parsed = scaffoldFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireScaffoldManageAccess(companyId, parsed.data.projectId);
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
      erected_at: parsed.data.erectedAt ?? null,
      notes: parsed.data.notes ?? null,
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

  // Bulk-insert the whole team in ONE call — a single multi-row INSERT is
  // one statement/transaction, so an ineligible/forged/duplicate employee
  // id anywhere in the batch rolls back the ENTIRE team (never a partial
  // roster) rather than failing row-by-row. The scaffold record itself is
  // already committed at this point (a separate, earlier statement) — if
  // the team insert fails, the scaffold still exists with zero team
  // members, and the caller is sent to its edit page to add the team
  // rather than losing everything just entered.
  if (parsed.data.teamMemberIds.length > 0) {
    const teamRows = parsed.data.teamMemberIds.map((employeeId, index) => ({
      company_id: companyId,
      // project_id is re-derived and validated by
      // validate_scaffold_team_member_insert() regardless of what's sent
      // here (never client-trusted) — passed explicitly only because the
      // generated Insert type requires it (no DB-level default).
      project_id: parsed.data.projectId,
      scaffold_id: data.id,
      employee_id: employeeId,
      team_position: index + 1,
      added_by: user.id,
    }));
    const { error: teamError } = await supabase.from("scaffold_team_members").insert(teamRows);
    if (teamError) {
      revalidatePath("/scaffolds");
      redirect(`/scaffolds/${data.id}/edit?teamError=1`);
    }
  }

  revalidatePath("/scaffolds");
  redirect(`/scaffolds/${data.id}`);
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
        erected_at: parsed.data.erectedAt ?? null,
        notes: parsed.data.notes ?? null,
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

  const teamResult = await reconcileScaffoldTeam(supabase, companyId, projectId, scaffoldId, user.id, parsed.data.teamMemberIds);
  if (!teamResult.ok) {
    return teamResult;
  }

  revalidatePath(`/scaffolds/${scaffoldId}`);
  revalidatePath(`/scaffolds/${scaffoldId}/edit`);
  return { ok: true, data: null };
}

/**
 * Reconciles a scaffold's active team-member roster to exactly
 * `nextEmployeeIds` — members no longer selected are non-destructively
 * removed (removed_at/removed_by, never deleted — full history stays in
 * `scaffold_team_members`), members newly selected are added at the next
 * available `team_position`, and members present in both sets are left
 * completely untouched (their original `added_at`/`added_by`/`team_position`
 * never rewritten just because the form was resubmitted). "Team member N"
 * numbering shown to users is always computed at display time from array
 * order, never assumed to equal the stored `team_position` — see
 * modules/scaffolds/types.ts's ScaffoldTeamMemberDetail comment.
 */
async function reconcileScaffoldTeam(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  projectId: string,
  scaffoldId: string,
  actingUserId: string,
  nextEmployeeIds: string[],
): Promise<ActionResult<null>> {
  const { data: currentActive, error: currentError } = await supabase.from("scaffold_team_members").select("id, employee_id, team_position").eq("scaffold_id", scaffoldId).is("removed_at", null);
  if (currentError) throw currentError;

  const nextSet = new Set(nextEmployeeIds);
  const currentByEmployeeId = new Map((currentActive ?? []).map((row) => [row.employee_id, row]));

  const toRemove = (currentActive ?? []).filter((row) => !nextSet.has(row.employee_id));
  const toAdd = nextEmployeeIds.filter((employeeId) => !currentByEmployeeId.has(employeeId));

  if (toRemove.length > 0) {
    const { error: removeError } = await supabase
      .from("scaffold_team_members")
      .update({ removed_at: new Date().toISOString(), removed_by: actingUserId })
      .in(
        "id",
        toRemove.map((row) => row.id),
      );
    if (removeError) {
      return { ok: false, error: { code: "server_error", message: "Couldn't update the scaffold team. Try again." } };
    }
  }

  if (toAdd.length > 0) {
    const highestExistingPosition = (currentActive ?? []).reduce((max, row) => Math.max(max, row.team_position), 0);
    let nextPosition = highestExistingPosition + 1;
    const teamRows = toAdd.map((employeeId) => ({
      company_id: companyId,
      project_id: projectId,
      scaffold_id: scaffoldId,
      employee_id: employeeId,
      team_position: nextPosition++,
      added_by: actingUserId,
    }));
    const { error: addError } = await supabase.from("scaffold_team_members").insert(teamRows);
    if (addError) {
      if (isRaisedException(addError)) {
        return { ok: false, error: { code: "validation_error", message: addError.message } };
      }
      return { ok: false, error: { code: "server_error", message: "Couldn't add the new scaffold team members. Try again." } };
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

  revalidatePath(`/scaffolds/${scaffoldId}`);
  redirect(`/scaffolds/${scaffoldId}/inspections/${data.id}/edit`);
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

  revalidatePath(`/scaffolds/${scaffoldId}`);
  redirect(`/scaffolds/${scaffoldId}/inspections/${data.id}/edit`);
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

  revalidatePath(`/scaffolds/${scaffoldId}/inspections/${inspectionId}/edit`);
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

  revalidatePath("/scaffolds");
  revalidatePath(`/scaffolds/${scaffoldId}`);
  revalidatePath(`/scaffolds/${scaffoldId}/inspections/${inspectionId}`);
  return { ok: true, data: null };
}
