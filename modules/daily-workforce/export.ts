import ExcelJS from "exceljs";
import { listDailyTeamsForDate } from "./queries";
import type { DailyTeamWithMembers } from "./types";
import { DAILY_TEAM_SHIFT_LABELS } from "./types";
import type { WorkedHoursMatrixRow, WorkedHoursCategoryBreakdown } from "@/modules/worked-hours/types";
import { WORKED_HOURS_CATEGORIES, WORKED_HOURS_CATEGORY_SHORT_LABELS } from "@/modules/worked-hours/types";
import { formatWorkedHoursPeriodLabel, listPeriodDates, type WorkedHoursPeriod } from "@/modules/worked-hours/period";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };

/**
 * Excel export for Today's Teams (Phase H) — a professionally formatted
 * workbook, not a raw database dump: a header row with company/project/
 * date/shift, styled column headers, and one row per team member. Reused
 * identically for both the current day and any archived (locked) day —
 * the query itself already returns exactly what that day's teams looked
 * like, whether still open or locked.
 *
 * Split into a thin DB-fetching wrapper (this function) and a pure
 * formatter (formatDailyTeamsWorkbook below) purely so the formatting
 * logic — the part actually worth asserting on — is unit-testable without
 * a live database, same reasoning as every other "derive a display value
 * from already-fetched data" pure function in this codebase.
 */
export async function buildDailyTeamsWorkbook(companyId: string, projectId: string, companyName: string, projectName: string, workDate: string): Promise<ExcelJS.Buffer> {
  const teams = await listDailyTeamsForDate(companyId, projectId, workDate);
  return formatDailyTeamsWorkbook(companyName, projectName, workDate, teams);
}

export async function formatDailyTeamsWorkbook(companyName: string, projectName: string, workDate: string, teams: DailyTeamWithMembers[]): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HSEQ Platform";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Today's Teams", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Company", key: "company", width: 24 },
    { header: "Project", key: "project", width: 24 },
    { header: "Date", key: "date", width: 14 },
    { header: "Shift", key: "shift", width: 14 },
    { header: "Team", key: "team", width: 18 },
    { header: "Work area", key: "workArea", width: 16 },
    { header: "Activity", key: "activity", width: 20 },
    { header: "Employee", key: "employee", width: 24 },
    { header: "Role", key: "role", width: 12 },
    { header: "Status", key: "status", width: 14 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = HEADER_FONT;
  headerRow.fill = HEADER_FILL;
  headerRow.alignment = { vertical: "middle" };

  for (const team of teams) {
    const foremanRow = team.foreman ? [{ employee: team.foreman, roleLabel: "Foreman" }] : [];
    const members = [...foremanRow, ...team.workers.map((m) => ({ employee: m.employee, roleLabel: "Member" }))];
    const base = {
      company: companyName,
      project: projectName,
      date: workDate,
      shift: team.shift ? DAILY_TEAM_SHIFT_LABELS[team.shift] : "",
      team: team.name,
      workArea: team.work_area ?? "",
      activity: team.activity ?? "",
      status: team.status === "locked" ? "Locked" : "Open",
    };
    if (members.length === 0) {
      sheet.addRow({ ...base, employee: "", role: "" });
      continue;
    }
    for (const member of members) {
      sheet.addRow({ ...base, employee: `${member.employee.first_name} ${member.employee.last_name}`, role: member.roleLabel });
    }
  }

  return workbook.xlsx.writeBuffer();
}

/**
 * Week/Month Worked Hours export (Phase 7, extended for Worked Hours V2's
 * categories in Phase 3) — a payroll-checking matrix: Employee | Role |
 * one column per calendar date in the resolved period (each cell is that
 * day's TOTAL across every category — the per-category date-by-date
 * breakdown would make a month sheet unreadably wide, 5 categories x 31
 * days; see this function's own "Do not create an unreadable spreadsheet"
 * constraint) | Regular Total | Overtime Total | Night Total | Travel
 * Total | Other Total | Grand Total | Days Worked. Every date column
 * comes from listPeriodDates(period) — never a date outside the resolved
 * [fromDate, toDate] range, even if a caller's `rows` somehow contained
 * one (a stray hoursByDate key outside the period is simply never read).
 * Role uses `position_title` (get_basic_employee_info()'s narrow,
 * approved column set has no employee_number — see
 * modules/employees/employee-options.ts's header comment; deliberately
 * not widening that SECURITY DEFINER function's return shape just for
 * this export). No raw UUIDs or database-internal fields appear anywhere
 * in the sheet.
 */
export async function buildWorkedHoursMatrixWorkbook(companyName: string, projectName: string, period: WorkedHoursPeriod, rows: WorkedHoursMatrixRow[]): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HSEQ Platform";
  workbook.created = new Date();

  const dates = listPeriodDates(period);
  const sheet = workbook.addWorksheet("Worked Hours", { views: [{ state: "frozen", xSplit: 2, ySplit: 4 }] });

  sheet.getCell("A1").value = `${companyName} — Worked Hours`;
  sheet.getCell("A1").font = { bold: true, size: 12 };
  sheet.getCell("A2").value = `Project: ${projectName}`;
  sheet.getCell("A2").font = { color: { argb: "FF6B7280" } };
  sheet.getCell("A3").value = `Period: ${formatWorkedHoursPeriodLabel(period)}`;
  sheet.getCell("A3").font = { italic: true, color: { argb: "FF6B7280" } };

  const columns = [
    { header: "Employee", key: "employee", width: 24 },
    { header: "Role", key: "role", width: 18 },
    ...dates.map((date) => ({ header: date.slice(5), key: date, width: 8 })),
    ...WORKED_HOURS_CATEGORIES.map((category) => ({ header: `${WORKED_HOURS_CATEGORY_SHORT_LABELS[category]} Total`, key: `categoryTotal_${category}`, width: 13 })),
    { header: "Grand Total", key: "total", width: 12 },
    { header: "Days Worked", key: "daysWorked", width: 12 },
  ];
  sheet.columns = columns;

  const headerRow = sheet.getRow(4);
  columns.forEach((column, index) => {
    headerRow.getCell(index + 1).value = column.header;
  });
  headerRow.font = HEADER_FONT;
  headerRow.fill = HEADER_FILL;

  for (const row of rows) {
    const rowData: Record<string, string | number> = {
      employee: `${row.employee.first_name} ${row.employee.last_name}`,
      role: row.employee.position_title || "",
      total: row.totalHours,
      daysWorked: dates.filter((date) => (row.hoursByDate[date] ?? 0) > 0).length,
    };
    for (const category of WORKED_HOURS_CATEGORIES) rowData[`categoryTotal_${category}`] = row.categoryTotals[category];
    for (const date of dates) {
      const hours = row.hoursByDate[date];
      if (hours !== undefined) rowData[date] = hours;
    }
    sheet.addRow(rowData);
  }

  const totalsRow: Record<string, string | number> = {
    employee: "TOTAL",
    total: rows.reduce((sum, row) => sum + row.totalHours, 0),
    daysWorked: rows.reduce((sum, row) => sum + dates.filter((date) => (row.hoursByDate[date] ?? 0) > 0).length, 0),
  };
  for (const category of WORKED_HOURS_CATEGORIES) totalsRow[`categoryTotal_${category}`] = rows.reduce((sum, row) => sum + row.categoryTotals[category], 0);
  const totalsRowRef = sheet.addRow(totalsRow);
  totalsRowRef.font = { bold: true };

  return workbook.xlsx.writeBuffer();
}

/** Single-day Worked Hours export — employee, each hour category, total, note, status (Worked Hours V2, Phase 3). */
export async function buildDailyWorkedHoursWorkbook(
  companyName: string,
  projectName: string,
  workDate: string,
  rows: { employee: { first_name: string; last_name: string }; hours: string | number; note: string | null; status: string; breakdown: WorkedHoursCategoryBreakdown }[],
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HSEQ Platform";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Worked Hours");
  sheet.columns = [
    { header: "Company", key: "company", width: 22 },
    { header: "Project", key: "project", width: 24 },
    { header: "Date", key: "date", width: 14 },
    { header: "Employee", key: "employee", width: 24 },
    ...WORKED_HOURS_CATEGORIES.map((category) => ({ header: WORKED_HOURS_CATEGORY_SHORT_LABELS[category], key: `category_${category}`, width: 11 })),
    { header: "Total", key: "hours", width: 10 },
    { header: "Status", key: "status", width: 12 },
    { header: "Note", key: "note", width: 30 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = HEADER_FONT;
  headerRow.fill = HEADER_FILL;

  for (const row of rows) {
    const rowData: Record<string, string | number> = {
      company: companyName,
      project: projectName,
      date: workDate,
      employee: `${row.employee.first_name} ${row.employee.last_name}`,
      hours: Number(row.hours),
      status: row.status === "submitted" ? "Submitted" : "Draft",
      note: row.note ?? "",
    };
    for (const category of WORKED_HOURS_CATEGORIES) rowData[`category_${category}`] = row.breakdown[category];
    sheet.addRow(rowData);
  }

  const totalsRow: Record<string, string | number> = { employee: "TOTAL", hours: rows.reduce((sum, row) => sum + Number(row.hours), 0) };
  for (const category of WORKED_HOURS_CATEGORIES) totalsRow[`category_${category}`] = rows.reduce((sum, row) => sum + row.breakdown[category], 0);
  const totalsRowRef = sheet.addRow(totalsRow);
  totalsRowRef.font = { bold: true };

  return workbook.xlsx.writeBuffer();
}
