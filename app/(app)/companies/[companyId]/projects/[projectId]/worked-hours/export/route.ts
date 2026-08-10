import { NextResponse } from "next/server";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { listWorkedHoursForDate, listMonthlyWorkedHours } from "@/modules/worked-hours/queries";
import { canManageWorkedHours } from "@/modules/worked-hours/permissions";
import { buildDailyWorkedHoursWorkbook, buildMonthlyWorkedHoursWorkbook } from "@/modules/daily-workforce/export";

type RouteContext = { params: Promise<{ companyId: string; projectId: string }> };

/**
 * Worked Hours Excel export (Phase H) — `?date=YYYY-MM-DD` for a single
 * day, or `?from=YYYY-MM-DD&to=YYYY-MM-DD` for a range/month. Manage-tier
 * only (company-wide managers or the project's own PM) — matches the page's
 * own view gate; worked hours are never broadly visible the way Today's
 * Teams is.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const { companyId, projectId } = await params;
  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);

  const project = await getProject(companyId, projectId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [roleNames, myProjectRoles] = await Promise.all([getUserRoleNames(companyId), getMyProjectAssignmentRoles(companyId, projectId, user.id)]);
  if (!canManageWorkedHours(roleNames, myProjectRoles)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
  const companyName = company?.name ?? "Company";

  if (fromParam && toParam) {
    const rows = await listMonthlyWorkedHours(companyId, projectId, fromParam, toParam);
    const buffer = await buildMonthlyWorkedHoursWorkbook(companyName, project.name, fromParam, toParam, rows);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="worked-hours-${project.name.replace(/[^a-z0-9]+/gi, "-")}-${fromParam}-to-${toParam}.xlsx"`,
      },
    });
  }

  const workDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);
  const rows = await listWorkedHoursForDate(companyId, projectId, workDate);
  const buffer = await buildDailyWorkedHoursWorkbook(companyName, project.name, workDate, rows);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="worked-hours-${project.name.replace(/[^a-z0-9]+/gi, "-")}-${workDate}.xlsx"`,
    },
  });
}
