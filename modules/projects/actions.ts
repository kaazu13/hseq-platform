"use server";

import { revalidatePath } from "next/cache";
import { redirect, forbidden } from "next/navigation";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames, isPlatformSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isUniqueViolation, isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import { PROJECT_CREATE_ROLES, canManageProject, canEditProjectLocationSettings, canEditProjectSiteLocation } from "./permissions";
import {
  assignProjectRoleSchema,
  projectFormSchema,
  projectLocationSettingsSchema,
  projectSiteLocationSchema,
  type AssignProjectRoleInput,
  type ProjectFormInput,
  type ProjectLocationSettingsInput,
  type ProjectSiteLocationInput,
} from "./validation";
import { getProject, getMyProjectAssignmentRoles } from "./queries";

/**
 * Server Functions for the projects domain — same fixed recipe as
 * modules/employees/actions.ts (docs/API_CONVENTIONS.md §3). Project-level
 * write access can't be decided from role names alone (an assigned Project
 * Manager may manage their own project without any company-wide role), so
 * every mutation here re-derives "company-wide manager OR this project's PM"
 * live — mirroring is_project_manager() (the migration's RLS backstop)
 * rather than trusting a client-supplied flag.
 */

/** Exported for reuse by modules/teams/actions.ts — team management shares the exact same "company-wide manager OR this project's assigned Project Manager" gate as project management (see modules/teams/permissions.ts's canManageTeams). */
export async function requireProjectManageAccess(
  companyId: string,
  projectId: string,
): Promise<{ userId: string }> {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, myProjectRoles] = await Promise.all([
    getUserRoleNames(companyId),
    getMyProjectAssignmentRoles(companyId, projectId, user.id),
  ]);

  if (!canManageProject(roleNames, myProjectRoles)) {
    forbidden();
  }

  return { userId: user.id };
}

export async function createProject(
  companyId: string,
  input: ProjectFormInput,
): Promise<ActionResult<{ projectId: string }>> {
  const { user } = await requireCompanyMembership(companyId);
  const roleNames = await getUserRoleNames(companyId);
  if (!roleNames.some((role) => PROJECT_CREATE_ROLES.includes(role))) {
    forbidden();
  }

  const parsed = projectFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      company_id: companyId,
      name: parsed.data.name,
      client_name: parsed.data.clientName ?? null,
      code: parsed.data.code ?? null,
      description: parsed.data.description ?? null,
      status: parsed.data.status,
      start_date: parsed.data.startDate ?? null,
      end_date: parsed.data.endDate ?? null,
      location: parsed.data.location ?? null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error && isUniqueViolation(error)) {
      return { ok: false, error: { code: "conflict", message: "A project with that code already exists in this company." } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't create the project. Try again." } };
  }

  await supabase.from("audit_events").insert({
    company_id: companyId,
    actor_user_id: user.id,
    action: "create",
    entity_type: "project",
    entity_id: data.id,
    changes: { name: parsed.data.name, code: parsed.data.code ?? null },
  });

  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

export async function updateProject(companyId: string, projectId: string, input: ProjectFormInput): Promise<ActionResult<null>> {
  const { userId } = await requireProjectManageAccess(companyId, projectId);

  const parsed = projectFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) },
    };
  }

  const existing = await getProject(companyId, projectId);
  if (!existing) {
    return { ok: false, error: { code: "not_found", message: "Project not found." } };
  }

  const updatePayload = {
    name: parsed.data.name,
    client_name: parsed.data.clientName ?? null,
    code: parsed.data.code ?? null,
    description: parsed.data.description ?? null,
    status: parsed.data.status,
    start_date: parsed.data.startDate ?? null,
    end_date: parsed.data.endDate ?? null,
    location: parsed.data.location ?? null,
    updated_by: userId,
  };

  const supabase = await createClient();
  const { error } = await supabase.from("projects").update(updatePayload).eq("company_id", companyId).eq("id", projectId);

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: { code: "conflict", message: "A project with that code already exists in this company." } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save changes. Try again." } };
  }

  await supabase.from("audit_events").insert({
    company_id: companyId,
    actor_user_id: userId,
    action: "update",
    entity_type: "project",
    entity_id: projectId,
    changes: { name: parsed.data.name, status: parsed.data.status },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

/**
 * Task 3 Part 12 — country_code/timezone, platform_super_admin +
 * company_admin only. Deliberately separate from updateProject:
 * canManageProject's broader "company-wide manager OR this project's PM"
 * gate would otherwise let operations_manager change these too.
 *
 * Writes through update_project_location_settings() (SECURITY DEFINER) —
 * NOT a raw table UPDATE — for every actor, including company_admin. Two
 * reasons: (1) platform_super_admin, by design, usually has NO
 * company_memberships row in an arbitrary company at all, so
 * requireCompanyMembership would 403 them before this ever ran (the exact
 * gap 20260901090000_platform_admin_console.sql documented for projects_select/
 * employees_select/etc.); (2) live attack-testing found the RLS-driven path
 * unreliable for a sibling case (see updateProjectSiteLocation below) — one
 * consistent RPC-based mechanism for every actor is simpler and provably
 * correct rather than two different paths for "has company membership" vs
 * not. validate_project_location_settings_update() (the BEFORE UPDATE
 * trigger) still fires and still re-validates the actor + the data,
 * independent of this function's own check.
 */
export async function updateProjectLocationSettings(companyId: string, projectId: string, input: ProjectLocationSettingsInput): Promise<ActionResult<null>> {
  const parsed = projectLocationSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  if (!(await isPlatformSuperAdmin())) {
    await requireCompanyMembership(companyId);
    const roleNames = await getUserRoleNames(companyId);
    if (!canEditProjectLocationSettings(roleNames)) {
      forbidden();
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_project_location_settings", {
    target_project_id: projectId,
    target_country_code: parsed.data.countryCode,
    target_timezone: parsed.data.timezone,
  });

  if (error) {
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't save changes. Try again." } };
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/edit`);
  return { ok: true, data: null };
}

/**
 * Task 3 Part 13 — site_address/lat/long, platform_super_admin +
 * company_admin + planner. Writes through update_project_site_location()
 * (SECURITY DEFINER) for every actor — same reasoning as
 * updateProjectLocationSettings above. planner specifically NEEDS this
 * RPC-based path: live attack-testing found that widening projects_update's
 * RLS to admit planner directly was unreliable in practice (an UPDATE
 * whose exact same authorization boolean expression evaluated to true when
 * checked directly still silently affected 0 rows for planner specifically
 * — root cause not fully isolated; see
 * 20260901116000_project_location_settings_rpc_unification.sql's header
 * comment for the full investigation). The RPC sidesteps RLS entirely and
 * is verified working for planner/company_admin/platform_super_admin
 * alike.
 */
export async function updateProjectSiteLocation(companyId: string, projectId: string, input: ProjectSiteLocationInput): Promise<ActionResult<null>> {
  const parsed = projectSiteLocationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  if (!(await isPlatformSuperAdmin())) {
    await requireCompanyMembership(companyId);
    const roleNames = await getUserRoleNames(companyId);
    if (!canEditProjectSiteLocation(roleNames)) {
      forbidden();
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_project_site_location", {
    target_project_id: projectId,
    target_site_address: parsed.data.siteAddress,
    target_site_latitude: parsed.data.siteLatitude,
    target_site_longitude: parsed.data.siteLongitude,
  });

  if (error) {
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't save changes. Try again." } };
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/edit`);
  return { ok: true, data: null };
}

/**
 * Adds (or re-opens) a project-level assignment — the roster (`member`) or
 * a manager-tier role. `validate_project_assignment_insert()` (the
 * migration) rejects: a manager-tier role for an employee who doesn't
 * already hold the matching company role; any role for an employee
 * who isn't currently employed or is archived; or any role at all if the
 * project itself is archived — each surfaced here as a validation error
 * rather than a raw database exception.
 */
export async function assignProjectRole(
  companyId: string,
  projectId: string,
  input: AssignProjectRoleInput,
): Promise<ActionResult<null>> {
  const { userId } = await requireProjectManageAccess(companyId, projectId);

  const parsed = assignProjectRoleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("project_assignments").insert({
    company_id: companyId,
    project_id: projectId,
    employee_id: parsed.data.employeeId,
    assignment_role: parsed.data.assignmentRole,
    assigned_by: userId,
    notes: parsed.data.notes ?? null,
  });

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: true, data: null };
    }
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    if (isRlsViolation(error)) {
      forbidden();
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't assign that role. Try again." } };
  }

  await supabase.from("audit_events").insert({
    company_id: companyId,
    actor_user_id: userId,
    action: "update",
    entity_type: "project",
    entity_id: projectId,
    changes: { assignment_role_added: parsed.data.assignmentRole, employee_id: parsed.data.employeeId },
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, data: null };
}

/**
 * Server Function backing the project switcher — the project-level
 * mirror of `setActiveCompany()` (modules/companies/actions.ts). Two live
 * checks before ever touching `profiles`, both required: `requireProjectAccess()`
 * (the caller must actually be able to reach this project — the same
 * `has_project_access()` RPC every project-scoped RLS policy uses) AND an
 * explicit re-fetch of the project's own `company_id`, cross-checked
 * against `companyId`, rejecting a project that exists and is accessible
 * but belongs to a DIFFERENT company than the one currently active — the
 * exact "never retain/select a project from another company" requirement.
 * `profiles.active_project_id` remains a UX preference only; see that
 * column's own migration comment.
 */
export async function setActiveProject(companyId: string, projectId: string): Promise<ActionResult<null>> {
  const { user } = await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) {
    return { ok: false, error: { code: "not_found", message: "That project isn't part of the current company." } };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ active_project_id: projectId }).eq("id", user.id);

  if (error) {
    return { ok: false, error: { code: "server_error", message: "Couldn't switch projects. Try again." } };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

/**
 * Closes an open project_assignments row — removing an employee from the
 * roster or a manager role. If this was the employee's LAST open
 * project_assignments row for this project, `close_orphaned_team_assignment()`
 * (an AFTER UPDATE trigger on project_assignments — see the migration)
 * automatically closes their open team_assignments row for this project
 * too, so they can never remain "actively on a team" with zero project
 * roster standing.
 */
export async function endProjectAssignment(companyId: string, projectId: string, assignmentId: string): Promise<ActionResult<null>> {
  const { userId } = await requireProjectManageAccess(companyId, projectId);

  const supabase = await createClient();
  const endedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("project_assignments")
    .update({ end_at: endedAt, ended_by: userId, ended_at: endedAt })
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .eq("id", assignmentId)
    .is("end_at", null)
    .select("id, assignment_role, employee_id");

  if (error) {
    return { ok: false, error: { code: "server_error", message: "Couldn't remove that assignment. Try again." } };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: { code: "not_found", message: "That assignment no longer exists or was already removed." } };
  }

  await supabase.from("audit_events").insert({
    company_id: companyId,
    actor_user_id: userId,
    action: "update",
    entity_type: "project",
    entity_id: projectId,
    changes: { assignment_role_removed: data[0].assignment_role, employee_id: data[0].employee_id },
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, data: null };
}
