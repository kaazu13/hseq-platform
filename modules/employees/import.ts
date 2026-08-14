import ExcelJS from "exceljs";

/**
 * Bulk employee import — items 9/10. Server-only: parses an uploaded
 * `.xlsx` workbook, validates every row, and produces a preview the caller
 * shows BEFORE anything is committed (item 9's explicit "preview, do not
 * commit immediately" requirement). Actual row insertion happens via the
 * `import_employees_bulk` RPC (modules/employees/actions.ts's
 * `commitEmployeeImport`) — this module never writes to the database.
 *
 * Treats the workbook as untrusted input throughout (item 10):
 *  - `.xlsx` MIME/extension only, size-capped, row-capped.
 *  - exceljs never EXECUTES a formula (it has no formula engine at all —
 *    it can only read the cached result Excel itself last wrote) but a
 *    formula cell's cached result is still attacker-influenced spreadsheet
 *    content, not a value a human actually typed — every formula cell is
 *    therefore treated as an ERROR for that row, never silently accepted.
 *  - Every string value is trimmed/normalized; nothing here ever
 *    interprets a cell as a company/project/role ID — role names are
 *    matched against the REAL roles catalogue (`allRoles`, passed in) by
 *    display label or name, case-insensitively, and rejected if no match
 *    is found. Employee numbers are never taken from the sheet at all —
 *    `import_employees_bulk` always allocates a real one via
 *    `next_employee_number`, the same sequence every other
 *    employee-creating path in this codebase uses (never a client-
 *    supplied identifier).
 */

export const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMPORT_ROWS = 5000;
export const MAX_CELL_LENGTH = 500;

export type ImportRow = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  positionTitle: string | null;
  roleName: string | null;
};

export type ImportRowError = { rowNumber: number; message: string };

export type ImportPreview = {
  validRows: ImportRow[];
  errors: ImportRowError[];
  totalRows: number;
};

const HEADER_ALIASES: Record<string, string> = {
  "full name": "fullName",
  name: "fullName",
  email: "email",
  "email address": "email",
  phone: "phone",
  "phone number": "phone",
  "employee number": "employeeNumber",
  role: "role",
  "position title": "positionTitle",
  position: "positionTitle",
  title: "positionTitle",
};

function normalizeHeader(raw: unknown): string | null {
  const text = String(raw ?? "").trim().toLowerCase();
  return HEADER_ALIASES[text] ?? null;
}

/** Rejects a formula cell outright (its cached result is spreadsheet-computed content, never treated as if a human typed it) — everything else is coerced to a trimmed string. */
function cellToText(cell: ExcelJS.Cell): { text: string; isFormula: boolean } {
  const value = cell.value;
  if (value === null || value === undefined) return { text: "", isFormula: false };
  if (typeof value === "object" && "formula" in value) return { text: "", isFormula: true };
  if (typeof value === "object" && "richText" in value) {
    return { text: (value.richText ?? []).map((part: { text: string }) => part.text).join(""), isFormula: false };
  }
  if (typeof value === "object" && "text" in value) return { text: String((value as { text: unknown }).text ?? ""), isFormula: false };
  if (value instanceof Date) return { text: value.toISOString().slice(0, 10), isFormula: false };
  return { text: String(value).trim(), isFormula: false };
}

export type ParseResult = { ok: true; preview: ImportPreview } | { ok: false; message: string };

export async function parseEmployeeImportWorkbook(buffer: ArrayBuffer, knownRoles: { name: string; display_label: string }[]): Promise<ParseResult> {
  const roleByLabel = new Map<string, string>();
  for (const role of knownRoles) {
    roleByLabel.set(role.name.toLowerCase(), role.name);
    roleByLabel.set(role.display_label.toLowerCase(), role.name);
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return { ok: false, message: "This file isn't a valid .xlsx workbook." };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { ok: false, message: "The workbook has no sheets." };
  }

  const headerRow = sheet.getRow(1);
  const columnByIndex = new Map<number, string>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const mapped = normalizeHeader(cell.value);
    if (mapped) columnByIndex.set(colNumber, mapped);
  });
  if (![...columnByIndex.values()].includes("fullName")) {
    return { ok: false, message: 'The workbook is missing a "Full Name" column.' };
  }

  const dataRowCount = sheet.rowCount - 1;
  if (dataRowCount > MAX_IMPORT_ROWS) {
    return { ok: false, message: `This workbook has ${dataRowCount} rows — a single import is limited to ${MAX_IMPORT_ROWS}.` };
  }

  const validRows: ImportRow[] = [];
  const errors: ImportRowError[] = [];
  const seenEmails = new Set<string>();
  let totalRows = 0;

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0 || row.values === undefined || (Array.isArray(row.values) && row.values.filter(Boolean).length === 0)) continue;
    totalRows++;

    const fields: Record<string, string> = {};
    let hasFormula = false;
    for (const [colIndex, field] of columnByIndex) {
      const { text, isFormula } = cellToText(row.getCell(colIndex));
      if (isFormula) hasFormula = true;
      fields[field] = text.slice(0, MAX_CELL_LENGTH);
    }

    if (hasFormula) {
      errors.push({ rowNumber, message: "Formula cells are not accepted — enter values directly." });
      continue;
    }

    const fullName = (fields.fullName ?? "").trim();
    if (!fullName) {
      errors.push({ rowNumber, message: "Full Name is required." });
      continue;
    }
    const nameParts = fullName.split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : nameParts[0];

    const rawEmail = (fields.email ?? "").trim().toLowerCase();
    let email: string | null = null;
    if (rawEmail) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail)) {
        errors.push({ rowNumber, message: `Invalid email address "${rawEmail}".` });
        continue;
      }
      if (seenEmails.has(rawEmail)) {
        errors.push({ rowNumber, message: `Duplicate email "${rawEmail}" within this file.` });
        continue;
      }
      seenEmails.add(rawEmail);
      email = rawEmail;
    }

    const rawRole = (fields.role ?? "").trim();
    let roleName: string | null = null;
    if (rawRole) {
      const matched = roleByLabel.get(rawRole.toLowerCase());
      if (!matched) {
        errors.push({ rowNumber, message: `Unknown role "${rawRole}".` });
        continue;
      }
      if (matched === "platform_super_admin") {
        errors.push({ rowNumber, message: "platform_super_admin cannot be assigned via import." });
        continue;
      }
      roleName = matched;
    }

    validRows.push({
      firstName,
      lastName,
      email,
      phone: fields.phone?.trim() || null,
      positionTitle: fields.positionTitle?.trim() || null,
      roleName,
    });
  }

  return { ok: true, preview: { validRows, errors, totalRows } };
}
