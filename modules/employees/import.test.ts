import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseEmployeeImportWorkbook } from "./import";

const KNOWN_ROLES = [
  { name: "employee", display_label: "Employee" },
  { name: "foreman", display_label: "Foreman" },
  { name: "company_admin", display_label: "Company Manager" },
  { name: "platform_super_admin", display_label: "Platform Super Admin" },
];

async function buildWorkbook(headers: string[], rows: (string | number | { formula: string; result?: unknown })[][]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Employees");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

describe("parseEmployeeImportWorkbook", () => {
  it("parses valid rows with full name split, email, phone, and a matched role label", async () => {
    const buffer = await buildWorkbook(
      ["Full Name", "Email", "Phone", "Role"],
      [["Karl Andersson", "karl@example.com", "+46701234567", "Foreman"]],
    );
    const result = await parseEmployeeImportWorkbook(buffer, KNOWN_ROLES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.errors).toHaveLength(0);
    expect(result.preview.validRows).toEqual([
      { firstName: "Karl", lastName: "Andersson", email: "karl@example.com", phone: "+46701234567", positionTitle: null, roleName: "foreman" },
    ]);
  });

  it("matches a role by its DISPLAY LABEL (not just the raw enum name), case-insensitively", async () => {
    const buffer = await buildWorkbook(["Full Name", "Role"], [["Erik Lindqvist", "company manager"]]);
    const result = await parseEmployeeImportWorkbook(buffer, KNOWN_ROLES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.validRows[0]?.roleName).toBe("company_admin");
  });

  it("rejects an unknown role as a row error, not a silent skip", async () => {
    const buffer = await buildWorkbook(["Full Name", "Role"], [["Someone Unknown", "Scaffolder Boss"]]);
    const result = await parseEmployeeImportWorkbook(buffer, KNOWN_ROLES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.validRows).toHaveLength(0);
    expect(result.preview.errors[0]?.message).toContain("Unknown role");
  });

  it("rejects platform_super_admin even if it were somehow typed in a role cell", async () => {
    const buffer = await buildWorkbook(["Full Name", "Role"], [["Someone", "Platform Super Admin"]]);
    const result = await parseEmployeeImportWorkbook(buffer, KNOWN_ROLES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.validRows).toHaveLength(0);
    expect(result.preview.errors[0]?.message).toContain("platform_super_admin cannot be assigned");
  });

  it("rejects a row with no Full Name", async () => {
    const buffer = await buildWorkbook(["Full Name", "Email"], [["", "someone@example.com"]]);
    const result = await parseEmployeeImportWorkbook(buffer, KNOWN_ROLES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.errors[0]?.message).toContain("Full Name is required");
  });

  it("rejects an invalid email address", async () => {
    const buffer = await buildWorkbook(["Full Name", "Email"], [["Someone Person", "not-an-email"]]);
    const result = await parseEmployeeImportWorkbook(buffer, KNOWN_ROLES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.errors[0]?.message).toContain("Invalid email");
  });

  it("flags a duplicate email WITHIN the same file as a row error", async () => {
    const buffer = await buildWorkbook(
      ["Full Name", "Email"],
      [
        ["Person One", "dup@example.com"],
        ["Person Two", "dup@example.com"],
      ],
    );
    const result = await parseEmployeeImportWorkbook(buffer, KNOWN_ROLES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.validRows).toHaveLength(1);
    expect(result.preview.errors[0]?.message).toContain("Duplicate email");
  });

  it("never accepts a formula cell — it never executes it and always errors that row instead of trusting the cached result", async () => {
    const buffer = await buildWorkbook(["Full Name", "Phone"], [[{ formula: "=1+1", result: "Evil Formula Name" }, "123"]]);
    const result = await parseEmployeeImportWorkbook(buffer, KNOWN_ROLES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.validRows).toHaveLength(0);
    expect(result.preview.errors[0]?.message).toContain("Formula cells");
  });

  it("rejects a workbook missing the required Full Name column", async () => {
    const buffer = await buildWorkbook(["Email", "Phone"], [["someone@example.com", "123"]]);
    const result = await parseEmployeeImportWorkbook(buffer, KNOWN_ROLES);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Full Name");
  });

  it("rejects a malformed (non-xlsx) buffer instead of throwing", async () => {
    const bogus = new TextEncoder().encode("this is not a spreadsheet").buffer;
    const result = await parseEmployeeImportWorkbook(bogus, KNOWN_ROLES);
    expect(result.ok).toBe(false);
  });

  it("treats a row with no role/email as valid — role/email are optional, only Full Name is required", async () => {
    const buffer = await buildWorkbook(["Full Name"], [["No Login Ever"]]);
    const result = await parseEmployeeImportWorkbook(buffer, KNOWN_ROLES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.validRows).toEqual([{ firstName: "No", lastName: "Login Ever", email: null, phone: null, positionTitle: null, roleName: null }]);
  });

  it("skips fully blank rows without counting them as errors or valid rows", async () => {
    const buffer = await buildWorkbook(["Full Name"], [["Real Person"], [], ["Another Person"]]);
    const result = await parseEmployeeImportWorkbook(buffer, KNOWN_ROLES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.validRows).toHaveLength(2);
    expect(result.preview.errors).toHaveLength(0);
  });
});
