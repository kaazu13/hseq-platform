import { NextResponse } from "next/server";
import { requireCompanyMembership, requireProjectAccess, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getProject, getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { listWorkedHoursForDate, listWorkedHoursForPeriod, listProjectWorkersForPeriod } from "@/modules/worked-hours/queries";
import { canManageWorkedHours } from "@/modules/worked-hours/permissions";
import { workedHoursExportQuerySchema } from "@/modules/worked-hours/validation";
import { buildDailyWorkedHoursWorkbook, buildWorkedHoursMatrixWorkbook } from "@/modules/daily-workforce/export";
import { resolveWorkedHoursPeriod, buildWorkedHoursFilename } from "@/modules/worked-hours/period";
import type { WorkedHoursMatrixRow } from "@/modules/worked-hours/types";

type RouteContext = { params: Promise<{ companyId: string; projectId: string }> };

/**
 * Worked Hours Excel export (Phases 5-9) — `?mode=day|week|month&date=YYYY-MM-DD`
 * resolves the reporting period (see modules/worked-hours/period.ts for the
 * Day/Week(Mon-Sun)/Month resolution rules), `?scope=all_workers|hours_only|selected`
 * picks which employees are included, and `?employeeIds=uuid,uuid,...`
 * names them explicitly for `scope=selected`. Manage-tier only (company-wide
 * managers or the project's own PM) — matches the page's own view gate;
 * worked hours are never broadly visible the way Today's Teams is.
 *
 * Every selected employee id is re-validated against this exact company/
 * project/period server-side (never trusted from the query string alone) —
 * an id outside the resolved eligible set is silently dropped, never
 * fabricated into the export, closing the cross-project/IDOR path a raw
 * `employeeIds` filter would otherwise open.
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
  if (!canManageWorkedHours(roleNames, myProjectRoles)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = workedHoursExportQuerySchema.safeParse({
    mode: url.searchParams.get("mode") ?? "day",
    date: url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10),
    scope: url.searchParams.get("scope") ?? "hours_only",
    employeeIds: url.searchParams.get("employeeIds")?.split(",").filter(Boolean),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid export parameters." }, { status: 400 });
  }
  const { mode, date, scope, employeeIds: requestedEmployeeIds } = parsed.data;

  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
  const companyName = company?.name ?? "Company";

  const period = resolveWorkedHoursPeriod(mode, date);
  const filename = buildWorkedHoursFilename(project.name, period);

  // Single-day export keeps the existing simple/readable row-per-employee
  // format (Phase 7's explicit "keep Day export simple").
  if (period.mode === "day") {
    const hoursRows = await listWorkedHoursForDate(companyId, projectId, period.fromDate);
    const hoursByEmployeeId = new Map(hoursRows.map((row) => [row.employee_id, row]));

    let dayRows: { employee: { first_name: string; last_name: string }; hours: number; note: string | null; status: string }[];
    if (scope === "selected") {
      const eligible = await listProjectWorkersForPeriod(companyId, projectId, period.fromDate, period.toDate);
      const eligibleIds = new Set(eligible.map((employee) => employee.id));
      const validatedIds = (requestedEmployeeIds ?? []).filter((id) => eligibleIds.has(id));
      dayRows = validatedIds.map((id) => {
        const existing = hoursByEmployeeId.get(id);
        const employee = existing?.employee ?? eligible.find((candidate) => candidate.id === id)!;
        return { employee, hours: existing ? Number(existing.hours) : 0, note: existing?.note ?? null, status: existing?.status ?? "draft" };
      });
    } else if (scope === "all_workers") {
      const eligible = await listProjectWorkersForPeriod(companyId, projectId, period.fromDate, period.toDate);
      dayRows = eligible.map((employee) => {
        const existing = hoursByEmployeeId.get(employee.id);
        return { employee, hours: existing ? Number(existing.hours) : 0, note: existing?.note ?? null, status: existing?.status ?? "draft" };
      });
    } else {
      dayRows = hoursRows.map((row) => ({ employee: row.employee, hours: Number(row.hours), note: row.note, status: row.status }));
    }

    const buffer = await buildDailyWorkedHoursWorkbook(companyName, project.name, period.fromDate, dayRows);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // Week/month: the payroll-checking matrix.
  let rows: WorkedHoursMatrixRow[];
  if (scope === "selected") {
    const eligible = await listProjectWorkersForPeriod(companyId, projectId, period.fromDate, period.toDate);
    const eligibleIds = new Set(eligible.map((employee) => employee.id));
    const validatedIds = (requestedEmployeeIds ?? []).filter((id) => eligibleIds.has(id));
    rows = validatedIds.length > 0 ? await listWorkedHoursForPeriod(companyId, projectId, period.fromDate, period.toDate, validatedIds) : [];
    // Include selected employees with zero hours recorded too — "selected
    // workers" should show everyone chosen, not just those with rows.
    const rowsByEmployeeId = new Map(rows.map((row) => [row.employee.id, row]));
    rows = validatedIds
      .map((id) => rowsByEmployeeId.get(id) ?? { employee: eligible.find((employee) => employee.id === id)!, hoursByDate: {}, totalHours: 0 })
      .sort((a, b) => `${a.employee.last_name} ${a.employee.first_name}`.localeCompare(`${b.employee.last_name} ${b.employee.first_name}`));
  } else if (scope === "all_workers") {
    const eligible = await listProjectWorkersForPeriod(companyId, projectId, period.fromDate, period.toDate);
    const hoursRows = await listWorkedHoursForPeriod(companyId, projectId, period.fromDate, period.toDate);
    const hoursByEmployeeId = new Map(hoursRows.map((row) => [row.employee.id, row]));
    rows = eligible.map((employee) => hoursByEmployeeId.get(employee.id) ?? { employee, hoursByDate: {}, totalHours: 0 });
  } else {
    rows = await listWorkedHoursForPeriod(companyId, projectId, period.fromDate, period.toDate);
  }

  const buffer = await buildWorkedHoursMatrixWorkbook(companyName, project.name, period, rows);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
