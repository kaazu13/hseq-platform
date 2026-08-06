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
  getMembershipId,
  RLS_VIOLATION,
} from "./helpers";

/**
 * Priority 1.1 — Cross-company isolation. Every scenario here exists
 * because RLS (not the application layer) is this platform's actual
 * tenant-isolation boundary — see docs/ARCHITECTURE.md §3 and every
 * `companies_select_active_member`-shaped policy across the schema.
 */
describe("cross-company isolation", () => {
  let companyA: Awaited<ReturnType<typeof createTestCompany>>;
  let companyB: Awaited<ReturnType<typeof createTestCompany>>;
  let userA: Awaited<ReturnType<typeof createTestUser>>; // company_admin in Company A only
  let userAB: Awaited<ReturnType<typeof createTestUser>>; // active in Company A, invited (not yet active) in Company B
  let employeeB: string;

  beforeAll(async () => {
    companyA = await createTestCompany("cross-company-a");
    companyB = await createTestCompany("cross-company-b");
    userA = await createTestUser("Company A Admin");
    userAB = await createTestUser("Multi Company User");

    await addMembership(companyA.companyId, userA.userId, ["company_admin"]);
    await addMembership(companyA.companyId, userAB.userId, ["company_admin"], "active");
    await addMembership(companyB.companyId, userAB.userId, ["company_admin"], "invited"); // NOT active yet

    employeeB = await createTestEmployee(companyB.companyId, null, "Company B", "Employee");
  });

  afterAll(async () => {
    await deleteTestCompany(companyA.companyId);
    await deleteTestCompany(companyB.companyId);
    await deleteTestUser(userA.userId);
    await deleteTestUser(userAB.userId);
    await sql.end();
  });

  it("a user in Company A cannot read Company B's company row", async () => {
    const rows = await asUser(userA.userId, (tx) => tx`select id from companies where id = ${companyB.companyId}`);
    expect(rows).toHaveLength(0);
  });

  it("a user in Company A cannot read Company B's employees", async () => {
    const rows = await asUser(userA.userId, (tx) => tx`select id from employees where company_id = ${companyB.companyId}`);
    expect(rows).toHaveLength(0);
  });

  it("a user in Company A cannot INSERT an employee into Company B", async () => {
    await expect(
      asUser(userA.userId, (tx) =>
        tx`
          insert into employees (company_id, employee_number, first_name, last_name, employment_status, start_date)
          values (${companyB.companyId}, 'HACK-001', 'Should', 'Fail', 'active', current_date)
        `,
      ),
    ).rejects.toMatchObject(RLS_VIOLATION);
  });

  it("a user in Company A cannot UPDATE an Company B employee (RLS silently matches zero rows, not an error)", async () => {
    const rows = await asUser(userA.userId, (tx) =>
      tx`update employees set position_title = 'Hacked' where id = ${employeeB} returning id`,
    );
    expect(rows).toHaveLength(0);

    // Confirm it genuinely wasn't changed, reading as the admin connection.
    const [check] = await sql`select position_title from employees where id = ${employeeB}`;
    expect(check.position_title).not.toBe("Hacked");
  });

  it("a user in Company A cannot DELETE an Company B employee (no DELETE grant exists for any company, by design)", async () => {
    await expect(
      asUser(userA.userId, (tx) => tx`delete from employees where id = ${employeeB}`),
    ).rejects.toMatchObject(RLS_VIOLATION); // missing GRANT surfaces as the same insufficient_privilege SQLSTATE
  });

  it("a multi-company user sees exactly the orgs where their membership is ACTIVE — not orgs with a merely-invited membership", async () => {
    const rows = await asUser(userAB.userId, (tx) => tx`select id from companies order by id`);
    const ids = rows.map((r) => r.id as string);
    expect(ids).toContain(companyA.companyId);
    expect(ids).not.toContain(companyB.companyId); // membership status is 'invited', not 'active'
  });

  it("active_company_id is a UX preference only — it never restricts what RLS returns", async () => {
    // Point active_company_id at Company B (where userAB is only 'invited') and confirm
    // the companies RLS result is completely unaffected — it still reflects ACTIVE
    // membership only, exactly as before. This is the literal claim in profiles.sql's
    // column comment; this test is what makes that claim verifiable, not just documented.
    await sql`update profiles set active_company_id = ${companyB.companyId} where id = ${userAB.userId}`;
    const rows = await asUser(userAB.userId, (tx) => tx`select id from companies order by id`);
    const ids = rows.map((r) => r.id as string);
    expect(ids).toContain(companyA.companyId);
    expect(ids).not.toContain(companyB.companyId);
  });

  it("holding platform_super_admin grants no implicit cross-company bypass (the role is explicit and currently inert, not a hidden backdoor)", async () => {
    // platform_super_admin can only be attached via a direct admin-connection
    // insert — membership_roles_insert_managers' RLS policy explicitly
    // excludes it from ever being self-assignable through the app (see
    // 20260726120000_role_catalogue_update.sql). Simulating that
    // service-role-only path here on purpose, to prove that even holding
    // the role changes nothing about what RLS returns for a different company.
    // userA already has a membership in Company A from beforeAll — attach the
    // extra role to that existing membership rather than creating a second
    // one (company_memberships has a unique (company_id, user_id)).
    const existingMembershipId = await getMembershipId(companyA.companyId, userA.userId);
    const superAdminRoleId = await roleId("platform_super_admin");
    await sql`insert into membership_roles (company_id, membership_id, role_id) values (${companyA.companyId}, ${existingMembershipId}, ${superAdminRoleId})`;

    const rows = await asUser(userA.userId, (tx) => tx`select id from companies where id = ${companyB.companyId}`);
    expect(rows).toHaveLength(0);
  });
});
