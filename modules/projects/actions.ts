"use server";

import { revalidatePath } from "next/cache";
import { redirect, forbidden } from "next/navigation";
import { requireOrganizationMembership, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isUniqueViolation, isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import { PROJECT_CREATE_ROLES, canManageProject } from "./permissions";
import { assignProjectRoleSchema, projectFormSchema, type AssignProjectRoleInput, type ProjectFormInput } from "./validation";
import { getProject, getMyProjectAssignmentRoles } from "./queries";

/**
 * Server Functions for the projects domain — same fixed recipe as
 * modules/employees/actions.ts (docs/API_CONVENTIONS.md §3). Project-level
 * write access can't be decided from role names alone (an assigned Project
 * Manager may manage their own project without any org-wide role), so
 * every mutation here re-derives "org-wide manager OR this project's PM"
 * live — mirroring is_project_manager() (the migration's RLS backstop)
 * rather than trusting a client-supplied flag.
 */

/** Exported for reuse by modules/teams/actions.ts — team management shares the exact same "org-wide manager OR this project's assigned Project Manager" gate as project management (see modules/teams/permissions.ts's canManageTeams). */
export async function requireProjectManageAccess(
  organizationId: string,
  projectId: string,
): Promise<{ userId: string }> {
  const { user } = await requireOrganizationMembership(organizationId);
  const [roleNames, myProjectRoles] = await Promise.all([
    getUserRoleNames(organizationId),
    getMyProjectAssignmentRoles(organizationId, projectId, user.id),
  ]);

  if (!canManageProject(roleNames, myProjectRoles)) {
    forbidden();
  }

  return { userId: user.id };
}

export async function createProject(
  organizationId: string,
  input: ProjectFormInput,
): Promise<ActionResult<{ projectId: string }>> {
  const { user } = await requireOrganizationMembership(organizationId);
  const roleNames = await getUserRoleNames(organizationId);
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
      organization_id: organizationId,
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
      return { ok: false, error: { code: "conflict", message: "A project with that code already exists in this organization." } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't create the project. Try again." } };
  }

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_user_id: user.id,
    action: "create",
    entity_type: "project",
    entity_id: data.id,
    changes: { name: parsed.data.name, code: parsed.data.code ?? null },
  });

  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

export async function updateProject(organizationId: string, projectId: string, input: ProjectFormInput): Promise<ActionResult<null>> {
  const { userId } = await requireProjectManageAccess(organizationId, projectId);

  const parsed = projectFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) },
    };
  }

  const existing = await getProject(organizationId, projectId);
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
  const { error } = await supabase.from("projects").update(updatePayload).eq("organization_id", organizationId).eq("id", projectId);

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: { code: "conflict", message: "A project with that code already exists in this organization." } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save changes. Try again." } };
  }

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
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
 * Adds (or re-opens) a project-level assignment — the roster (`member`) or
 * a manager-tier role. `validate_project_assignment_insert()` (the
 * migration) rejects: a manager-tier role for an employee who doesn't
 * already hold the matching organization role; any role for an employee
 * who isn't currently employed or is archived; or any role at all if the
 * project itself is archived — each surfaced here as a validation error
 * rather than a raw database exception.
 */
export async function assignProjectRole(
  organizationId: string,
  projectId: string,
  input: AssignProjectRoleInput,
): Promise<ActionResult<null>> {
  const { userId } = await requireProjectManageAccess(organizationId, projectId);

  const parsed = assignProjectRoleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("project_assignments").insert({
    organization_id: organizationId,
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
    organization_id: organizationId,
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
 * Closes an open project_assignments row — removing an employee from the
 * roster or a manager role. If this was the employee's LAST open
 * project_assignments row for this project, `close_orphaned_team_assignment()`
 * (an AFTER UPDATE trigger on project_assignments — see the migration)
 * automatically closes their open team_assignments row for this project
 * too, so they can never remain "actively on a team" with zero project
 * roster standing.
 */
export async function endProjectAssignment(organizationId: string, projectId: string, assignmentId: string): Promise<ActionResult<null>> {
  const { userId } = await requireProjectManageAccess(organizationId, projectId);

  const supabase = await createClient();
  const endedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("project_assignments")
    .update({ end_at: endedAt, ended_by: userId, ended_at: endedAt })
    .eq("organization_id", organizationId)
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
    organization_id: organizationId,
    actor_user_id: userId,
    action: "update",
    entity_type: "project",
    entity_id: projectId,
    changes: { assignment_role_removed: data[0].assignment_role, employee_id: data[0].employee_id },
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, data: null };
}
