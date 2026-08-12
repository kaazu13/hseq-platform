import ExcelJS from "exceljs";
import { LEAVE_TYPE_LABELS, LEAVE_REQUEST_STATUS_LABELS, countLeaveCalendarDays, type LeaveRequestWithEmployee } from "./types";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };

/**
 * Holiday/Leave Excel export (Phase 10) — a date-range export, not Day/
 * Week/Month like Worked Hours (leave requests span arbitrary ranges by
 * nature, so a single-day or single-week bucket doesn't fit the data the
 * way it does for hours worked).
 */
export async function buildLeaveRequestsWorkbook(
  companyName: string,
  projectName: string,
  rangeLabel: string,
  rows: LeaveRequestWithEmployee[],
  deciderNameById: Map<string, string> = new Map(),
  exportedBy?: string,
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HSEQ Platform";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Leave Requests", { views: [{ state: "frozen", ySplit: 5 }] });
  sheet.getCell("A1").value = `${companyName} — Holiday / Leave`;
  sheet.getCell("A1").font = { bold: true, size: 12 };
  sheet.getCell("A2").value = `Project: ${projectName}`;
  sheet.getCell("A2").font = { color: { argb: "FF6B7280" } };
  sheet.getCell("A3").value = `Range: ${rangeLabel}`;
  sheet.getCell("A3").font = { italic: true, color: { argb: "FF6B7280" } };
  sheet.getCell("A4").value = `Exported by ${exportedBy ?? "—"} · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  sheet.getCell("A4").font = { size: 9, color: { argb: "FF9CA3AF" } };

  sheet.columns = [
    { header: "Employee", key: "employee", width: 24 },
    { header: "Leave type", key: "leaveType", width: 16 },
    { header: "Start date", key: "startDate", width: 14 },
    { header: "End date", key: "endDate", width: 14 },
    { header: "Days", key: "days", width: 8 },
    { header: "Status", key: "status", width: 18 },
    { header: "Requested at", key: "requestedAt", width: 20 },
    { header: "Decided by", key: "decidedBy", width: 22 },
    { header: "Decided at", key: "decidedAt", width: 20 },
    { header: "Management comment", key: "managementComment", width: 34 },
  ];

  const headerRow = sheet.getRow(5);
  ["Employee", "Leave type", "Start date", "End date", "Days", "Status", "Requested at", "Decided by", "Decided at", "Management comment"].forEach(
    (label, index) => (headerRow.getCell(index + 1).value = label),
  );
  headerRow.font = HEADER_FONT;
  headerRow.fill = HEADER_FILL;

  for (const row of rows) {
    sheet.addRow({
      employee: `${row.employee.first_name} ${row.employee.last_name}`,
      leaveType: LEAVE_TYPE_LABELS[row.leave_type],
      startDate: row.start_date,
      endDate: row.end_date,
      days: countLeaveCalendarDays(row.start_date, row.end_date),
      status: LEAVE_REQUEST_STATUS_LABELS[row.status],
      requestedAt: new Date(row.requested_at).toISOString().slice(0, 16).replace("T", " "),
      decidedBy: row.decided_by ? (deciderNameById.get(row.decided_by) ?? "") : "",
      decidedAt: row.decided_at ? new Date(row.decided_at).toISOString().slice(0, 16).replace("T", " ") : "",
      managementComment: row.management_comment ?? "",
    });
  }

  if (rows.length === 0) {
    sheet.addRow({ employee: "No leave requests recorded for this range." });
  }

  return workbook.xlsx.writeBuffer();
}
