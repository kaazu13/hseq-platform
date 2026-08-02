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
  roleId,
  getMembershipId,
  RLS_VIOLATION,
} from "./helpers";

/**
 * Priority 1.2 — Role permissions. Mirrors docs/ROLES_AND_PERMISSIONS.md §4's
 * access matrix directly against the live RLS policies (employees_*,
 * membership_roles_insert_managers/_delete_managers, projects_*,
 * audit_events_select_authorized_members) — not the application-layer
 * permissions.ts mirrors of them (those are covered by unit tests).
 *
 * Every "should be rejected by RLS" assertion below checks the specific
 * Postgres error code (42501, insufficient_privilege via RLS_VIOLATION),
 * not just "rejects with something" — a bare .rejects.toThrow() would also
 * pass if the query broke for an unrelated reason (a typo'd column name,
 * say), silently testing nothing.
 */
describe("role permissions", () => {
  let org: Awaited<ReturnType<typeof createTestOrg>>;
  let companyManager: Awaited<ReturnType<typeof createTestUser>>;
  let workforceCoordinator: Awaited<ReturnType<typeof createTestUser>>;
  let projectManager: Awaited<ReturnType<typeof createTestUser>>;
  let hseqManager: Awaited<ReturnType<typeof createTestUser>>;
  let hseOfficer: Awaited<ReturnType<typeof createTestUser>>;
  let plainEmployeeUser: Awaited<ReturnType<typeof createTestUser>>;
  let targetOfRoleChanges: Awaited<ReturnType<typeof createTestUser>>;
  let assignedProjectId: string;
  let otherProjectId: string;

  beforeAll(async () => {
    org = await createTestOrg("role-perms");
    companyManager = await createTestUser("Company Manager");
    workforceCoordinator = await createTestUser("Workforce Coordinator");
    projectManager = await createTestUser("Project Manager");
    hseqManager = await createTestUser("HSEQ Manager");
    hseOfficer = await createTestUser("HSE Officer");
    plainEmployeeUser = await createTestUser("Plain Employee");
    targetOfRoleChanges = await createTestUser("Role Change Target");

    await addMembership(org.orgId, companyManager.userId, ["company_admin"]);
    await addMembership(org.orgId, workforceCoordinator.userId, ["operations_manager"]);
    await addMembership(org.orgId, projectManager.userId, ["project_manager"]);
    await addMembership(org.orgId, hseqManager.userId, ["hseq_manager"]);
    await addMembership(org.orgId, hseOfficer.userId, ["hse_officer"]);
    await addMembership(org.orgId, plainEmployeeUser.userId, ["employee"]);
    await addMembership(org.orgId, targetOfRoleChanges.userId, ["employee"]);

    assignedProjectId = await createTestProject(org.orgId, "Assigned Project");
    otherProjectId = await createTestProject(org.orgId, "Other Project");

    // Give the Project Manager user an employee record + a project_assignments
    // row on assignedProjectId (not otherProjectId), so is_project_manager()
    // can resolve for exactly one of the two projects.
    const pmEmployeeId = await createTestEmployee(org.orgId, projectManager.userId, "Project", "Manager");
    await sql`
      insert into project_assignments (organization_id, project_id, employee_id, assignment_role)
      values (${org.orgId}, ${assignedProjectId}, ${pmEmployeeId}, 'project_manager')
    `;
  });

  afterAll(async () => {
    await deleteTestOrg(org.orgId);
    for (const u of [companyManager, workforceCoordinator, projectManager, hseqManager, hseOfficer, plainEmployeeUser, targetOfRoleChanges]) {
      await deleteTestUser(u.userId);
    }
    await sql.end();
  });

  describe("Company Manager (company_admin)", () => {
    it("can create an employee", async () => {
      const rows = await asUser(companyManager.userId, (tx) =>
        tx`insert into employees (organization_id, first_name, last_name, employment_status, start_date) values (${org.orgId}, 'CM', 'Created', 'active', current_date) returning id`,
      );
      expect(rows).toHaveLength(1);
    });

    it("can see the full employee roster", async () => {
      const rows = await asUser(companyManager.userId, (tx) => tx`select id from employees where organization_id = ${org.orgId}`);
      expect(rows.length).toBeGreaterThan(0);
    });

    it("can assign an elevated role (hseq_manager) to another membership", async () => {
      const membershipId = await getMembershipId(org.orgId, targetOfRoleChanges.userId);
      const hseqRoleId = await roleId("hseq_manager");
      const rows = await asUser(companyManager.userId, (tx) =>
        tx`insert into membership_roles (organization_id, membership_id, role_id) values (${org.orgId}, ${membershipId}, ${hseqRoleId}) returning id`,
      );
      expect(rows).toHaveLength(1);
      await sql`delete from membership_roles where id = ${rows[0].id}`; // clean up for later tests
    });
  });

  describe("Workforce Coordinator (operations_manager) limitations", () => {
    it("can create an employee (same write gate as Company Manager)", async () => {
      const rows = await asUser(workforceCoordinator.userId, (tx) =>
        tx`insert into employees (organization_id, first_name, last_name, employment_status, start_date) values (${org.orgId}, 'WC', 'Created', 'active', current_date) returning id`,
      );
      expect(rows).toHaveLength(1);
    });

    it("CANNOT assign an elevated role (project_manager)", async () => {
      const membershipId = await getMembershipId(org.orgId, targetOfRoleChanges.userId);
      const pmRoleId = await roleId("project_manager");
      await expect(
        asUser(workforceCoordinator.userId, (tx) =>
          tx`insert into membership_roles (organization_id, membership_id, role_id) values (${org.orgId}, ${membershipId}, ${pmRoleId})`,
        ),
      ).rejects.toMatchObject(RLS_VIOLATION);
    });

    it("CANNOT assign company_admin (would be a privilege escalation)", async () => {
      const membershipId = await getMembershipId(org.orgId, targetOfRoleChanges.userId);
      const caRoleId = await roleId("company_admin");
      await expect(
        asUser(workforceCoordinator.userId, (tx) =>
          tx`insert into membership_roles (organization_id, membership_id, role_id) values (${org.orgId}, ${membershipId}, ${caRoleId})`,
        ),
      ).rejects.toMatchObject(RLS_VIOLATION);
    });

    it("CAN still assign inspector (not in the forbidden list)", async () => {
      const membershipId = await getMembershipId(org.orgId, targetOfRoleChanges.userId);
      const inspectorRoleId = await roleId("inspector");
      const rows = await asUser(workforceCoordinator.userId, (tx) =>
        tx`insert into membership_roles (organization_id, membership_id, role_id) values (${org.orgId}, ${membershipId}, ${inspectorRoleId}) returning id`,
      );
      expect(rows).toHaveLength(1);
      await sql`delete from membership_roles where id = ${rows[0].id}`; // clean up
    });
  });

  describe("Project Manager permissions", () => {
    it("has read-only access to the employee roster (org-wide read role, not a write role)", async () => {
      const readRows = await asUser(projectManager.userId, (tx) => tx`select id from employees where organization_id = ${org.orgId}`);
      expect(readRows.length).toBeGreaterThan(0);

      await expect(
        asUser(projectManager.userId, (tx) =>
          tx`insert into employees (organization_id, first_name, last_name, employment_status, start_date) values (${org.orgId}, 'PM', 'Blocked', 'active', current_date)`,
        ),
      ).rejects.toMatchObject(RLS_VIOLATION);
    });

    it("can update the project they are assigned as Project Manager on", async () => {
      const rows = await asUser(projectManager.userId, (tx) =>
        tx`update projects set description = 'updated by PM' where id = ${assignedProjectId} returning id`,
      );
      expect(rows).toHaveLength(1);
    });

    it("cannot update a DIFFERENT project they are not assigned to", async () => {
      const rows = await asUser(projectManager.userId, (tx) =>
        tx`update projects set description = 'should not apply' where id = ${otherProjectId} returning id`,
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe("HSEQ Manager permissions", () => {
    it("has read-only access to the employee roster", async () => {
      const readRows = await asUser(hseqManager.userId, (tx) => tx`select id from employees where organization_id = ${org.orgId}`);
      expect(readRows.length).toBeGreaterThan(0);

      await expect(
        asUser(hseqManager.userId, (tx) =>
          tx`insert into employees (organization_id, first_name, last_name, employment_status, start_date) values (${org.orgId}, 'HSEQ', 'Blocked', 'active', current_date)`,
        ),
      ).rejects.toMatchObject(RLS_VIOLATION);
    });

    it("can read audit_events for their org (company_admin + hseq_manager only)", async () => {
      await sql`insert into audit_events (organization_id, actor_user_id, action, entity_type, entity_id) values (${org.orgId}, ${companyManager.userId}, 'create', 'employee', ${org.orgId})`;
      const rows = await asUser(hseqManager.userId, (tx) => tx`select id from audit_events where organization_id = ${org.orgId}`);
      expect(rows.length).toBeGreaterThan(0);
    });

    it("a Project Manager (not company_admin/hseq_manager) cannot read audit_events", async () => {
      const rows = await asUser(projectManager.userId, (tx) => tx`select id from audit_events where organization_id = ${org.orgId}`);
      expect(rows).toHaveLength(0);
    });
  });

  describe("Operational-role restrictions (hse_officer)", () => {
    it("does NOT have org-wide employee-roster read access (deliberately excluded — project-scoped only)", async () => {
      const rows = await asUser(hseOfficer.userId, (tx) => tx`select id from employees where organization_id = ${org.orgId}`);
      // hse_officer sees only their own linked employee record, if any — they have none here, so zero rows.
      expect(rows).toHaveLength(0);
    });

    it("cannot create or update employees", async () => {
      await expect(
        asUser(hseOfficer.userId, (tx) =>
          tx`insert into employees (organization_id, first_name, last_name, employment_status, start_date) values (${org.orgId}, 'HSE', 'Blocked', 'active', current_date)`,
        ),
      ).rejects.toMatchObject(RLS_VIOLATION);
    });
  });

  describe("unauthorized role assignment and removal", () => {
    it("a plain employee cannot assign any role at all", async () => {
      const membershipId = await getMembershipId(org.orgId, targetOfRoleChanges.userId);
      const plannerRoleId = await roleId("planner");
      await expect(
        asUser(plainEmployeeUser.userId, (tx) =>
          tx`insert into membership_roles (organization_id, membership_id, role_id) values (${org.orgId}, ${membershipId}, ${plannerRoleId})`,
        ),
      ).rejects.toMatchObject(RLS_VIOLATION);
    });

    it("a plain employee cannot remove another member's role", async () => {
      const membershipId = await getMembershipId(org.orgId, workforceCoordinator.userId);
      const [assignment] = await sql`select id from membership_roles where membership_id = ${membershipId}`;
      const rows = await asUser(plainEmployeeUser.userId, (tx) =>
        tx`delete from membership_roles where id = ${assignment.id} returning id`,
      );
      expect(rows).toHaveLength(0); // silently matches zero rows under RLS, doesn't actually remove it
      const [stillThere] = await sql`select id from membership_roles where id = ${assignment.id}`;
      expect(stillThere).toBeDefined();
    });

    it("removing the organization's LAST company_admin is rejected even for another company_admin", async () => {
      // companyManager is the only company_admin in this org — the
      // membership_roles_delete_managers policy's "preserve at least one"
      // guard must block this, not just the app layer.
      const membershipId = await getMembershipId(org.orgId, companyManager.userId);
      const caRoleId = await roleId("company_admin");
      const [assignment] = await sql`select id from membership_roles where membership_id = ${membershipId} and role_id = ${caRoleId}`;
      const rows = await asUser(companyManager.userId, (tx) =>
        tx`delete from membership_roles where id = ${assignment.id} returning id`,
      );
      expect(rows).toHaveLength(0);
    });
  });
});
