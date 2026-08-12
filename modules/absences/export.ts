import ExcelJS from "exceljs";
import { DAILY_ATTENDANCE_STATUS_LABELS, type DailyAttendanceStatus } from "@/modules/daily-workforce/types";
import type { AbsenceExportRow } from "./queries";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };

/**
 * Absence Excel export (Phase 6) — one professional workbook covering
 * Day/Week/Month, since the underlying shape (employee/date/status/note) is
 * identical regardless of range; the period label in the title row is the
 * only thing that changes. Deliberately readable, not a raw table dump —
 * matches buildDailyWorkedHoursWorkbook's own header-block convention
 * (modules/daily-workforce/export.ts). Includes "Exported by/at" (Phase
 * 17) — company logo embedding is not implemented in this export (text
 * branding metadata only; see the milestone's final report for the
 * disclosed scope limitation).
 */
export async function buildAbsenceWorkbook(companyName: string, projectName: string, periodLabel: string, rows: AbsenceExportRow[], exportedBy?: string): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HSEQ Platform";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Absences", { views: [{ state: "frozen", ySplit: 5 }] });
  sheet.getCell("A1").value = `${companyName} — Absences`;
  sheet.getCell("A1").font = { bold: true, size: 12 };
  sheet.getCell("A2").value = `Project: ${projectName}`;
  sheet.getCell("A2").font = { color: { argb: "FF6B7280" } };
  sheet.getCell("A3").value = `Period: ${periodLabel}`;
  sheet.getCell("A3").font = { italic: true, color: { argb: "FF6B7280" } };
  sheet.getCell("A4").value = `Exported by ${exportedBy ?? "—"} · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  sheet.getCell("A4").font = { size: 9, color: { argb: "FF9CA3AF" } };

  sheet.columns = [
    { header: "Employee", key: "employee", width: 24 },
    { header: "Role", key: "role", width: 18 },
    { header: "Date", key: "date", width: 14 },
    { header: "Status", key: "status", width: 16 },
    { header: "Note", key: "note", width: 34 },
  ];

  const headerRow = sheet.getRow(5);
  ["Employee", "Role", "Date", "Status", "Note"].forEach((label, index) => (headerRow.getCell(index + 1).value = label));
  headerRow.font = HEADER_FONT;
  headerRow.fill = HEADER_FILL;

  for (const row of rows) {
    sheet.addRow({
      employee: `${row.employee.first_name} ${row.employee.last_name}`,
      role: row.employee.position_title || "",
      date: row.workDate,
      status: DAILY_ATTENDANCE_STATUS_LABELS[row.status as DailyAttendanceStatus] ?? row.status,
      note: row.note ?? "",
    });
  }

  if (rows.length === 0) {
    sheet.addRow({ employee: "No absences recorded for this period." });
  }

  return workbook.xlsx.writeBuffer();
}
