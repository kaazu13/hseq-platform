import { NextResponse } from "next/server";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames } from "@/lib/auth/session";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { canManageDailyWorkforce } from "@/modules/daily-workforce/permissions";
import { listLeaveRequestsForProject, resolveDeciderNames } from "@/modules/leave-requests/queries";
import { buildLeaveRequestsWorkbook } from "@/modules/leave-requests/export";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ companyId: string; projectId: string }> };

/** Holiday/Leave Excel export (Phase 10) — `?from=YYYY-MM-DD&to=YYYY-MM-DD`. Manage-tier only. */
export async function GET(request: Request, { params }: RouteContext) {
  const { companyId, projectId } = await params;
  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project || project.company_id !== companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [roleNames, myProjectRoles] = await Promise.all([getUserRoleNames(companyId), getMyProjectAssignmentRoles(companyId, projectId, user.id)]);
  if (!canManageDailyWorkforce(roleNames, myProjectRoles)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Date().toISOString().slice(0, 10);
  const fromDate = fromParam && DATE_RE.test(fromParam) ? fromParam : today;
  const toDate = toParam && DATE_RE.test(toParam) && toParam >= fromDate ? toParam : fromDate;

  const supabase = await createClient();
  const [{ data: company }, { data: exporterProfile }] = await Promise.all([
    supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  const companyName = company?.name ?? "Company";

  const rows = await listLeaveRequestsForProject(companyId, projectId, { fromDate, toDate });
  const deciderIds = rows.map((row) => row.decided_by).filter((id): id is string => Boolean(id));
  const deciderNameById = await resolveDeciderNames(companyId, deciderIds);

  const buffer = await buildLeaveRequestsWorkbook(companyName, project.name, `${fromDate} – ${toDate}`, rows, deciderNameById, exporterProfile?.full_name ?? undefined);
  const filename = `${project.name.replace(/[\\/:*?"<>|]/g, "-")} - Leave - ${fromDate}_${toDate}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
