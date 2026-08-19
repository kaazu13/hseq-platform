"use server";

import { requireCompanyMembership, requireProjectAccess, getUserRoleNames } from "@/lib/auth/session";
import { listEligibleErectionTeams, listAvailableScaffoldWorkers, isCallerEligibleScaffoldForeman } from "./queries";
import { isScaffoldBroadCreator } from "./permissions";

/**
 * Client-callable wrapper around listEligibleErectionTeams() — the
 * Scaffold Form (Part 4C) refetches this every time the erection date
 * changes, from a Client Component, so it needs a genuine Server Action
 * rather than a server-only query import. Re-derives the same
 * "Foreman-only creators see only their own teams" restriction the
 * server-side trigger enforces on the actual INSERT — this is the
 * matching UI narrowing, never the real gate.
 */
export async function listEligibleErectionTeamsAction(companyId: string, projectId: string, workDate: string) {
  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);
  const roleNames = await getUserRoleNames(companyId);
  const hasProjectAccess = true; // requireProjectAccess() already asserted this for projectId

  if (isScaffoldBroadCreator(roleNames, hasProjectAccess)) {
    return listEligibleErectionTeams(companyId, projectId, workDate);
  }

  const isEligibleForeman = await isCallerEligibleScaffoldForeman(companyId, projectId);
  if (!isEligibleForeman) return [];

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: employee } = await supabase.from("employees").select("id").eq("company_id", companyId).eq("profile_id", user.id).maybeSingle();
  if (!employee) return [];

  return listEligibleErectionTeams(companyId, projectId, workDate, employee.id);
}

/**
 * Part 12 — client-callable wrapper for the "Add worker" manual
 * erection-participant picker, refetched whenever the erection date
 * changes (same pattern as listEligibleErectionTeamsAction above). Any
 * caller who can reach the scaffold form (company membership + project
 * access, already asserted for the page itself) may see this list — it's
 * a read of the existing project roster/attendance, not a privileged
 * action.
 */
export async function listAvailableScaffoldWorkersAction(companyId: string, projectId: string, workDate: string) {
  await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);
  return listAvailableScaffoldWorkers(companyId, projectId, workDate);
}
