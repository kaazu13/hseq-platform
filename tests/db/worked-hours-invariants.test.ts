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

  it("resolving a discrepancy ALWAYS notifies the reporting employee — both accepted and rejected, even with no resulting hours change (Product Integration Phase 6)", async () => {
    const projectId = await createTestProject(companyA.companyId, "Discrepancy Notification Project");
    const employeeUser = await createTestUser("Notify Discrepancy Employee");
    await addMembership(companyA.companyId, employeeUser.userId, ["employee"]);
    const employeeId = await createTestEmployee(companyA.companyId, employeeUser.userId, "Notify", "Employee");
    const workDate = "2026-08-11";

    const [worked] = await asUser(admin.userId, (tx) => tx`select * from upsert_worked_hours(${projectId}, ${employeeId}, ${workDate}, 8)`);
    await asUser(admin.userId, (tx) => tx`select * from submit_worked_hours(${projectId}, ${workDate})`);

    // Case 1: rejected, no hours change at all — previously produced ZERO notification.
    const [rejectedDiscrepancy] = await asUser(employeeUser.userId, (tx) => tx`select * from report_worked_hours_discrepancy(${worked.id}, 'I think this is wrong')`);
    await asUser(admin.userId, (tx) => tx`select * from resolve_worked_hours_discrepancy(${rejectedDiscrepancy.id}, 'rejected', 'Confirmed correct with foreman', null)`);

    const rejectedNotifications = await sql`select type, title, body from notifications where recipient_user_id = ${employeeUser.userId} and type = 'worked_hours_discrepancy_resolved'`;
    expect(rejectedNotifications).toHaveLength(1);
    expect(rejectedNotifications[0].title).toBe("Discrepancy report rejected");
    expect(rejectedNotifications[0].body).toBe("Confirmed correct with foreman");

    // Case 2: accepted WITH a resulting hours change — gets BOTH the existing
    // 'worked_hours_corrected' notification (from upsert_worked_hours' own
    // correction path) AND the new 'worked_hours_discrepancy_resolved' one —
    // two distinct facts, not a duplicate.
    const [secondDiscrepancy] = await asUser(employeeUser.userId, (tx) => tx`select * from report_worked_hours_discrepancy(${worked.id}, 'Actually worked 9 hours')`);
    await asUser(admin.userId, (tx) => tx`select * from resolve_worked_hours_discrepancy(${secondDiscrepancy.id}, 'accepted', 'Confirmed with foreman', 9)`);

    const allNotifications = await sql`select type from notifications where recipient_user_id = ${employeeUser.userId} order by created_at`;
    expect(allNotifications.map((n) => n.type)).toEqual(["worked_hours_discrepancy_resolved", "worked_hours_corrected", "worked_hours_discrepancy_resolved"]);

    await deleteTestUser(employeeUser.userId);
  });

  it("notification recipient isolation: one employee cannot see or mark-read another employee's notification", async () => {
    const projectId = await createTestProject(companyA.companyId, "Notification Isolation Project");
    const employeeUserA = await createTestUser("Notification Employee A");
    const employeeUserB = await createTestUser("Notification Employee B");
    await addMembership(companyA.companyId, employeeUserA.userId, ["employee"]);
    await addMembership(companyA.companyId, employeeUserB.userId, ["employee"]);
    const employeeIdA = await createTestEmployee(companyA.companyId, employeeUserA.userId, "Notify", "A");
    const workDate = "2026-08-11";

    await asUser(admin.userId, (tx) => tx`select * from upsert_worked_hours(${projectId}, ${employeeIdA}, ${workDate}, 8)`);
    await asUser(admin.userId, (tx) => tx`select * from submit_worked_hours(${projectId}, ${workDate})`);
    await asUser(admin.userId, (tx) => tx`select * from upsert_worked_hours(${projectId}, ${employeeIdA}, ${workDate}, 6, null, 'Correction to test notification isolation')`);

    const [notification] = await sql`select id from notifications where recipient_user_id = ${employeeUserA.userId} and type = 'worked_hours_corrected'`;
    expect(notification).toBeTruthy();

    // Employee B cannot see Employee A's notification at all via RLS.
    const bVisible = await asUser(employeeUserB.userId, (tx) => tx`select id from notifications where id = ${notification.id}`);
    expect(bVisible).toHaveLength(0);

    // Employee B attempting to mark Employee A's notification read is a
    // silent no-op (RLS excludes the row from the UPDATE, same "unmatched
    // UPDATE by id" semantics as worked_hours_discrepancies_update above) —
    // never actually flips read_at.
    await asUser(employeeUserB.userId, (tx) => tx`update notifications set read_at = now() where id = ${notification.id}`);
    const [stillUnread] = await sql`select read_at from notifications where id = ${notification.id}`;
    expect(stillUnread.read_at).toBeNull();

    // Employee A CAN see and mark-read their own notification.
    const aVisible = await asUser(employeeUserA.userId, (tx) => tx`select id from notifications where id = ${notification.id}`);
    expect(aVisible).toHaveLength(1);
    await asUser(employeeUserA.userId, (tx) => tx`update notifications set read_at = now() where id = ${notification.id}`);
    const [nowRead] = await sql`select read_at from notifications where id = ${notification.id}`;
    expect(nowRead.read_at).not.toBeNull();

    await deleteTestUser(employeeUserA.userId);
    await deleteTestUser(employeeUserB.userId);
  });
});
