import { NextResponse } from "next/server";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames } from "@/lib/auth/session";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { canManageDailyWorkforce } from "@/modules/daily-workforce/permissions";
import { listAbsencesForDateRange } from "@/modules/absences/queries";
import { buildAbsenceWorkbook } from "@/modules/absences/export";
import { resolveWorkedHoursPeriod, formatWorkedHoursPeriodLabel, buildWorkedHoursFilename, type WorkedHoursPeriodMode } from "@/modules/worked-hours/period";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ companyId: string; projectId: string }> };

/**
 * Absence Excel export (Phase 6) — `?mode=day|week|month&date=YYYY-MM-DD`,
 * reusing modules/worked-hours/period.ts's period resolution (generic date-
 * range math, not worked-hours-specific) so Day/Week(Mon-Sun)/Month behave
 * identically to the Worked Hours export. Manage-tier only, same gate as
 * Absent Today itself.
 */
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
  const modeParam = url.searchParams.get("mode");
  const mode: WorkedHoursPeriodMode = modeParam === "week" || modeParam === "month" ? modeParam : "day";
  const dateParam = url.searchParams.get("date");
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);

  const period = resolveWorkedHoursPeriod(mode, date);

  const supabase = await createClient();
  const [{ data: company }, { data: exporterProfile }] = await Promise.all([
    supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  const companyName = company?.name ?? "Company";

  const rows = await listAbsencesForDateRange(companyId, projectId, period.fromDate, period.toDate);
  const buffer = await buildAbsenceWorkbook(companyName, project.name, formatWorkedHoursPeriodLabel(period), rows, exporterProfile?.full_name ?? undefined);
  const filename = buildWorkedHoursFilename(project.name, period).replace("Worked Hours", "Absences");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
