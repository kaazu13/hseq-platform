import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, asUser, createTestCompany, deleteTestCompany, createTestUser, deleteTestUser, addMembership, createTestEmployee, createTestProject } from "./helpers";

/**
 * Absence/leave decision notifications (items 11/12) — covers
 * supabase/migrations/20260826090000_copy_teams_and_notifications.sql's
 * additions to confirm_absence_report()/reject_absence_report()/
 * cancel_leave_request(): a real, previously-nonexistent gap (both absence
 * decisions wrote zero notification rows before this migration; leave
 * approve/deny/return already notified — only cancel was missing).
 */
describe("absence/leave decision notifications", () => {
  let company: Awaited<ReturnType<typeof createTestCompany>>;
  let admin: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    company = await createTestCompany("absence-leave-notify");
    admin = await createTestUser("Absence Leave Admin");
    await addMembership(company.companyId, admin.userId, ["company_admin"]);
  });

  afterAll(async () => {
    await deleteTestCompany(company.companyId);
    await deleteTestUser(admin.userId);
    await sql.end();
  });

  async function rosterEmployee(projectId: string, label: string) {
    const person = await createTestUser(`Absence ${label}`);
    await addMembership(company.companyId, person.userId, ["employee"]);
    const employeeId = await createTestEmployee(company.companyId, person.userId, "Absence", label);
    await sql`insert into project_assignments (company_id, project_id, employee_id, assignment_role) values (${company.companyId}, ${projectId}, ${employeeId}, 'member')`;
    return { userId: person.userId, employeeId };
  }

  it("confirm_absence_report notifies the reporting employee with the resulting attendance status", async () => {
    const projectId = await createTestProject(company.companyId, "Confirm Absence Project");
    const employee = await rosterEmployee(projectId, "Confirmed");
    const workDate = "2026-08-20";

    const [report] = await asUser(employee.userId, (tx) => tx`select * from report_absence(${projectId}, ${employee.employeeId}, ${workDate}, 'sick', 'not feeling well')`);
    await asUser(admin.userId, (tx) => tx`select * from confirm_absence_report(${report.id})`);

    const notifications = await sql`select type, title, body from notifications where recipient_user_id = ${employee.userId} and type = 'absence_report_confirmed'`;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe("Absence approved");
    expect(notifications[0].body).toContain("sick");
    expect(notifications[0].body).toContain("20 Aug 2026");

    await deleteTestUser(employee.userId);
  });

  it("reject_absence_report notifies the reporting employee, including the review note", async () => {
    const projectId = await createTestProject(company.companyId, "Reject Absence Project");
    const employee = await rosterEmployee(projectId, "Rejected");
    const workDate = "2026-08-21";

    const [report] = await asUser(employee.userId, (tx) => tx`select * from report_absence(${projectId}, ${employee.employeeId}, ${workDate}, 'personal')`);
    await asUser(admin.userId, (tx) => tx`select * from reject_absence_report(${report.id}, 'Not enough notice given')`);

    const notifications = await sql`select type, title, body from notifications where recipient_user_id = ${employee.userId} and type = 'absence_report_rejected'`;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe("Absence request rejected");
    expect(notifications[0].body).toContain("Not enough notice given");

    await deleteTestUser(employee.userId);
  });

  it("cancel_leave_request notifies the employee when a MANAGER cancels their approved leave", async () => {
    const projectId = await createTestProject(company.companyId, "Manager Cancel Leave Project");
    const employee = await rosterEmployee(projectId, "ManagerCancelled");

    const [request] = await asUser(employee.userId, (tx) => tx`
      insert into leave_requests (company_id, project_id, employee_id, leave_type, start_date, end_date)
      values (${company.companyId}, ${projectId}, ${employee.employeeId}, 'annual', '2026-09-01', '2026-09-03')
      returning *
    `);
    await asUser(admin.userId, (tx) => tx`select * from approve_leave_request(${request.id})`);

    await asUser(admin.userId, (tx) => tx`select * from cancel_leave_request(${request.id})`);

    const notifications = await sql`select type, title from notifications where recipient_user_id = ${employee.userId} and type = 'leave_request_cancelled'`;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe("Leave request cancelled");

    await deleteTestUser(employee.userId);
  });

  it("cancel_leave_request does NOT notify when the employee cancels their own request — not news to the person who just did it", async () => {
    const projectId = await createTestProject(company.companyId, "Self Cancel Leave Project");
    const employee = await rosterEmployee(projectId, "SelfCancelled");

    const [request] = await asUser(employee.userId, (tx) => tx`
      insert into leave_requests (company_id, project_id, employee_id, leave_type, start_date, end_date)
      values (${company.companyId}, ${projectId}, ${employee.employeeId}, 'annual', '2026-09-10', '2026-09-12')
      returning *
    `);
    await asUser(employee.userId, (tx) => tx`select * from cancel_leave_request(${request.id})`);

    const notifications = await sql`select id from notifications where recipient_user_id = ${employee.userId} and type = 'leave_request_cancelled'`;
    expect(notifications).toHaveLength(0);

    await deleteTestUser(employee.userId);
  });
});
