import { NextResponse } from "next/server";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getProject } from "@/modules/projects/queries";
import { isCallerProjectAccessible } from "@/modules/daily-workforce/queries";
import { canManageDailyWorkforce, canViewDailyWorkforceBroadly } from "@/modules/daily-workforce/permissions";
import { getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { buildDailyTeamsWorkbook } from "@/modules/daily-workforce/export";

type RouteContext = { params: Promise<{ companyId: string; projectId: string }> };

/**
 * Today's Teams Excel export (Phase H) — `?date=YYYY-MM-DD`, defaults to
 * today. Same auth checks as the page itself (requireCompanyMembership/
 * requireProjectAccess/getProject-null-check); readable by anyone who can
 * view Today's Teams broadly (manage-tier or PM/HSE/Inspector/Foreman with
 * project access), not just managers — matches the page's own view gate.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const { companyId, projectId } = await params;
  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [roleNames, myProjectRoles, hasProjectAccess] = await Promise.all([
    getUserRoleNames(companyId),
    getMyProjectAssignmentRoles(companyId, projectId, user.id),
    isCallerProjectAccessible(projectId),
  ]);
  if (!canManageDailyWorkforce(roleNames, myProjectRoles) && !canViewDailyWorkforceBroadly(roleNames, hasProjectAccess)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const workDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();

  const buffer = await buildDailyTeamsWorkbook(companyId, projectId, company?.name ?? "Company", project.name, workDate);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="todays-teams-${project.name.replace(/[^a-z0-9]+/gi, "-")}-${workDate}.xlsx"`,
    },
  });
}
