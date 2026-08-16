import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { sql, createTestCompany, deleteTestCompany, addMembership, createTestEmployee, createTestProject, createTestTeam } from "../db/helpers";
import { createIntegrationTestUser, deleteIntegrationTestUser, signInAs, clearTestCookies } from "./helpers";
import { createEmployee, updateEmployee } from "@/modules/employees/actions";
import { setTeamAssignment } from "@/modules/teams/actions";
import { requireProjectAccess } from "@/lib/auth/session";

/**
 * Priority 3 — Server Action integration tests. A small, REPRESENTATIVE
 * set (per the milestone's explicit scope), calling the real exported
 * Server Actions against a real local Supabase instance — not a mock of
 * Supabase. See tests/integration/setup.ts for the minimal Next.js
 * platform-context shim these need to run outside an actual request.
 */
describe("Server Action integration", () => {
  let companyA: Awaited<ReturnType<typeof createTestCompany>>;
  let companyB: Awaited<ReturnType<typeof createTestCompany>>;
  let adminUserId: string;
  let plainEmployeeUserId: string;
  // randomUUID rather than Date.now() — guarantees uniqueness even if this
  // file is ever run twice within the same millisecond (parallel runners,
  // a tight CI retry loop), matching tests/db/helpers.ts's uniqueSuffix().
  const adminEmail = `integration-admin-${randomUUID()}@example.test`;
  const plainEmail = `integration-plain-${randomUUID()}@example.test`;
  const password = "Integration-Test-Only-1!";

  beforeAll(async () => {
    companyA = await createTestCompany("integration-a");
    companyB = await createTestCompany("integration-b");

    adminUserId = await createIntegrationTestUser(adminEmail, password, "Integration Admin");
    plainEmployeeUserId = await createIntegrationTestUser(plainEmail, password, "Integration Plain User");

    await addMembership(companyA.companyId, adminUserId, ["company_admin"]);
    await addMembership(companyA.companyId, plainEmployeeUserId, ["employee"]);
  });

  afterAll(async () => {
    await deleteTestCompany(companyA.companyId);
    await deleteTestCompany(companyB.companyId);
    await deleteIntegrationTestUser(adminUserId);
    await deleteIntegrationTestUser(plainEmployeeUserId);
    await sql.end();
  });

  it("employee happy path: a company_admin creates an employee successfully", async () => {
    await signInAs(adminEmail, password);

    // createEmployee redirects to the new detail page on success — it never
    // returns normally in that case (redirect() throws, per setup.ts's shim,
    // exactly as it does for real in Next.js). That thrown redirect IS the
    // success signal here.
    await expect(
      createEmployee(companyA.companyId, {
        firstName: "Happy",
        lastName: "Path",
        workEmail: undefined,
        phone: undefined,
        positionTitle: undefined,
      }),
    ).rejects.toThrow(/^NEXT_REDIRECT:\/employees\//);

    const [row] = await sql`select id, first_name, last_name from employees where company_id = ${companyA.companyId} and first_name = 'Happy' and last_name = 'Path'`;
    expect(row).toBeDefined();

    clearTestCookies();
  });

  it("unauthorized employee action: a plain employee cannot create an employee", async () => {
    await signInAs(plainEmail, password);

    await expect(
      createEmployee(companyA.companyId, {
        firstName: "Should",
        lastName: "NotExist",
        workEmail: undefined,
        phone: undefined,
        positionTitle: undefined,
      }),
    ).rejects.toThrow("NEXT_FORBIDDEN");

    const rows = await sql`select id from employees where company_id = ${companyA.companyId} and first_name = 'Should' and last_name = 'NotExist'`;
    expect(rows).toHaveLength(0);

    clearTestCookies();
  });

  it("cross-company rejection: updating an employee that belongs to a DIFFERENT company returns not_found, not a leak", async () => {
    const employeeInOrgB = await createTestEmployee(companyB.companyId, null, "Company B", "Employee");

    await signInAs(adminEmail, password); // company_admin of Company A only

    const result = await updateEmployee(companyA.companyId, employeeInOrgB, {
      firstName: "Hacked",
      lastName: "Name",
      workEmail: undefined,
      phone: undefined,
      positionTitle: undefined,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("not_found");
    }

    const [unchanged] = await sql`select first_name from employees where id = ${employeeInOrgB}`;
    expect(unchanged.first_name).toBe("Company B"); // untouched

    clearTestCookies();
  });

  it("project/team assignment invariant: setTeamAssignment moves an employee, closing the old assignment and opening the new one", async () => {
    const projectId = await createTestProject(companyA.companyId, "Integration Move Project");
    const teamAlpha = await createTestTeam(companyA.companyId, projectId, "Integration Alpha");
    const teamBravo = await createTestTeam(companyA.companyId, projectId, "Integration Bravo");
    const employeeId = await createTestEmployee(companyA.companyId, null, "Move", "Via Action");
    await sql`insert into project_assignments (company_id, project_id, employee_id, assignment_role) values (${companyA.companyId}, ${projectId}, ${employeeId}, 'member')`;

    await signInAs(adminEmail, password);

    const placeResult = await setTeamAssignment(companyA.companyId, projectId, teamAlpha, { employeeId, role: "member" });
    expect(placeResult.ok).toBe(true);

    const moveResult = await setTeamAssignment(companyA.companyId, projectId, teamBravo, { employeeId, role: "member" });
    expect(moveResult.ok).toBe(true);

    const rows = await sql`select team_id, end_at from team_assignments where project_id = ${projectId} and employee_id = ${employeeId} order by start_at`;
    expect(rows).toHaveLength(2);
    expect(rows[0].team_id).toBe(teamAlpha);
    expect(rows[0].end_at).not.toBeNull();
    expect(rows[1].team_id).toBe(teamBravo);
    expect(rows[1].end_at).toBeNull();

    clearTestCookies();
  });

  it("requireProjectAccess: a company_admin is never blocked from a project they hold no individual assignment to", async () => {
    // Regression for a real bug found in the full operational audit: every
    // project-scoped page guard calls requireProjectAccess(projectId) bare,
    // which only checks project_assignments/team_assignments — its own
    // docstring always promised a company-wide manager role bypasses this,
    // mirroring every project-scoped RLS policy's `has_any_company_role(...)
    // OR has_project_access(...)` shape, but the implementation never
    // actually did it. A company_admin with zero individual project_assignments
    // or team_assignments rows for a project in their own company got a raw
    // 403 trying to view it (confirmed live on Today's Teams and, per the
    // same shared guard, every other project-scoped page — worked hours,
    // absences, leave, workforce, equipment, scaffolds).
    const projectId = await createTestProject(companyA.companyId, "Unassigned Access Project");
    // Deliberately NO project_assignments/team_assignments row for adminUserId here.

    await signInAs(adminEmail, password); // company_admin of Company A only

    await expect(requireProjectAccess(projectId)).resolves.toEqual({ user: expect.objectContaining({ id: adminUserId }), projectId });

    clearTestCookies();
  });

  it("requireProjectAccess: a plain employee with no assignment and no company-wide role is still rejected", async () => {
    const projectId = await createTestProject(companyA.companyId, "Still Rejected Project");

    await signInAs(plainEmail, password); // plain 'employee' role only, no assignment to this project

    await expect(requireProjectAccess(projectId)).rejects.toThrow("NEXT_FORBIDDEN");

    clearTestCookies();
  });
});
