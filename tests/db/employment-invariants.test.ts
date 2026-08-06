import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  sql,
  asUser,
  createTestCompany,
  deleteTestCompany,
  createTestUser,
  deleteTestUser,
  addMembership,
  createTestEmployee,
  roleId,
  UNIQUE_VIOLATION,
  RAISED_EXCEPTION,
  CHECK_VIOLATION,
} from "./helpers";

/**
 * Priority 1.3 — Employment invariants. Covers
 * supabase/migrations/20260727090000_employment_periods.sql's guard
 * triggers directly — employee_employment_periods is the single source of
 * truth for employment state; employees.employment_status/start_date/
 * end_date are a derived, trigger-synced snapshot (never written directly
 * — see that migration's header comment).
 */
describe("employment invariants", () => {
  let company: Awaited<ReturnType<typeof createTestCompany>>;
  let admin: Awaited<ReturnType<typeof createTestUser>>; // company_admin — the only role that can write employment_periods

  beforeAll(async () => {
    company = await createTestCompany("employment");
    admin = await createTestUser("Employment Admin");
    await addMembership(company.companyId, admin.userId, ["company_admin"]);
  });

  afterAll(async () => {
    await deleteTestCompany(company.companyId);
    await deleteTestUser(admin.userId);
    await sql.end();
  });

  it("a new employee gets exactly one OPEN period, and employment_status is 'active'", async () => {
    const employeeId = await createTestEmployee(company.companyId, null, "Fresh", "Hire");
    const periods = await sql`select id, end_date from employee_employment_periods where employee_id = ${employeeId}`;
    expect(periods).toHaveLength(1);
    expect(periods[0].end_date).toBeNull();

    const [employee] = await sql`select employment_status from employees where id = ${employeeId}`;
    expect(employee.employment_status).toBe("active");
  });

  it("only one active (open) employment period — a second open period is rejected", async () => {
    const employeeId = await createTestEmployee(company.companyId, null, "One", "Period");
    await expect(
      asUser(admin.userId, (tx) =>
        tx`insert into employee_employment_periods (company_id, employee_id, start_date) values (${company.companyId}, ${employeeId}, current_date)`,
      ),
    ).rejects.toMatchObject(UNIQUE_VIOLATION);
  });

  it("end employment works: closing the open period sets employment_status to 'terminated'", async () => {
    const employeeId = await createTestEmployee(company.companyId, null, "To End", "Employment");
    const [period] = await sql`select id from employee_employment_periods where employee_id = ${employeeId} and end_date is null`;

    const rows = await asUser(admin.userId, (tx) =>
      tx`update employee_employment_periods set end_date = current_date, end_reason = 'resigned' where id = ${period.id} returning id`,
    );
    expect(rows).toHaveLength(1);

    const [employee] = await sql`select employment_status, end_date from employees where id = ${employeeId}`;
    expect(employee.employment_status).toBe("terminated");
    expect(employee.end_date).not.toBeNull();
  });

  it("rehire opens a valid new employment period and restores employment_status to 'active'", async () => {
    const employeeId = await createTestEmployee(company.companyId, null, "Re", "Hired");
    const [period] = await sql`select id from employee_employment_periods where employee_id = ${employeeId} and end_date is null`;
    const endDate = "2026-01-01";
    await asUser(admin.userId, (tx) =>
      tx`update employee_employment_periods set end_date = ${endDate}, end_reason = 'layoff' where id = ${period.id}`,
    );

    const rehireStart = "2026-02-01"; // strictly after endDate — legal
    const rows = await asUser(admin.userId, (tx) =>
      tx`insert into employee_employment_periods (company_id, employee_id, start_date) values (${company.companyId}, ${employeeId}, ${rehireStart}) returning id`,
    );
    expect(rows).toHaveLength(1);

    const [employee] = await sql`select employment_status, start_date, end_date from employees where id = ${employeeId}`;
    expect(employee.employment_status).toBe("active");
    expect(employee.end_date).toBeNull();
  });

  it("employment periods cannot overlap — a new period starting at or before the prior close date is rejected", async () => {
    const employeeId = await createTestEmployee(company.companyId, null, "Overlap", "Test");
    const [period] = await sql`select id from employee_employment_periods where employee_id = ${employeeId} and end_date is null`;
    const endDate = "2026-03-01";
    await asUser(admin.userId, (tx) =>
      tx`update employee_employment_periods set end_date = ${endDate}, end_reason = 'resigned' where id = ${period.id}`,
    );

    // start_date === prior end_date is rejected (rule is strictly-after: new.start_date <= v_latest_end fails)
    await expect(
      asUser(admin.userId, (tx) =>
        tx`insert into employee_employment_periods (company_id, employee_id, start_date) values (${company.companyId}, ${employeeId}, ${endDate})`,
      ),
    ).rejects.toMatchObject(RAISED_EXCEPTION);

    // start_date before the prior end_date is rejected too
    await expect(
      asUser(admin.userId, (tx) =>
        tx`insert into employee_employment_periods (company_id, employee_id, start_date) values (${company.companyId}, ${employeeId}, '2026-01-01')`,
      ),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("invalid date transitions fail: end_date before start_date is rejected by the CHECK constraint", async () => {
    const employeeId = await createTestEmployee(company.companyId, null, "Bad", "Dates");
    const [period] = await sql`select id, start_date from employee_employment_periods where employee_id = ${employeeId} and end_date is null`;
    await expect(
      asUser(admin.userId, (tx) =>
        tx`update employee_employment_periods set end_date = '2000-01-01', end_reason = 'other' where id = ${period.id}`,
      ),
    ).rejects.toMatchObject(CHECK_VIOLATION);
  });

  it("invalid date transitions fail: closing a period without end_reason is rejected", async () => {
    const employeeId = await createTestEmployee(company.companyId, null, "No", "Reason");
    const [period] = await sql`select id from employee_employment_periods where employee_id = ${employeeId} and end_date is null`;
    await expect(
      asUser(admin.userId, (tx) => tx`update employee_employment_periods set end_date = current_date where id = ${period.id}`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("invalid date transitions fail: a closed period can never be modified again", async () => {
    const employeeId = await createTestEmployee(company.companyId, null, "Closed", "Immutable");
    const [period] = await sql`select id from employee_employment_periods where employee_id = ${employeeId} and end_date is null`;
    await asUser(admin.userId, (tx) =>
      tx`update employee_employment_periods set end_date = current_date, end_reason = 'other' where id = ${period.id}`,
    );
    await expect(
      asUser(admin.userId, (tx) => tx`update employee_employment_periods set end_note = 'trying to edit a closed row' where id = ${period.id}`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("employee numbers cannot be changed once assigned", async () => {
    const employeeId = await createTestEmployee(company.companyId, null, "Immutable", "Number");
    await expect(
      asUser(admin.userId, (tx) => tx`update employees set employee_number = 'CHANGED-001' where id = ${employeeId}`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("the one-open-period invariant holds even for an employee who also holds an elevated company role", async () => {
    const roleBearer = await createTestUser("Foreman With Employment");
    const foremanRoleId = await roleId("foreman");
    const membershipId = await addMembership(company.companyId, roleBearer.userId, []);
    await sql`insert into membership_roles (company_id, membership_id, role_id) values (${company.companyId}, ${membershipId}, ${foremanRoleId})`;
    const employeeId = await createTestEmployee(company.companyId, roleBearer.userId, "Foreman", "Employee");

    await expect(
      asUser(admin.userId, (tx) =>
        tx`insert into employee_employment_periods (company_id, employee_id, start_date) values (${company.companyId}, ${employeeId}, current_date)`,
      ),
    ).rejects.toMatchObject(UNIQUE_VIOLATION);

    await deleteTestUser(roleBearer.userId);
  });
});
