import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  sql,
  asUser,
  createTestOrg,
  deleteTestOrg,
  createTestUser,
  deleteTestUser,
  addMembership,
  createTestEmployee,
  createTestProject,
  createTestTeam,
  UNIQUE_VIOLATION,
  FK_VIOLATION,
  RAISED_EXCEPTION,
} from "./helpers";

/**
 * Priority 1.4 — Project and team invariants. Covers
 * supabase/migrations/20260728090000_projects_and_teams.sql's guard
 * triggers, composite FKs, and the move_employee_to_team()/
 * close_orphaned_team_assignment() mechanisms directly.
 */
describe("project and team invariants", () => {
  let orgA: Awaited<ReturnType<typeof createTestOrg>>;
  let orgB: Awaited<ReturnType<typeof createTestOrg>>;
  let admin: Awaited<ReturnType<typeof createTestUser>>; // company_admin in Org A

  beforeAll(async () => {
    orgA = await createTestOrg("proj-team-a");
    orgB = await createTestOrg("proj-team-b");
    admin = await createTestUser("Project Team Admin");
    await addMembership(orgA.orgId, admin.userId, ["company_admin"]);
  });

  afterAll(async () => {
    await deleteTestOrg(orgA.orgId);
    await deleteTestOrg(orgB.orgId);
    await deleteTestUser(admin.userId);
    await sql.end();
  });

  it("cross-organization project/team relationships fail at the database level (composite FK)", async () => {
    const projectInA = await createTestProject(orgA.orgId, "Project In A");
    // A team claiming organization_id = Org B but project_id from Org A must fail —
    // teams_project_fk is FOREIGN KEY (project_id, organization_id) REFERENCES projects (id, organization_id).
    await expect(
      sql`insert into teams (organization_id, project_id, name) values (${orgB.orgId}, ${projectInA}, 'Cross-org team')`,
    ).rejects.toMatchObject(FK_VIOLATION);
  });

  it("cross-organization project_assignments fail at the database level (composite FK)", async () => {
    const projectInA = await createTestProject(orgA.orgId, "Project For Assignment");
    const employeeInB = await createTestEmployee(orgB.orgId, null, "Employee", "InOrgB");
    // employee_id belongs to Org B but organization_id claims Org A —
    // project_assignments_employee_fk is FOREIGN KEY (employee_id, organization_id)
    // REFERENCES employees (id, organization_id).
    await expect(
      sql`insert into project_assignments (organization_id, project_id, employee_id, assignment_role) values (${orgA.orgId}, ${projectInA}, ${employeeInB}, 'member')`,
    ).rejects.toMatchObject(FK_VIOLATION);
  });

  it("only one active team assignment per project — a second open team assignment (different team, same project) is rejected", async () => {
    const projectId = await createTestProject(orgA.orgId, "One Team Project");
    const teamAlpha = await createTestTeam(orgA.orgId, projectId, "Alpha");
    const teamBravo = await createTestTeam(orgA.orgId, projectId, "Bravo");
    const employeeId = await createTestEmployee(orgA.orgId, null, "One", "Team");
    await sql`insert into project_assignments (organization_id, project_id, employee_id, assignment_role) values (${orgA.orgId}, ${projectId}, ${employeeId}, 'member')`;

    await asUser(admin.userId, (tx) =>
      tx`insert into team_assignments (organization_id, project_id, team_id, employee_id) values (${orgA.orgId}, ${projectId}, ${teamAlpha}, ${employeeId})`,
    );

    await expect(
      asUser(admin.userId, (tx) =>
        tx`insert into team_assignments (organization_id, project_id, team_id, employee_id) values (${orgA.orgId}, ${projectId}, ${teamBravo}, ${employeeId})`,
      ),
    ).rejects.toMatchObject(UNIQUE_VIOLATION);
  });

  it("historical team movement: move_employee_to_team() closes the previous assignment and opens the new one", async () => {
    const projectId = await createTestProject(orgA.orgId, "Move Project");
    const teamAlpha = await createTestTeam(orgA.orgId, projectId, "Move Alpha");
    const teamBravo = await createTestTeam(orgA.orgId, projectId, "Move Bravo");
    const employeeId = await createTestEmployee(orgA.orgId, null, "Move", "Employee");
    await sql`insert into project_assignments (organization_id, project_id, employee_id, assignment_role) values (${orgA.orgId}, ${projectId}, ${employeeId}, 'member')`;

    await asUser(admin.userId, (tx) =>
      tx`insert into team_assignments (organization_id, project_id, team_id, employee_id) values (${orgA.orgId}, ${projectId}, ${teamAlpha}, ${employeeId})`,
    );

    await asUser(admin.userId, (tx) => tx`select * from move_employee_to_team(${projectId}, ${teamBravo}, ${employeeId})`);

    const rows = await sql`select team_id, end_at from team_assignments where project_id = ${projectId} and employee_id = ${employeeId} order by start_at`;
    expect(rows).toHaveLength(2);
    expect(rows[0].team_id).toBe(teamAlpha);
    expect(rows[0].end_at).not.toBeNull(); // closed
    expect(rows[1].team_id).toBe(teamBravo);
    expect(rows[1].end_at).toBeNull(); // open — the current team
  });

  it("overlapping project assignments fail: a new row for the same (project, employee, role) starting before the prior one closed is rejected", async () => {
    const projectId = await createTestProject(orgA.orgId, "Overlap Project");
    const employeeId = await createTestEmployee(orgA.orgId, null, "Overlap", "Assignment");
    const [firstAssignment] = await sql`
      insert into project_assignments (organization_id, project_id, employee_id, assignment_role, start_at)
      values (${orgA.orgId}, ${projectId}, ${employeeId}, 'member', '2026-01-01T00:00:00Z')
      returning id
    `;
    await sql`update project_assignments set end_at = '2026-02-01T00:00:00Z' where id = ${firstAssignment.id}`;

    await expect(
      asUser(admin.userId, (tx) =>
        tx`insert into project_assignments (organization_id, project_id, employee_id, assignment_role, start_at) values (${orgA.orgId}, ${projectId}, ${employeeId}, 'member', '2026-01-15T00:00:00Z')`,
      ),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("a terminated employee cannot receive a new project assignment", async () => {
    const projectId = await createTestProject(orgA.orgId, "Terminated Employee Project");
    const employeeId = await createTestEmployee(orgA.orgId, null, "Terminated", "Employee");
    const [period] = await sql`select id from employee_employment_periods where employee_id = ${employeeId} and end_date is null`;
    await sql`update employee_employment_periods set end_date = current_date, end_reason = 'resigned' where id = ${period.id}`;
    // sync trigger has now set employees.employment_status = 'terminated'

    await expect(
      asUser(admin.userId, (tx) =>
        tx`insert into project_assignments (organization_id, project_id, employee_id, assignment_role) values (${orgA.orgId}, ${projectId}, ${employeeId}, 'member')`,
      ),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("an archived project rejects new teams", async () => {
    const projectId = await createTestProject(orgA.orgId, "Will Be Archived", "archived");
    await expect(
      asUser(admin.userId, (tx) => tx`insert into teams (organization_id, project_id, name) values (${orgA.orgId}, ${projectId}, 'Team In Archived Project')`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("a team with active members cannot be archived", async () => {
    const projectId = await createTestProject(orgA.orgId, "Archive Guard Project");
    const teamId = await createTestTeam(orgA.orgId, projectId, "Has Members");
    const employeeId = await createTestEmployee(orgA.orgId, null, "Team", "Member");
    await sql`insert into project_assignments (organization_id, project_id, employee_id, assignment_role) values (${orgA.orgId}, ${projectId}, ${employeeId}, 'member')`;
    await asUser(admin.userId, (tx) =>
      tx`insert into team_assignments (organization_id, project_id, team_id, employee_id) values (${orgA.orgId}, ${projectId}, ${teamId}, ${employeeId})`,
    );

    await expect(
      asUser(admin.userId, (tx) => tx`update teams set status = 'archived' where id = ${teamId}`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("orphan cleanup: closing an employee's last project assignment auto-closes their open team assignment in that project", async () => {
    const projectId = await createTestProject(orgA.orgId, "Orphan Cleanup Project");
    const teamId = await createTestTeam(orgA.orgId, projectId, "Orphan Team");
    const employeeId = await createTestEmployee(orgA.orgId, null, "Orphan", "Cleanup");
    const [projectAssignment] = await sql`
      insert into project_assignments (organization_id, project_id, employee_id, assignment_role)
      values (${orgA.orgId}, ${projectId}, ${employeeId}, 'member')
      returning id
    `;
    await asUser(admin.userId, (tx) =>
      tx`insert into team_assignments (organization_id, project_id, team_id, employee_id) values (${orgA.orgId}, ${projectId}, ${teamId}, ${employeeId})`,
    );

    // Close the employee's ONLY project_assignments row for this project — this
    // should cascade-close their team_assignments row too (close_orphaned_team_assignment).
    await asUser(admin.userId, (tx) =>
      tx`update project_assignments set end_at = now(), ended_at = now() where id = ${projectAssignment.id}`,
    );

    const [teamAssignment] = await sql`select end_at from team_assignments where project_id = ${projectId} and employee_id = ${employeeId}`;
    expect(teamAssignment.end_at).not.toBeNull();
  });
});
