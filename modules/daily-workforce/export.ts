import ExcelJS from "exceljs";
import { listDailyTeamsForDate } from "./queries";
import type { DailyTeamWithMembers } from "./types";
import { DAILY_TEAM_SHIFT_LABELS, DAILY_TEAM_STATUS_LABELS } from "./types";
import type { WorkedHoursMatrixRow, WorkedHoursCategoryBreakdown } from "@/modules/worked-hours/types";
import { WORKED_HOURS_CATEGORIES, WORKED_HOURS_CATEGORY_SHORT_LABELS } from "@/modules/worked-hours/types";
import { formatWorkedHoursPeriodLabel, listPeriodDates, type WorkedHoursPeriod } from "@/modules/worked-hours/period";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };
const MUTED_FONT: Partial<ExcelJS.Font> = { size: 9, color: { argb: "FF9CA3AF" } };
const FOREMAN_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
const TEAM_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
const THIN_BORDER: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFD1D5DB" } };

function formatExportDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Strips characters unsafe in a Content-Disposition filename or across Windows/macOS/Linux filesystems — spaces and most punctuation stay, only genuinely reserved characters are replaced. Mirrors modules/reports/pdf/render.ts's sanitizePdfFilename for the .xlsx case. */
export function sanitizeExcelFilename(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return cleaned.endsWith(".xlsx") ? cleaned : `${cleaned}.xlsx`;
}

/**
 * Excel export for Today's Teams — a professionally formatted workbook
 * matching the page's own mental model (grouped by Foreman, one block per
 * team), never a raw flat database dump. Reused identically for both the
 * current day and any archived (locked) day — the query itself already
 * returns exactly what that day's teams looked like, whether still open
 * or locked; DAILY_TEAM_STATUS_LABELS is the same centralized label used
 * everywhere else in the app (item 3), never a locally hand-rolled
 * "Locked"/"Open" string. Company logo embedding is deliberately not
 * implemented — consistent with every other export/PDF in this codebase
 * (see modules/absences/export.ts's own header comment for the same
 * disclosed limitation), not an oversight specific to this one.
 *
 * Split into a thin DB-fetching wrapper (this function) and a pure
 * formatter (formatDailyTeamsWorkbook below) purely so the formatting
 * logic — the part actually worth asserting on — is unit-testable without
 * a live database, same reasoning as every other "derive a display value
 * from already-fetched data" pure function in this codebase.
 */
export async function buildDailyTeamsWorkbook(companyId: string, projectId: string, companyName: string, projectName: string, workDate: string, exportedBy?: string): Promise<ExcelJS.Buffer> {
  const teams = await listDailyTeamsForDate(companyId, projectId, workDate);
  return formatDailyTeamsWorkbook(companyName, projectName, workDate, teams, exportedBy);
}

type ForemanBlock = { foremanName: string; teams: DailyTeamWithMembers[] };

/** Groups teams by their resolved Foreman, preserving first-appearance order, teams with no foreman trailing under "No Foreman Assigned" — export-local, since (unlike the page) there's no separate Foreman-roster query here, only the teams that actually exist for this day. */
function groupTeamsByForeman(teams: DailyTeamWithMembers[]): ForemanBlock[] {
  const order: string[] = [];
  const blocks = new Map<string, ForemanBlock>();
  let noForemanBlock: ForemanBlock | null = null;

  for (const team of teams) {
    if (!team.foreman) {
      noForemanBlock ??= { foremanName: "No Foreman Assigned", teams: [] };
      noForemanBlock.teams.push(team);
      continue;
    }
    const key = team.foreman.id;
    if (!blocks.has(key)) {
      blocks.set(key, { foremanName: `${team.foreman.first_name} ${team.foreman.last_name}`, teams: [] });
      order.push(key);
    }
    blocks.get(key)!.teams.push(team);
  }

  const result = order.map((key) => blocks.get(key)!);
  return noForemanBlock ? [...result, noForemanBlock] : result;
}

export async function formatDailyTeamsWorkbook(companyName: string, projectName: string, workDate: string, teams: DailyTeamWithMembers[], exportedBy?: string): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HSEQ Platform";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Today's Teams", { views: [{ state: "frozen", ySplit: 6 }], pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1 } });
  sheet.columns = [{ key: "a", width: 44 }, { key: "b", width: 20 }];

  sheet.getCell("A1").value = companyName;
  sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.getCell("A2").value = projectName;
  sheet.getCell("A2").font = { size: 12, color: { argb: "FF374151" } };
  sheet.getCell("A3").value = `Today's Teams — ${formatExportDate(workDate)}`;
  sheet.getCell("A3").font = { italic: true, color: { argb: "FF6B7280" } };
  sheet.getCell("A5").value = `Exported by ${exportedBy ?? "—"} · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  sheet.getCell("A5").font = MUTED_FONT;

  let rowIndex = 7;
  const foremanBlocks = groupTeamsByForeman(teams);

  if (foremanBlocks.length === 0) {
    sheet.getCell(`A${rowIndex}`).value = "No teams recorded for this day.";
    sheet.getCell(`A${rowIndex}`).font = { italic: true, color: { argb: "FF6B7280" } };
  }

  for (const block of foremanBlocks) {
    const foremanRow = sheet.getRow(rowIndex);
    foremanRow.getCell(1).value = `FOREMAN: ${block.foremanName}`;
    foremanRow.getCell(1).font = { bold: true, size: 12 };
    sheet.mergeCells(rowIndex, 1, rowIndex, 2);
    for (let col = 1; col <= 2; col++) foremanRow.getCell(col).fill = FOREMAN_FILL;
    rowIndex += 2;

    for (const team of block.teams) {
      const teamNameRow = sheet.getRow(rowIndex);
      teamNameRow.getCell(1).value = team.name.toUpperCase();
      teamNameRow.getCell(1).font = { bold: true };
      sheet.mergeCells(rowIndex, 1, rowIndex, 2);
      teamNameRow.getCell(1).fill = TEAM_FILL;
      teamNameRow.getCell(2).fill = TEAM_FILL;
      rowIndex += 1;

      const fields: [string, string][] = [
        ["Shift", team.shift ? DAILY_TEAM_SHIFT_LABELS[team.shift] : "—"],
        ["Area", team.work_area ?? "—"],
        ["Activity", team.activity ?? "—"],
        ["Status", DAILY_TEAM_STATUS_LABELS[team.status]],
        ["Workers", String(team.workers.length)],
      ];
      for (const [label, value] of fields) {
        sheet.getCell(`A${rowIndex}`).value = `${label}: ${value}`;
        rowIndex += 1;
      }

      if (team.workers.length > 0) {
        sheet.getCell(`A${rowIndex}`).value = "Workers";
        sheet.getCell(`A${rowIndex}`).font = { italic: true, color: { argb: "FF6B7280" } };
        rowIndex += 1;
        for (const worker of team.workers) {
          sheet.getCell(`A${rowIndex}`).value = `${worker.employee.first_name} ${worker.employee.last_name}`;
          rowIndex += 1;
        }
      }

      const blockEndRow = rowIndex - 1;
      const blockStartRow = blockEndRow - fields.length - (team.workers.length > 0 ? 1 + team.workers.length : 0) + 1;
      for (let r = blockStartRow; r <= blockEndRow; r++) {
        for (let col = 1; col <= 2; col++) {
          sheet.getCell(r, col).border = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };
        }
      }

      rowIndex += 1;
    }
    rowIndex += 1;
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
