import { createClient } from "@/lib/supabase/server";
import type { OnboardingChecklist } from "./types";

/**
 * All counts derived from existing tables in one batched pass — see
 * types.ts's header comment for why this is never a separate stored
 * "progress" row. Deliberately plain, separate queries joined in
 * application code rather than a PostgREST embed (`table!inner(...)`) —
 * matches this codebase's established convention (modules/companies/queries.ts's
 * listActiveCompaniesForUser, modules/account/queries.ts's
 * listCompanyMembersOverview) of never relying on embedded-relationship
 * typing since types/database.ts is hand-written and doesn't model FKs.
 */
export async function getOnboardingChecklist(companyId: string): Promise<OnboardingChecklist> {
  const supabase = await createClient();

  const [company, activeMemberships, companyAdminRole, projectCount, employeeCount, projectAssignmentCount, acceptedInvitations, pendingInvitations] = await Promise.all([
    supabase.from("companies").select("name, logo_storage_path").eq("id", companyId).maybeSingle(),
    supabase.from("company_memberships").select("id").eq("company_id", companyId).eq("status", "active"),
    supabase.from("roles").select("id").eq("name", "company_admin").maybeSingle(),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("company_id", companyId).is("archived_at", null),
    supabase.from("project_assignments").select("id", { count: "exact", head: true }).eq("company_id", companyId).is("end_at", null),
    supabase.from("company_invitations").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "accepted"),
    supabase.from("company_invitations").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending"),
  ]);

  const activeMembershipIds = (activeMemberships.data ?? []).map((m) => m.id);
  let hasAdministrator = false;
  if (activeMembershipIds.length > 0 && companyAdminRole.data) {
    const { count } = await supabase
      .from("membership_roles")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("role_id", companyAdminRole.data.id)
      .in("membership_id", activeMembershipIds);
    hasAdministrator = (count ?? 0) > 0;
  }

  return {
    companyName: company.data?.name ?? "",
    hasAdministrator,
    hasLogo: Boolean(company.data?.logo_storage_path),
    projectCount: projectCount.count ?? 0,
    employeeCount: employeeCount.count ?? 0,
    projectAssignmentCount: projectAssignmentCount.count ?? 0,
    acceptedInvitationCount: acceptedInvitations.count ?? 0,
    pendingInvitationCount: pendingInvitations.count ?? 0,
  };
}
