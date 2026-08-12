import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { formatDailyTeamsWorkbook, buildWorkedHoursMatrixWorkbook, buildDailyWorkedHoursWorkbook } from "./export";
import type { DailyTeamWithMembers, DailyTeamMemberWithEmployee } from "./types";

function employee(id: string, firstName: string, lastName: string, positionTitle = ""): DailyTeamMemberWithEmployee["employee"] {
  return { id, first_name: firstName, last_name: lastName, position_title: positionTitle, profile_id: "", archived_at: "" };
}

function member(id: string, dailyTeamId: string, role: "member" | "foreman", emp: DailyTeamMemberWithEmployee["employee"]): DailyTeamMemberWithEmployee {
  return {
    id,
    company_id: "c1",
    project_id: "p1",
    work_date: "2026-08-10",
    daily_team_id: dailyTeamId,
    employee_id: emp.id,
    role,
    shift: "Day Shift",
    created_at: "2026-08-10T08:00:00Z",
    created_by: null,
    removed_at: null,
    removed_by: null,
    employee: emp,
  };
}

async function loadFirstSheetRows(buffer: ExcelJS.Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    rows.push((row.values as unknown[]).slice(1).map((v) => (v === null || v === undefined ? "" : String(v))));
  });
  return rows;
}

describe("formatDailyTeamsWorkbook", () => {
  const team: DailyTeamWithMembers = {
    id: "t1",
    company_id: "c1",
    project_id: "p1",
    work_date: "2026-08-10",
    name: "Team A200",
    shift: "Day Shift",
    work_area: "A200",
    activity: "Scaffold Assembly",
    status: "open",
    display_order: 0,
    locked_at: null,
    locked_by: null,
    unlocked_at: null,
    unlocked_by: null,
    unlock_reason: null,
    created_at: "2026-08-10T07:00:00Z",
    updated_at: "2026-08-10T07:00:00Z",
    created_by: null,
    updated_by: null,
    foremen: [member("m1", "t1", "foreman", employee("e1", "Karl", "Andersson"))],
    workers: [member("m2", "t1", "member", employee("e2", "Anders", "Holm"))],
  };

  it("produces one row per team member, with company/project/date/shift repeated on every row", async () => {
    const buffer = await formatDailyTeamsWorkbook("Northstar", "North Plant Expansion", "2026-08-10", [team]);
    const rows = await loadFirstSheetRows(buffer);
    // Header + 2 member rows (1 foreman, 1 worker).
    expect(rows).toHaveLength(3);
    const [, foremanRow, workerRow] = rows;
    expect(foremanRow).toEqual(["Northstar", "North Plant Expansion", "2026-08-10", "Day Shift", "Team A200", "A200", "Scaffold Assembly", "Karl Andersson", "Foreman", "Open"]);
    expect(workerRow[7]).toBe("Anders Holm");
    expect(workerRow[8]).toBe("Member");
  });

  it("shows Locked/Open status matching the team's own status", async () => {
    const lockedBuffer = await formatDailyTeamsWorkbook("Northstar", "North Plant Expansion", "2026-08-10", [{ ...team, status: "locked" }]);
    const rows = await loadFirstSheetRows(lockedBuffer);
    expect(rows[1][9]).toBe("Locked");
  });

  it("emits a single row with blank employee/role for a team with no members, rather than omitting it entirely", async () => {
    const emptyTeam: DailyTeamWithMembers = { ...team, foremen: [], workers: [] };
    const buffer = await formatDailyTeamsWorkbook("Northstar", "North Plant Expansion", "2026-08-10", [emptyTeam]);
    const rows = await loadFirstSheetRows(buffer);
    expect(rows).toHaveLength(2);
    expect(rows[1][4]).toBe("Team A200");
    expect(rows[1][7]).toBe("");
  });
});

const ZERO_CATEGORY_TOTALS = { regular: 0, overtime: 0, night: 0, travel: 0, other: 0 };

describe("buildWorkedHoursMatrixWorkbook", () => {
  it("lays out one row per employee with hours under the matching date column, plus Role/category totals/Grand Total/Days Worked and a totals row", async () => {
    const period = { mode: "week" as const, fromDate: "2026-08-01", toDate: "2026-08-03" };
    const buffer = await buildWorkedHoursMatrixWorkbook("Northstar", "North Plant Expansion", period, [
      {
        employee: employee("e1", "Karl", "Andersson", "Scaffolder"),
        hoursByDate: { "2026-08-01": 8, "2026-08-02": 8 },
        categoryTotals: { ...ZERO_CATEGORY_TOTALS, regular: 14, overtime: 2 },
        totalHours: 16,
      },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];

    // Row 4 is the column header row (rows 1-3 are the title/project/period
    // lines); columns are Employee, Role, one per date in range, then
    // Regular/Overtime/Night/Travel/Other Total, Grand Total, Days Worked.
    expect(sheet.getRow(4).getCell(1).value).toBe("Employee");
    expect(sheet.getRow(4).getCell(2).value).toBe("Role");
    expect(sheet.getRow(4).getCell(6).value).toBe("Regular Total");
    expect(sheet.getRow(4).getCell(7).value).toBe("Overtime Total");
    expect(sheet.getRow(4).getCell(11).value).toBe("Grand Total");
    expect(sheet.getRow(4).getCell(12).value).toBe("Days Worked");

    expect(sheet.getRow(5).getCell(1).value).toBe("Karl Andersson");
    expect(sheet.getRow(5).getCell(2).value).toBe("Scaffolder");
    // Employee(1) + Role(2) + 3 dates(3-5) + Regular(6) = 14.
    expect(sheet.getRow(5).getCell(6).value).toBe(14);
    expect(sheet.getRow(5).getCell(7).value).toBe(2); // Overtime Total
    expect(sheet.getRow(5).getCell(11).value).toBe(16); // Grand Total
    // Days Worked = column 12 — 2 days had hours > 0 out of the 3-day range.
    expect(sheet.getRow(5).getCell(12).value).toBe(2);
    const totalsRowValues = (sheet.getRow(6).values as unknown[]).slice(1);
    expect(totalsRowValues[0]).toBe("TOTAL");
  });

  it("never emits a date column outside the resolved period, even if a row's hoursByDate has a stray out-of-range key", async () => {
    const period = { mode: "day" as const, fromDate: "2026-08-10", toDate: "2026-08-10" };
    const buffer = await buildWorkedHoursMatrixWorkbook("Northstar", "North Plant Expansion", period, [
      { employee: employee("e2", "Anders", "Holm"), hoursByDate: { "2026-08-10": 8, "2026-09-01": 99 }, categoryTotals: { ...ZERO_CATEGORY_TOTALS, regular: 8 }, totalHours: 8 },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    // Employee, Role, one date column, 5 category totals, Grand Total, Days Worked = 10 columns.
    expect(sheet.getRow(4).actualCellCount).toBe(10);
    expect(sheet.getRow(4).getCell(3).value).toBe("08-10");
  });
});

describe("buildDailyWorkedHoursWorkbook", () => {
  it("includes company/project/date/category breakdown on every row plus a totals row", async () => {
    const buffer = await buildDailyWorkedHoursWorkbook("Northstar", "North Plant Expansion", "2026-08-10", [
      { employee: { first_name: "Karl", last_name: "Andersson" }, hours: 8, note: null, status: "submitted", breakdown: { ...ZERO_CATEGORY_TOTALS, regular: 8 } },
      { employee: { first_name: "Anders", last_name: "Holm" }, hours: 7.5, note: "Left early", status: "draft", breakdown: { ...ZERO_CATEGORY_TOTALS, regular: 6, overtime: 1.5 } },
    ]);
    const rows = await loadFirstSheetRows(buffer);
    expect(rows).toHaveLength(4); // header + 2 rows + totals
    // Columns: Company, Project, Date, Employee, Regular, Overtime, Night, Travel, Other, Total, Status, Note.
    expect(rows[0]).toEqual(["Company", "Project", "Date", "Employee", "Regular", "Overtime", "Night", "Travel", "Other", "Total", "Status", "Note"]);
    expect(rows[1]).toEqual(["Northstar", "North Plant Expansion", "2026-08-10", "Karl Andersson", "8", "0", "0", "0", "0", "8", "Submitted", ""]);
    expect(rows[2]).toEqual(["Northstar", "North Plant Expansion", "2026-08-10", "Anders Holm", "6", "1.5", "0", "0", "0", "7.5", "Draft", "Left early"]);
    expect(rows[3][3]).toBe("TOTAL");
    expect(rows[3][9]).toBe("15.5");
  });
});
