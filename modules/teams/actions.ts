"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { requireProjectManageAccess } from "@/modules/projects/actions";
import { setTeamAssignmentSchema, teamFormSchema, type SetTeamAssignmentInput, type TeamFormInput } from "./validation";

/**
 * Server Functions for the teams domain — same fixed recipe as
 * modules/employees/actions.ts and modules/projects/actions.ts
 * (docs/API_CONVENTIONS.md §3). Every mutation reuses
 * `requireProjectManageAccess()` from modules/projects/actions.ts — team
 * management is gated identically to project management (see
 * modules/teams/permissions.ts).
 */

function flattenFieldErrors(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }) {
  const fieldErrors: Record<string, string> = {};
  for (const [field, messages] of Object.entries(error.flatten().fieldErrors)) {
    if (messages?.[0]) fieldErrors[field] = messages[0];
  }
  return fieldErrors;
}

function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}

function isRlsViolation(error: { code?: string }): boolean {
  return error.code === "42501";
}

/** Postgres error code for an unhandled `RAISE EXCEPTION` with no explicit SQLSTATE — e.g. the archived-project/archived-team/ineligible-employee/overlap guards inside save_team_with_assignments()'s underlying inserts. */
function isRaisedException(error: { code?: string }): boolean {
  return error.code === "P0001";
}

export type TeamAssignmentChange = { employeeId: string; role: "member" | "foreman" | "none" };

/**
 * Create-or-update a team AND apply every assignment change from the Team
 * dialog in one call — `save_team_with_assignments()`
 * (supabase/migrations/20260728090000_projects_and_teams.sql §12) wraps
 * both in a single transaction, so a partial result (team saved but an
 * assignment change rejected, or vice versa) is impossible. `teamId: null`
 * creates a new team; otherwise updates the existing one.
 *
 * A unique-violation here (23505) means a concurrent request already
 * claimed the same (project, employee) open-assignment slot — surfaced as
 * a conflict rather than a generic failure, since retrying (with fresh
 * data) is the correct next step, not a bug report.
 */
export async function saveTeamWithAssignments(
  organizationId: string,
  projectId: string,
  teamId: string | null,
  input: TeamFormInput,
  assignmentChanges: TeamAssignmentChange[],
): Promise<ActionResult<{ teamId: string }>> {
  const { userId } = await requireProjectManageAccess(organizationId, projectId);

  const parsed = teamFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) },
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_team_with_assignments", {
    target_team_id: teamId,
    target_project_id: projectId,
    target_name: parsed.data.name,
    target_code: parsed.data.code ?? null,
    target_color: parsed.data.color,
    target_description: parsed.data.description ?? null,
    target_status: parsed.data.status,
    target_assignments: assignmentChanges.map((change) => ({ employee_id: change.employeeId, role: change.role })),
  });

  if (error || !data) {
    if (error && isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    if (error && isUniqueViolation(error)) {
      return {
        ok: false,
        error: { code: "conflict", message: "Someone else just changed one of these assignments — refresh and try again." },
      };
    }
    if (error && isRlsViolation(error)) {
      forbidden();
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save the team. Try again." } };
  }

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_user_id: userId,
    action: teamId ? "update" : "create",
    entity_type: "team",
    entity_id: data.id,
    changes: { name: parsed.data.name, status: parsed.data.status, assignment_changes: assignmentChanges.length },
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, data: { teamId: data.id } };
}

/**
 * Manual reordering (requirement: "Do NOT sort alphabetically. Use
 * display_order" / "Project Managers should be able to manually reorder
 * Teams"). Takes the full, already-reordered list of this project's team
 * ids; `reorder_teams()` (the migration) writes every new display_order in
 * one transaction — called by the Team Card grid's move-up/move-down
 * controls this milestone; a future drag-and-drop UI can call this exact
 * same function with a drag-reordered array and needs no other change.
 */
export async function reorderTeams(organizationId: string, projectId: string, orderedTeamIds: string[]): Promise<ActionResult<null>> {
  await requireProjectManageAccess(organizationId, projectId);

  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_teams", {
    target_project_id: projectId,
    target_team_ids: orderedTeamIds,
  });

  if (error) {
    if (isRlsViolation(error)) {
      forbidden();
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save the new team order. Try again." } };
  }

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, data: null };
}

/**
 * Assigns (or moves) a single employee onto a team outside the Team
 * dialog's bulk-save flow — via `move_employee_to_team()`
 * (supabase/migrations/20260728090000_projects_and_teams.sql §9), which
 * atomically closes the employee's current open assignment anywhere in
 * this project and opens the new one, in a single transaction.
 */
export async function setTeamAssignment(
  organizationId: string,
  projectId: string,
  teamId: string,
  input: SetTeamAssignmentInput,
): Promise<ActionResult<null>> {
  const { userId } = await requireProjectManageAccess(organizationId, projectId);

  const parsed = setTeamAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("move_employee_to_team", {
    target_project_id: projectId,
    target_team_id: teamId,
    target_employee_id: parsed.data.employeeId,
    target_role: parsed.data.role,
  });

  if (error) {
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: { code: "conflict", message: "Someone else just changed this employee's assignment — refresh and try again." },
      };
    }
    if (isRlsViolation(error)) {
      forbidden();
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't assign that employee. Try again." } };
  }

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_user_id: userId,
    action: "update",
    entity_type: "team",
    entity_id: teamId,
    changes: { employee_id: parsed.data.employeeId, assignment_role: parsed.data.role },
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, data: null };
}

/** Removes an employee from a team entirely (no replacement) via `end_team_assignment()`. */
export async function removeTeamAssignment(organizationId: string, projectId: string, teamId: string, employeeId: string): Promise<ActionResult<null>> {
  const { userId } = await requireProjectManageAccess(organizationId, projectId);

  const supabase = await createClient();
  const { error } = await supabase.rpc("end_team_assignment", {
    target_project_id: projectId,
    target_employee_id: employeeId,
  });

  if (error) {
    if (isRlsViolation(error)) {
      forbidden();
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't remove that employee. Try again." } };
  }

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_user_id: userId,
    action: "update",
    entity_type: "team",
    entity_id: teamId,
    changes: { employee_id_removed: employeeId },
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, data: null };
}
