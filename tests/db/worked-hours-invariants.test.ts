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
  createTestProject,
  FK_VIOLATION,
  RAISED_EXCEPTION,
  RLS_VIOLATION,
} from "./helpers";

/**
 * Worked Hours invariants — covers
 * supabase/migrations/20260813090000_worked_hours.sql's RPCs and RLS
 * directly: bulk-apply never overwrites already-submitted hours,
 * correcting a submitted row requires a reason and is recorded in
 * worked_hours_corrections, employees can only view their own hours (and
 * have no direct write path at all), and the discrepancy report/resolve
 * workflow.
 */
describe("worked hours invariants", () => {
  let companyA: Awaited<ReturnType<typeof createTestCompany>>;
  let companyB: Awaited<ReturnType<typeof createTestCompany>>;
  let admin: Awaited<ReturnType<typeof createTestUser>>; // company_admin in Company A

  beforeAll(async () => {
    companyA = await createTestCompany("worked-hours-a");
    companyB = await createTestCompany("worked-hours-b");
    admin = await createTestUser("Worked Hours Admin");
    await addMembership(companyA.companyId, admin.userId, ["company_admin"]);
  });

  afterAll(async () => {
    await deleteTestCompany(companyA.companyId);
    await deleteTestCompany(companyB.companyId);
    await deleteTestUser(admin.userId);
    await sql.end();
  });

  it("bulk_apply_worked_hours creates draft rows for every listed employee", async () => {
    const projectId = await createTestProject(companyA.companyId, "Bulk Apply Project");
    const employeeOne = await createTestEmployee(companyA.companyId, null, "Bulk", "One");
    const employeeTwo = await createTestEmployee(companyA.companyId, null, "Bulk", "Two");
    const workDate = "2026-08-10";

    const rows = await asUser(admin.userId, (tx) => tx`select * from bulk_apply_worked_hours(${projectId}, ${workDate}, 8, ${[employeeOne, employeeTwo]})`);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(Number(row.hours)).toBe(8);
      expect(row.status).toBe("draft");
    }
  });

  it("bulk_apply_worked_hours never overwrites an already-submitted row", async () => {
    const projectId = await createTestProject(companyA.companyId, "Bulk Skip Submitted Project");
    const employeeId = await createTestEmployee(companyA.companyId, null, "Skip", "Submitted");
    const workDate = "2026-08-10";

    await asUser(admin.userId, (tx) => tx`select * from bulk_apply_worked_hours(${projectId}, ${workDate}, 8, ${[employeeId]})`);
    await asUser(admin.userId, (tx) => tx`select * from submit_worked_hours(${projectId}, ${workDate})`);

    await asUser(admin.userId, (tx) => tx`select * from bulk_apply_worked_hours(${projectId}, ${workDate}, 5, ${[employeeId]})`);

    const [row] = await sql`select hours, status from worked_hours where project_id = ${projectId} and employee_id = ${employeeId} and work_date = ${workDate}`;
    expect(Number(row.hours)).toBe(8); // untouched by the bulk re-apply
    expect(row.status).toBe("submitted");
  });

  it("correcting an already-submitted worked_hours row requires a reason", async () => {
    const projectId = await createTestProject(companyA.companyId, "Correction Reason Project");
    const employeeId = await createTestEmployee(companyA.companyId, null, "Needs", "Reason");
    const workDate = "2026-08-10";

    await asUser(admin.userId, (tx) => tx`select * from upsert_worked_hours(${projectId}, ${employeeId}, ${workDate}, 8)`);
    await asUser(admin.userId, (tx) => tx`select * from submit_worked_hours(${projectId}, ${workDate})`);

    await expect(
      asUser(admin.userId, (tx) => tx`select * from upsert_worked_hours(${projectId}, ${employeeId}, ${workDate}, 6)`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("a free draft edit does NOT write a correction row, but correcting a submitted row does — with previous/new/reason/changed_by preserved", async () => {
    const projectId = await createTestProject(companyA.companyId, "Correction History Project");
    const employeeId = await createTestEmployee(companyA.companyId, null, "Correction", "History");
    const workDate = "2026-08-10";

    await asUser(admin.userId, (tx) => tx`select * from upsert_worked_hours(${projectId}, ${employeeId}, ${workDate}, 8)`);
    await asUser(admin.userId, (tx) => tx`select * from upsert_worked_hours(${projectId}, ${employeeId}, ${workDate}, 7.5)`); // still draft — free edit

    const [worked] = await sql`select id, hours from worked_hours where project_id = ${projectId} and employee_id = ${employeeId} and work_date = ${workDate}`;
    expect(Number(worked.hours)).toBe(7.5);
    const draftCorrections = await sql`select id from worked_hours_corrections where worked_hours_id = ${worked.id}`;
    expect(draftCorrections).toHaveLength(0);

    await asUser(admin.userId, (tx) => tx`select * from submit_worked_hours(${projectId}, ${workDate})`);
    await asUser(admin.userId, (tx) => tx`select * from upsert_worked_hours(${projectId}, ${employeeId}, ${workDate}, 6, null, 'Employee left 1.5h early')`);

    const corrections = await sql`select previous_hours, new_hours, reason, changed_by from worked_hours_corrections where worked_hours_id = ${worked.id}`;
    expect(corrections).toHaveLength(1);
    expect(Number(corrections[0].previous_hours)).toBe(7.5);
    expect(Number(corrections[0].new_hours)).toBe(6);
    expect(corrections[0].reason).toBe("Employee left 1.5h early");
    expect(corrections[0].changed_by).toBe(admin.userId);

    const [updatedWorked] = await sql`select hours from worked_hours where id = ${worked.id}`;
    expect(Number(updatedWorked.hours)).toBe(6);
  });

  it("an employee sees only their own worked_hours row (RLS), and has no direct write path at all", async () => {
    const projectId = await createTestProject(companyA.companyId, "Own Hours RLS Project");
    const employeeUser = await createTestUser("Own Hours Employee");
    await addMembership(companyA.companyId, employeeUser.userId, ["employee"]);
    const employeeId = await createTestEmployee(companyA.companyId, employeeUser.userId, "Own", "Hours");
    const otherEmployeeId = await createTestEmployee(companyA.companyId, null, "Other", "Hours");
    const workDate = "2026-08-10";

    await asUser(admin.userId, (tx) => tx`select * from upsert_worked_hours(${projectId}, ${employeeId}, ${workDate}, 8)`);
    await asUser(admin.userId, (tx) => tx`select * from upsert_worked_hours(${projectId}, ${otherEmployeeId}, ${workDate}, 8)`);

    const visible = await asUser(employeeUser.userId, (tx) => tx`select employee_id from worked_hours where project_id = ${projectId} and work_date = ${workDate}`);
    expect(visible.map((r) => r.employee_id)).toEqual([employeeId]);

    await expect(
      asUser(employeeUser.userId, (tx) =>
        tx`insert into worked_hours (company_id, project_id, employee_id, work_date, hours) values (${companyA.companyId}, ${projectId}, ${employeeId}, '2026-08-11', 8)`,
      ),
    ).rejects.toMatchObject(RLS_VIOLATION);

    await deleteTestUser(employeeUser.userId);
  });

  it("discrepancy workflow: an employee reports a discrepancy against their own hours, and a PM/Admin can accept it with a correction", async () => {
    const projectId = await createTestProject(companyA.companyId, "Discrepancy Workflow Project");
    const employeeUser = await createTestUser("Discrepancy Employee");
    await addMembership(companyA.companyId, employeeUser.userId, ["employee"]);
    const employeeId = await createTestEmployee(companyA.companyId, employeeUser.userId, "Discrepancy", "Reporter");
    const workDate = "2026-08-10";

    const [worked] = await asUser(admin.userId, (tx) => tx`select * from upsert_worked_hours(${projectId}, ${employeeId}, ${workDate}, 8)`);
    // Submitted first — resolving the discrepancy below applies a
    // correction via upsert_worked_hours()'s own reasoned-correction path,
    // which only records a worked_hours_corrections row when the existing
    // hours were already SUBMITTED (a free draft edit is not a "correction").
    await asUser(admin.userId, (tx) => tx`select * from submit_worked_hours(${projectId}, ${workDate})`);

    const [discrepancy] = await asUser(employeeUser.userId, (tx) => tx`select * from report_worked_hours_discrepancy(${worked.id}, 'I actually worked 9 hours that day')`);
    expect(discrepancy.status).toBe("open");
    expect(discrepancy.reported_by).toBe(employeeUser.userId);

    // The reporting employee cannot resolve their own discrepancy — RLS's
    // USING clause on worked_hours_discrepancies_update silently excludes
    // the row from the UPDATE (no exception; an unmatched UPDATE by id is
    // simply a no-op), so the correct assertion is that the row is left
    // exactly as it was, not that the call throws.
    await asUser(employeeUser.userId, (tx) => tx`select * from resolve_worked_hours_discrepancy(${discrepancy.id}, 'accepted', 'Confirmed with foreman', 9)`);
    const [stillOpen] = await sql`select status, resolved_by from worked_hours_discrepancies where id = ${discrepancy.id}`;
    expect(stillOpen.status).toBe("open");
    expect(stillOpen.resolved_by).toBeNull();

    await expect(
      asUser(admin.userId, (tx) => tx`select * from resolve_worked_hours_discrepancy(${discrepancy.id}, 'accepted', '', 9)`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);

    const [resolved] = await asUser(admin.userId, (tx) => tx`select * from resolve_worked_hours_discrepancy(${discrepancy.id}, 'accepted', 'Confirmed with foreman', 9)`);
    expect(resolved.status).toBe("accepted");
    expect(Number(resolved.resulting_hours)).toBe(9);
    expect(resolved.resolved_by).toBe(admin.userId);

    const [updatedWorked] = await sql`select hours from worked_hours where id = ${worked.id}`;
    expect(Number(updatedWorked.hours)).toBe(9);

    const corrections = await sql`select previous_hours, new_hours from worked_hours_corrections where worked_hours_id = ${worked.id}`;
    expect(corrections).toHaveLength(1);
    expect(Number(corrections[0].new_hours)).toBe(9);

    // The discrepancy row itself is never overwritten — its history (the original comment) is preserved after resolution.
    const [preserved] = await sql`select comment, status from worked_hours_discrepancies where id = ${discrepancy.id}`;
    expect(preserved.comment).toBe("I actually worked 9 hours that day");
    expect(preserved.status).toBe("accepted");

    await deleteTestUser(employeeUser.userId);
  });

  it("cross-company worked_hours rows fail at the database level (composite FK)", async () => {
    const projectInA = await createTestProject(companyA.companyId, "Cross Company Hours Project");
    const employeeInA = await createTestEmployee(companyA.companyId, null, "Cross", "Company");
    await expect(
      sql`insert into worked_hours (company_id, project_id, employee_id, work_date, hours) values (${companyB.companyId}, ${projectInA}, ${employeeInA}, '2026-08-10', 8)`,
    ).rejects.toMatchObject(FK_VIOLATION);
  });
});
