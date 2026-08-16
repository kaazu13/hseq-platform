"use server";

import { requireCompanyMembership, requireProjectAccess, getUserRoleNames } from "@/lib/auth/session";
import { listEligibleErectionTeams, isCallerEligibleScaffoldForeman } from "./queries";
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
