import ExcelJS from "exceljs";
import { listDailyTeamsForDate } from "./queries";
import type { DailyTeamWithMembers } from "./types";

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
    const members = [...team.foremen.map((m) => ({ ...m, roleLabel: "Foreman" })), ...team.workers.map((m) => ({ ...m, roleLabel: "Member" }))];
    const base = {
      company: companyName,
      project: projectName,
      date: workDate,
      shift: team.shift ?? "",
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

/** Monthly Worked Hours export — employees as rows, dates as columns, totals included (Phase H's "useful for payroll checking" requirement). */
export async function buildMonthlyWorkedHoursWorkbook(
  companyName: string,
  projectName: string,
  fromDate: string,
  toDate: string,
  rows: { employee: { first_name: string; last_name: string }; hoursByDate: Record<string, number>; totalHours: number }[],
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HSEQ Platform";
  workbook.created = new Date();

  const dates: string[] = [];
  for (let d = new Date(`${fromDate}T00:00:00Z`); d <= new Date(`${toDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  const sheet = workbook.addWorksheet("Worked Hours", { views: [{ state: "frozen", xSplit: 1, ySplit: 3 }] });

  sheet.getCell("A1").value = `${companyName} — ${projectName}`;
  sheet.getCell("A1").font = { bold: true, size: 12 };
  sheet.getCell("A2").value = `Period: ${fromDate} to ${toDate}`;
  sheet.getCell("A2").font = { italic: true, color: { argb: "FF6B7280" } };

  const columns = [
    { header: "Employee", key: "employee", width: 24 },
    ...dates.map((date) => ({ header: date.slice(5), key: date, width: 8 })),
    { header: "Total", key: "total", width: 10 },
  ];
  sheet.columns = columns;

  const headerRow = sheet.getRow(3);
  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
  });
  headerRow.font = HEADER_FONT;
  headerRow.fill = HEADER_FILL;

  for (const row of rows) {
    const rowData: Record<string, string | number> = {
      employee: `${row.employee.first_name} ${row.employee.last_name}`,
      total: row.totalHours,
    };
    for (const date of dates) rowData[date] = row.hoursByDate[date] ?? "";
    sheet.addRow(rowData);
  }

  const totalsRow = sheet.addRow({ employee: "TOTAL", total: rows.reduce((sum, row) => sum + row.totalHours, 0) });
  totalsRow.font = { bold: true };

  return workbook.xlsx.writeBuffer();
}

/** Single-day Worked Hours export — employee, hours, note, status. */
export async function buildDailyWorkedHoursWorkbook(
  companyName: string,
  projectName: string,
  workDate: string,
  rows: { employee: { first_name: string; last_name: string }; hours: number; note: string | null; status: string }[],
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
    { header: "Hours", key: "hours", width: 10 },
    { header: "Status", key: "status", width: 12 },
    { header: "Note", key: "note", width: 30 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = HEADER_FONT;
  headerRow.fill = HEADER_FILL;

  for (const row of rows) {
    sheet.addRow({
      company: companyName,
      project: projectName,
      date: workDate,
      employee: `${row.employee.first_name} ${row.employee.last_name}`,
      hours: row.hours,
      status: row.status === "submitted" ? "Submitted" : "Draft",
      note: row.note ?? "",
    });
  }

  const totalsRow = sheet.addRow({ employee: "TOTAL", hours: rows.reduce((sum, row) => sum + row.hours, 0) });
  totalsRow.font = { bold: true };

  return workbook.xlsx.writeBuffer();
}
