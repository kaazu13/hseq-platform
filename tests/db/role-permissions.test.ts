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
  let company: Awaited<ReturnType<typeof createTestCompany>>;
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
    company = await createTestCompany("role-perms");
    companyManager = await createTestUser("Company Manager");
    workforceCoordinator = await createTestUser("Workforce Coordinator");
    projectManager = await createTestUser("Project Manager");
    hseqManager = await createTestUser("HSEQ Manager");
    hseOfficer = await createTestUser("HSE Officer");
    plainEmployeeUser = await createTestUser("Plain Employee");
    targetOfRoleChanges = await createTestUser("Role Change Target");

    await addMembership(company.companyId, companyManager.userId, ["company_admin"]);
    await addMembership(company.companyId, workforceCoordinator.userId, ["operations_manager"]);
    await addMembership(company.companyId, projectManager.userId, ["project_manager"]);
    await addMembership(company.companyId, hseqManager.userId, ["hseq_manager"]);
    await addMembership(company.companyId, hseOfficer.userId, ["hse_officer"]);
    await addMembership(company.companyId, plainEmployeeUser.userId, ["employee"]);
    await addMembership(company.companyId, targetOfRoleChanges.userId, ["employee"]);

    assignedProjectId = await createTestProject(company.companyId, "Assigned Project");
    otherProjectId = await createTestProject(company.companyId, "Other Project");

    // Give the Project Manager user an employee record + a project_assignments
    // row on assignedProjectId (not otherProjectId), so is_project_manager()
    // can resolve for exactly one of the two projects.
    const pmEmployeeId = await createTestEmployee(company.companyId, projectManager.userId, "Project", "Manager");
    await sql`
      insert into project_assignments (company_id, project_id, employee_id, assignment_role)
      values (${company.companyId}, ${assignedProjectId}, ${pmEmployeeId}, 'project_manager')
    `;
  });

  afterAll(async () => {
    await deleteTestCompany(company.companyId);
    for (const u of [companyManager, workforceCoordinator, projectManager, hseqManager, hseOfficer, plainEmployeeUser, targetOfRoleChanges]) {
      await deleteTestUser(u.userId);
    }
    await sql.end();
  });

  describe("Company Manager (company_admin)", () => {
    it("can create an employee", async () => {
      const rows = await asUser(companyManager.userId, (tx) =>
        tx`insert into employees (company_id, first_name, last_name, employment_status, start_date) values (${company.companyId}, 'CM', 'Created', 'active', current_date) returning id`,
      );
      expect(rows).toHaveLength(1);
    });

    it("can see the full employee roster", async () => {
      const rows = await asUser(companyManager.userId, (tx) => tx`select id from employees where company_id = ${company.companyId}`);
      expect(rows.length).toBeGreaterThan(0);
    });

    it("can assign an elevated role (hseq_manager) to another membership", async () => {
      const membershipId = await getMembershipId(company.companyId, targetOfRoleChanges.userId);
      const hseqRoleId = await roleId("hseq_manager");
      const rows = await asUser(companyManager.userId, (tx) =>
        tx`insert into membership_roles (company_id, membership_id, role_id) values (${company.companyId}, ${membershipId}, ${hseqRoleId}) returning id`,
      );
      expect(rows).toHaveLength(1);
      await sql`delete from membership_roles where id = ${rows[0].id}`; // clean up for later tests
    });
  });

  describe("Workforce Coordinator (operations_manager) limitations", () => {
    it("can create an employee (same write gate as Company Manager)", async () => {
      const rows = await asUser(workforceCoordinator.userId, (tx) =>
        tx`insert into employees (company_id, first_name, last_name, employment_status, start_date) values (${company.companyId}, 'WC', 'Created', 'active', current_date) returning id`,
      );
      expect(rows).toHaveLength(1);
    });

    it("CANNOT assign an elevated role (project_manager)", async () => {
      const membershipId = await getMembershipId(company.companyId, targetOfRoleChanges.userId);
      const pmRoleId = await roleId("project_manager");
      await expect(
        asUser(workforceCoordinator.userId, (tx) =>
          tx`insert into membership_roles (company_id, membership_id, role_id) values (${company.companyId}, ${membershipId}, ${pmRoleId})`,
        ),
      ).rejects.toMatchObject(RLS_VIOLATION);
    });

    it("CANNOT assign company_admin (would be a privilege escalation)", async () => {
      const membershipId = await getMembershipId(company.companyId, targetOfRoleChanges.userId);
      const caRoleId = await roleId("company_admin");
      await expect(
        asUser(workforceCoordinator.userId, (tx) =>
          tx`insert into membership_roles (company_id, membership_id, role_id) values (${company.companyId}, ${membershipId}, ${caRoleId})`,
        ),
      ).rejects.toMatchObject(RLS_VIOLATION);
    });

    it("CAN still assign inspector (not in the forbidden list)", async () => {
      const membershipId = await getMembershipId(company.companyId, targetOfRoleChanges.userId);
      const inspectorRoleId = await roleId("inspector");
      const rows = await asUser(workforceCoordinator.userId, (tx) =>
        tx`insert into membership_roles (company_id, membership_id, role_id) values (${company.companyId}, ${membershipId}, ${inspectorRoleId}) returning id`,
      );
      expect(rows).toHaveLength(1);
      await sql`delete from membership_roles where id = ${rows[0].id}`; // clean up
    });
  });

  describe("Project Manager permissions", () => {
    it("has read-only access to the employee roster (company-wide read role, not a write role)", async () => {
      const readRows = await asUser(projectManager.userId, (tx) => tx`select id from employees where company_id = ${company.companyId}`);
      expect(readRows.length).toBeGreaterThan(0);

      await expect(
        asUser(projectManager.userId, (tx) =>
          tx`insert into employees (company_id, first_name, last_name, employment_status, start_date) values (${company.companyId}, 'PM', 'Blocked', 'active', current_date)`,
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
      const readRows = await asUser(hseqManager.userId, (tx) => tx`select id from employees where company_id = ${company.companyId}`);
      expect(readRows.length).toBeGreaterThan(0);

      await expect(
        asUser(hseqManager.userId, (tx) =>
          tx`insert into employees (company_id, first_name, last_name, employment_status, start_date) values (${company.companyId}, 'HSEQ', 'Blocked', 'active', current_date)`,
        ),
      ).rejects.toMatchObject(RLS_VIOLATION);
    });

    it("can read audit_events for their company (company_admin + hseq_manager only)", async () => {
      await sql`insert into audit_events (company_id, actor_user_id, action, entity_type, entity_id) values (${company.companyId}, ${companyManager.userId}, 'create', 'employee', ${company.companyId})`;
      const rows = await asUser(hseqManager.userId, (tx) => tx`select id from audit_events where company_id = ${company.companyId}`);
      expect(rows.length).toBeGreaterThan(0);
    });

    it("a Project Manager (not company_admin/hseq_manager) cannot read audit_events", async () => {
      const rows = await asUser(projectManager.userId, (tx) => tx`select id from audit_events where company_id = ${company.companyId}`);
      expect(rows).toHaveLength(0);
    });
  });

  describe("Operational-role restrictions (hse_officer)", () => {
    it("does NOT have company-wide employee-roster read access (deliberately excluded — project-scoped only)", async () => {
      const rows = await asUser(hseOfficer.userId, (tx) => tx`select id from employees where company_id = ${company.companyId}`);
      // hse_officer sees only their own linked employee record, if any — they have none here, so zero rows.
      expect(rows).toHaveLength(0);
    });

    it("cannot create or update employees", async () => {
      await expect(
        asUser(hseOfficer.userId, (tx) =>
          tx`insert into employees (company_id, first_name, last_name, employment_status, start_date) values (${company.companyId}, 'HSE', 'Blocked', 'active', current_date)`,
        ),
      ).rejects.toMatchObject(RLS_VIOLATION);
    });
  });

  describe("unauthorized role assignment and removal", () => {
    it("a plain employee cannot assign any role at all", async () => {
      const membershipId = await getMembershipId(company.companyId, targetOfRoleChanges.userId);
      const plannerRoleId = await roleId("planner");
      await expect(
        asUser(plainEmployeeUser.userId, (tx) =>
          tx`insert into membership_roles (company_id, membership_id, role_id) values (${company.companyId}, ${membershipId}, ${plannerRoleId})`,
        ),
      ).rejects.toMatchObject(RLS_VIOLATION);
    });

    it("a plain employee cannot remove another member's role", async () => {
      const membershipId = await getMembershipId(company.companyId, workforceCoordinator.userId);
      const [assignment] = await sql`select id from membership_roles where membership_id = ${membershipId}`;
      const rows = await asUser(plainEmployeeUser.userId, (tx) =>
        tx`delete from membership_roles where id = ${assignment.id} returning id`,
      );
      expect(rows).toHaveLength(0); // silently matches zero rows under RLS, doesn't actually remove it
      const [stillThere] = await sql`select id from membership_roles where id = ${assignment.id}`;
      expect(stillThere).toBeDefined();
    });

    it("removing the company's LAST company_admin is rejected even for another company_admin", async () => {
      // companyManager is the only company_admin in this company — the
      // membership_roles_delete_managers policy's "preserve at least one"
      // guard must block this, not just the app layer.
      const membershipId = await getMembershipId(company.companyId, companyManager.userId);
      const caRoleId = await roleId("company_admin");
      const [assignment] = await sql`select id from membership_roles where membership_id = ${membershipId} and role_id = ${caRoleId}`;
      const rows = await asUser(companyManager.userId, (tx) =>
        tx`delete from membership_roles where id = ${assignment.id} returning id`,
      );
      expect(rows).toHaveLength(0);
    });
  });
});
