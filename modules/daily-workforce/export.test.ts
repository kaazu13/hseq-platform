import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { formatDailyTeamsWorkbook, buildWorkedHoursMatrixWorkbook, buildDailyWorkedHoursWorkbook, sanitizeExcelFilename } from "./export";
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
    shift: "day",
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

/** Flattens every non-empty cell across the sheet into a plain string list — used for formatDailyTeamsWorkbook's grouped, variable-row-position layout, where asserting on a fixed row/column index would be brittle. */
async function loadAllCellText(buffer: ExcelJS.Buffer): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  const cells: string[] = [];
  sheet.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.value !== null && cell.value !== undefined && cell.value !== "") cells.push(String(cell.value));
    });
  });
  return cells;
}

describe("formatDailyTeamsWorkbook — item 2's foreman-grouped, professionally formatted layout", () => {
  const team: DailyTeamWithMembers = {
    id: "t1",
    company_id: "c1",
    project_id: "p1",
    work_date: "2026-08-10",
    name: "team 1",
    shift: "day",
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
    foreman_employee_id: "e1",
    foreman: employee("e1", "Karl", "Andersson"),
    workers: [member("m2", "t1", "member", employee("e2", "Anders", "Holm")), member("m3", "t1", "member", employee("e3", "Elin", "Forsberg"))],
  };

  it("includes company name, project name, and the formatted date at the top", async () => {
    const buffer = await formatDailyTeamsWorkbook("Northstar Scaffolding Test AB", "North Plant Expansion", "2026-08-13", [team]);
    const cells = await loadAllCellText(buffer);
    expect(cells).toContain("Northstar Scaffolding Test AB");
    expect(cells).toContain("North Plant Expansion");
    expect(cells.some((c) => c.includes("13 Aug 2026"))).toBe(true);
  });

  it("includes an 'Exported by' line with the name and a timestamp, falling back to an em dash when no name is given", async () => {
    const withName = await loadAllCellText(await formatDailyTeamsWorkbook("Northstar", "North Plant Expansion", "2026-08-13", [team], "Erik Lindqvist"));
    expect(withName.some((c) => c.startsWith("Exported by Erik Lindqvist ·"))).toBe(true);

    const withoutName = await loadAllCellText(await formatDailyTeamsWorkbook("Northstar", "North Plant Expansion", "2026-08-13", [team]));
    expect(withoutName.some((c) => c.startsWith("Exported by — ·"))).toBe(true);
  });

  it("groups under 'FOREMAN: {name}', shows the team name, and lists Shift/Area/Activity/Status/Workers", async () => {
    const cells = await loadAllCellText(await formatDailyTeamsWorkbook("Northstar", "North Plant Expansion", "2026-08-13", [team]));
    expect(cells).toContain("FOREMAN: Karl Andersson");
    expect(cells).toContain("TEAM 1");
    expect(cells).toContain("Shift: Day Shift");
    expect(cells).toContain("Area: A200");
    expect(cells).toContain("Activity: Scaffold Assembly");
    expect(cells).toContain("Status: Open");
    expect(cells).toContain("Workers: 2");
    expect(cells).toContain("Anders Holm");
    expect(cells).toContain("Elin Forsberg");
  });

  it("shows Locked status via the same centralized DAILY_TEAM_STATUS_LABELS used elsewhere in the app", async () => {
    const cells = await loadAllCellText(await formatDailyTeamsWorkbook("Northstar", "North Plant Expansion", "2026-08-13", [{ ...team, status: "locked" }]));
    expect(cells).toContain("Status: Locked");
  });

  it("multiple Foremen each get their own heading, teams grouped under the correct one", async () => {
    const teamTwo: DailyTeamWithMembers = {
      ...team,
      id: "t2",
      name: "team 2",
      foreman_employee_id: "e4",
      foreman: employee("e4", "Peter", "Karlsson"),
      workers: [member("m5", "t2", "member", employee("e5", "David", "Ekström"))],
    };
    const cells = await loadAllCellText(await formatDailyTeamsWorkbook("Northstar", "North Plant Expansion", "2026-08-13", [team, teamTwo]));
    expect(cells).toContain("FOREMAN: Karl Andersson");
    expect(cells).toContain("FOREMAN: Peter Karlsson");
    expect(cells.indexOf("FOREMAN: Karl Andersson")).toBeLessThan(cells.indexOf("TEAM 1"));
    expect(cells.indexOf("FOREMAN: Peter Karlsson")).toBeLessThan(cells.indexOf("TEAM 2"));
  });

  it("a team with no foreman falls under 'No Foreman Assigned'", async () => {
    const orphanTeam: DailyTeamWithMembers = { ...team, foreman_employee_id: null, foreman: null };
    const cells = await loadAllCellText(await formatDailyTeamsWorkbook("Northstar", "North Plant Expansion", "2026-08-13", [orphanTeam]));
    expect(cells).toContain("FOREMAN: No Foreman Assigned");
  });

  it("a team with zero workers shows 'Workers: 0' and no worker names, never omitting the team block entirely", async () => {
    const emptyTeam: DailyTeamWithMembers = { ...team, workers: [] };
    const cells = await loadAllCellText(await formatDailyTeamsWorkbook("Northstar", "North Plant Expansion", "2026-08-13", [emptyTeam]));
    expect(cells).toContain("TEAM 1");
    expect(cells).toContain("Workers: 0");
    expect(cells).not.toContain("Anders Holm");
  });

  it("never renders a raw employee/team/company id anywhere in the sheet", async () => {
    const cells = await loadAllCellText(await formatDailyTeamsWorkbook("Northstar", "North Plant Expansion", "2026-08-13", [team]));
    const uuidLike = /^[0-9a-f-]{8,}$/i;
    expect(cells.some((c) => uuidLike.test(c) && (c === team.id || c === "e1" || c === "e2"))).toBe(false);
  });

  it("says 'No teams recorded for this day' rather than an empty sheet when there are zero teams", async () => {
    const cells = await loadAllCellText(await formatDailyTeamsWorkbook("Northstar", "North Plant Expansion", "2026-08-13", []));
    expect(cells).toContain("No teams recorded for this day.");
  });
});

describe("sanitizeExcelFilename", () => {
  it("appends .xlsx if missing", () => {
    expect(sanitizeExcelFilename("North Plant Expansion - Today's Teams - 2026-08-13")).toBe("North Plant Expansion - Today's Teams - 2026-08-13.xlsx");
  });

  it("strips filesystem/Content-Disposition-unsafe characters but keeps spaces and punctuation", () => {
    expect(sanitizeExcelFilename('Weird: "Project" / Name? *.xlsx')).toBe("Weird- -Project- - Name- -.xlsx");
  });

  it("does not double the extension when already present", () => {
    expect(sanitizeExcelFilename("Already Named.xlsx")).toBe("Already Named.xlsx");
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
