"use server";

import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import { requireCompanyMembership, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import { canCreateObservation, canEditObservation, canReviewOrCloseObservation } from "./permissions";
import { isCallerProjectAccessible } from "./queries";
import {
  observationFormSchema,
  observationParticipantsFormSchema,
  type ObservationFormInput,
  type ObservationParticipantsFormInput,
} from "./validation";

/**
 * Server Functions for the Safety Observations domain — same fixed recipe
 * as every other module (docs/API_CONVENTIONS.md §3). The auth gate is
 * genuinely different from LMRA's: docs/ROLES_AND_PERMISSIONS.md §5's
 * Safety Observations row gives HSE Officer/Foreman/Inspector/Employee
 * "C" (create and edit their OWN entries only), not LMRA's Foreman-manages-
 * everyone-on-the-project "M" — so `requireObservationEditAccess` below
 * checks `created_by`, unlike modules/lmra/actions.ts's project-scoped-only
 * check.
 */

async function requireObservationCreateAccess(companyId: string, projectId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, hasProjectAccess] = await Promise.all([
    getUserRoleNames(companyId),
    isCallerProjectAccessible(projectId),
  ]);

  if (!canCreateObservation(roleNames, hasProjectAccess)) {
    forbidden();
  }

  return { user, roleNames };
}

async function requireObservationEditAccess(companyId: string, projectId: string, createdBy: string | null) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, hasProjectAccess] = await Promise.all([
    getUserRoleNames(companyId),
    isCallerProjectAccessible(projectId),
  ]);

  if (!canEditObservation(roleNames, hasProjectAccess, createdBy === user.id)) {
    forbidden();
  }

  return { user, roleNames };
}

async function requireObservationReviewAccess(companyId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const roleNames = await getUserRoleNames(companyId);

  if (!canReviewOrCloseObservation(roleNames)) {
    forbidden();
  }

  return { user, roleNames };
}

export async function createObservation(companyId: string, input: ObservationFormInput): Promise<ActionResult<{ observationId: string }>> {
  const parsed = observationFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireObservationCreateAccess(companyId, parsed.data.projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("safety_observations")
    .insert({
      company_id: companyId,
      project_id: parsed.data.projectId,
      work_area: parsed.data.workArea,
      observed_at: new Date(parsed.data.observedAt).toISOString(),
      observer_id: parsed.data.observerId,
      category: parsed.data.category,
      description: parsed.data.description,
      immediate_action_taken: parsed.data.immediateActionTaken ?? null,
      risk_level: parsed.data.riskLevel,
      is_stop_work: parsed.data.isStopWork,
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
    return { ok: false, error: { code: "server_error", message: "Couldn't create the observation. Try again." } };
  }

  revalidatePath("/observations");
  redirect(`/observations/${data.id}/edit`);
}

export async function updateObservation(
  companyId: string,
  observationId: string,
  projectId: string,
  createdBy: string | null,
  input: ObservationFormInput,
): Promise<ActionResult<null>> {
  const parsed = observationFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireObservationEditAccess(companyId, projectId, createdBy);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("safety_observations")
    .update(
      {
        work_area: parsed.data.workArea,
        observed_at: new Date(parsed.data.observedAt).toISOString(),
        observer_id: parsed.data.observerId,
        category: parsed.data.category,
        description: parsed.data.description,
        immediate_action_taken: parsed.data.immediateActionTaken ?? null,
        risk_level: parsed.data.riskLevel,
        is_stop_work: parsed.data.isStopWork,
        updated_by: user.id,
      },
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .eq("id", observationId);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save changes. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Observation not found, or it's no longer editable." } };
  }

  revalidatePath(`/observations/${observationId}`);
  revalidatePath(`/observations/${observationId}/edit`);
  return { ok: true, data: null };
}

export async function updateObservationParticipants(
  companyId: string,
  observationId: string,
  projectId: string,
  createdBy: string | null,
  input: ObservationParticipantsFormInput,
): Promise<ActionResult<null>> {
  const parsed = observationParticipantsFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the selected people." } };
  }

  await requireObservationEditAccess(companyId, projectId, createdBy);
  const supabase = await createClient();

  const { data: current, error: currentError } = await supabase
    .from("safety_observation_participants")
    .select("employee_id")
    .eq("observation_id", observationId);
  if (currentError) return { ok: false, error: { code: "server_error", message: "Couldn't load the current list. Try again." } };

  const currentIds = new Set((current ?? []).map((row) => row.employee_id));
  const desiredIds = new Set(parsed.data);
  const toAdd = [...desiredIds].filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !desiredIds.has(id));

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("safety_observation_participants")
      .insert(toAdd.map((employeeId) => ({ company_id: companyId, observation_id: observationId, employee_id: employeeId })));
    if (error) {
      if (isRlsViolation(error)) forbidden();
      if (isRaisedException(error)) {
        return { ok: false, error: { code: "validation_error", message: error.message } };
      }
      return { ok: false, error: { code: "server_error", message: "Couldn't update the list. Try again." } };
    }
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("safety_observation_participants")
      .delete()
      .eq("observation_id", observationId)
      .in("employee_id", toRemove);
    if (error) {
      if (isRlsViolation(error)) forbidden();
      return { ok: false, error: { code: "server_error", message: "Couldn't update the list. Try again." } };
    }
  }

  revalidatePath(`/observations/${observationId}/edit`);
  return { ok: true, data: null };
}

/** HSE-Manager-only — mirrors modules/lmra/actions.ts's archiveLmra shape: RLS admits the attempt broadly, the trigger (validate_safety_observation_update) is the real gate. */
export async function reviewObservation(companyId: string, observationId: string): Promise<ActionResult<null>> {
  const { user } = await requireObservationReviewAccess(companyId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("safety_observations")
    .update({ reviewed_by: user.id, reviewed_at: new Date().toISOString() }, { count: "exact" })
    .eq("company_id", companyId)
    .eq("id", observationId)
    .eq("status", "open");

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't mark this reviewed. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Observation not found, or it's already closed." } };
  }

  revalidatePath(`/observations/${observationId}`);
  return { ok: true, data: null };
}

/**
 * HSE-Manager-only, and blocked by validate_safety_observation_update()
 * while any linked corrective_actions row is unresolved — the raised
 * exception's message is surfaced directly (isRaisedException()), same
 * pattern as every other business-rule rejection in this codebase.
 */
export async function closeObservation(companyId: string, observationId: string): Promise<ActionResult<null>> {
  const { user } = await requireObservationReviewAccess(companyId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("safety_observations")
    .update({ status: "closed", closed_by: user.id, closed_at: new Date().toISOString() }, { count: "exact" })
    .eq("company_id", companyId)
    .eq("id", observationId)
    .eq("status", "open");

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't close this observation. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Observation not found, or it's already closed." } };
  }

  revalidatePath("/observations");
  revalidatePath(`/observations/${observationId}`);
  return { ok: true, data: null };
}
