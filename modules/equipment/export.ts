import ExcelJS from "exceljs";
import { listAllEquipmentItemsForExport, listEquipmentAssignments, listEquipmentRequests, listEquipmentHistory } from "./queries";
import { EQUIPMENT_STATUS_LABELS, EQUIPMENT_CONDITION_LABELS, EQUIPMENT_TRACKING_MODE_LABELS, EQUIPMENT_ASSIGNMENT_STATUS_LABELS, EQUIPMENT_REQUEST_STATUS_LABELS, EQUIPMENT_HISTORY_EVENT_LABELS, equipmentIssuedQuantity } from "./types";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };
const MUTED_FONT: Partial<ExcelJS.Font> = { size: 9, color: { argb: "FF9CA3AF" } };

/** Mirrors modules/daily-workforce/export.ts's sanitizeExcelFilename exactly. */
export function sanitizeEquipmentExcelFilename(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return cleaned.endsWith(".xlsx") ? cleaned : `${cleaned}.xlsx`;
}

function addTitleBlock(sheet: ExcelJS.Worksheet, companyName: string, projectName: string, title: string, exportedBy?: string) {
  sheet.getCell("A1").value = companyName;
  sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.getCell("A2").value = `${projectName} — ${title}`;
  sheet.getCell("A2").font = { size: 12, color: { argb: "FF374151" } };
  sheet.getCell("A3").value = `Exported by ${exportedBy ?? "—"} · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  sheet.getCell("A3").font = MUTED_FONT;
}

function styleHeaderRow(sheet: ExcelJS.Worksheet, rowIndex: number) {
  const row = sheet.getRow(rowIndex);
  row.font = HEADER_FONT;
  row.fill = HEADER_FILL;
}

/** Item 17 — Inventory export. Item/Asset/Category/Specification/Quantity/Available/Issued/Status/Condition/Location — no UUIDs, no raw enums. */
export async function buildEquipmentInventoryWorkbook(companyId: string, projectId: string, companyName: string, projectName: string, exportedBy?: string): Promise<ExcelJS.Buffer> {
  const items = await listAllEquipmentItemsForExport(companyId, projectId);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HSEQ Platform";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Inventory", { views: [{ state: "frozen", ySplit: 5 }] });
  addTitleBlock(sheet, companyName, projectName, "Equipment Inventory", exportedBy);

  const columns = [
    { header: "Item", key: "item", width: 26 },
    { header: "Category", key: "category", width: 18 },
    { header: "Tracking", key: "tracking", width: 18 },
    { header: "Asset / Ref #", key: "reference", width: 16 },
    { header: "Specification", key: "specification", width: 16 },
    { header: "Quantity", key: "quantity", width: 10 },
    { header: "Available", key: "available", width: 10 },
    { header: "Issued", key: "issued", width: 10 },
    { header: "Status", key: "status", width: 14 },
    { header: "Condition", key: "condition", width: 16 },
    { header: "Location", key: "location", width: 16 },
    { header: "Ownership", key: "ownership", width: 16 },
  ];
  sheet.columns = columns;
  const headerRow = sheet.getRow(5);
  columns.forEach((column, index) => (headerRow.getCell(index + 1).value = column.header));
  styleHeaderRow(sheet, 5);

  for (const item of items) {
    sheet.addRow({
      item: item.name,
      category: item.category,
      tracking: EQUIPMENT_TRACKING_MODE_LABELS[item.tracking_mode],
      reference: item.reference_number ?? "",
      specification: item.specification ?? "",
      quantity: item.quantity,
      available: item.available_quantity,
      issued: equipmentIssuedQuantity(item),
      status: EQUIPMENT_STATUS_LABELS[item.status],
      condition: EQUIPMENT_CONDITION_LABELS[item.condition],
      location: item.location ?? "",
      ownership: item.project_id ? projectName : "Company-wide",
    });
  }

  return workbook.xlsx.writeBuffer();
}

/** Item 17 — Issued export. */
export async function buildEquipmentIssuedWorkbook(companyId: string, projectId: string, companyName: string, projectName: string, exportedBy?: string): Promise<ExcelJS.Buffer> {
  const assignments = await listEquipmentAssignments(companyId, projectId);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HSEQ Platform";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Issued Equipment", { views: [{ state: "frozen", ySplit: 5 }] });
  addTitleBlock(sheet, companyName, projectName, "Issued Equipment", exportedBy);

  const columns = [
    { header: "Employee", key: "employee", width: 24 },
    { header: "Equipment", key: "equipment", width: 26 },
    { header: "Asset / Ref #", key: "reference", width: 16 },
    { header: "Quantity", key: "quantity", width: 10 },
    { header: "Issue Date", key: "issued", width: 14 },
    { header: "Expected Return", key: "expectedReturn", width: 16 },
    { header: "Status", key: "status", width: 14 },
  ];
  sheet.columns = columns;
  const headerRow = sheet.getRow(5);
  columns.forEach((column, index) => (headerRow.getCell(index + 1).value = column.header));
  styleHeaderRow(sheet, 5);

  for (const assignment of assignments) {
    sheet.addRow({
      employee: `${assignment.employee.first_name} ${assignment.employee.last_name}`,
      equipment: assignment.item.name,
      reference: assignment.item.reference_number ?? "",
      quantity: assignment.quantity,
      issued: assignment.issued_at,
      expectedReturn: assignment.expected_return_at ?? "",
      status: EQUIPMENT_ASSIGNMENT_STATUS_LABELS[assignment.status],
    });
  }

  return workbook.xlsx.writeBuffer();
}

/** Item 17 — Requests export. */
export async function buildEquipmentRequestsWorkbook(companyId: string, projectId: string, companyName: string, projectName: string, exportedBy?: string): Promise<ExcelJS.Buffer> {
  const requests = await listEquipmentRequests(companyId, projectId);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HSEQ Platform";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Equipment Requests", { views: [{ state: "frozen", ySplit: 5 }] });
  addTitleBlock(sheet, companyName, projectName, "Equipment Requests", exportedBy);

  const columns = [
    { header: "Employee", key: "employee", width: 24 },
    { header: "Item", key: "item", width: 26 },
    { header: "Specification", key: "specification", width: 16 },
    { header: "Quantity", key: "quantity", width: 10 },
    { header: "Reason", key: "reason", width: 30 },
    { header: "Status", key: "status", width: 14 },
    { header: "Requested At", key: "requestedAt", width: 18 },
    { header: "Decided At", key: "decidedAt", width: 18 },
  ];
  sheet.columns = columns;
  const headerRow = sheet.getRow(5);
  columns.forEach((column, index) => (headerRow.getCell(index + 1).value = column.header));
  styleHeaderRow(sheet, 5);

  for (const request of requests) {
    sheet.addRow({
      employee: `${request.employee.first_name} ${request.employee.last_name}`,
      item: request.item_description,
      specification: request.specification ?? "",
      quantity: request.quantity,
      reason: request.reason,
      status: EQUIPMENT_REQUEST_STATUS_LABELS[request.status],
      requestedAt: new Date(request.created_at).toISOString().slice(0, 16).replace("T", " "),
      decidedAt: request.decided_at ? new Date(request.decided_at).toISOString().slice(0, 16).replace("T", " ") : "",
    });
  }

  return workbook.xlsx.writeBuffer();
}

/** Item 17 — History export, for ONE item (history is item-scoped, see modules/equipment's design doc comment). */
export async function buildEquipmentHistoryWorkbook(companyId: string, itemId: string, itemName: string, companyName: string, projectName: string, exportedBy?: string): Promise<ExcelJS.Buffer> {
  const entries = await listEquipmentHistory(companyId, itemId);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HSEQ Platform";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Equipment History", { views: [{ state: "frozen", ySplit: 5 }] });
  addTitleBlock(sheet, companyName, projectName, `History — ${itemName}`, exportedBy);

  const columns = [
    { header: "Date", key: "date", width: 18 },
    { header: "Event", key: "event", width: 20 },
    { header: "Employee", key: "employee", width: 24 },
    { header: "Quantity", key: "quantity", width: 10 },
    { header: "From", key: "from", width: 16 },
    { header: "To", key: "to", width: 16 },
    { header: "Note", key: "note", width: 30 },
  ];
  sheet.columns = columns;
  const headerRow = sheet.getRow(5);
  columns.forEach((column, index) => (headerRow.getCell(index + 1).value = column.header));
  styleHeaderRow(sheet, 5);

  for (const entry of entries) {
    sheet.addRow({
      date: new Date(entry.created_at).toISOString().slice(0, 16).replace("T", " "),
      event: EQUIPMENT_HISTORY_EVENT_LABELS[entry.event],
      employee: entry.employee ? `${entry.employee.first_name} ${entry.employee.last_name}` : "",
      quantity: entry.quantity ?? "",
      from: entry.from_status ?? "",
      to: entry.to_status ?? "",
      note: entry.note ?? "",
    });
  }

  return workbook.xlsx.writeBuffer();
}
