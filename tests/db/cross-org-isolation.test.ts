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
  roleId,
  getMembershipId,
  RLS_VIOLATION,
} from "./helpers";

/**
 * Priority 1.1 — Cross-organization isolation. Every scenario here exists
 * because RLS (not the application layer) is this platform's actual
 * tenant-isolation boundary — see docs/ARCHITECTURE.md §3 and every
 * `organizations_select_active_member`-shaped policy across the schema.
 */
describe("cross-organization isolation", () => {
  let orgA: Awaited<ReturnType<typeof createTestOrg>>;
  let orgB: Awaited<ReturnType<typeof createTestOrg>>;
  let userA: Awaited<ReturnType<typeof createTestUser>>; // company_admin in Org A only
  let userAB: Awaited<ReturnType<typeof createTestUser>>; // active in Org A, invited (not yet active) in Org B
  let employeeB: string;

  beforeAll(async () => {
    orgA = await createTestOrg("cross-org-a");
    orgB = await createTestOrg("cross-org-b");
    userA = await createTestUser("Org A Admin");
    userAB = await createTestUser("Multi Org User");

    await addMembership(orgA.orgId, userA.userId, ["company_admin"]);
    await addMembership(orgA.orgId, userAB.userId, ["company_admin"], "active");
    await addMembership(orgB.orgId, userAB.userId, ["company_admin"], "invited"); // NOT active yet

    employeeB = await createTestEmployee(orgB.orgId, null, "Org B", "Employee");
  });

  afterAll(async () => {
    await deleteTestOrg(orgA.orgId);
    await deleteTestOrg(orgB.orgId);
    await deleteTestUser(userA.userId);
    await deleteTestUser(userAB.userId);
    await sql.end();
  });

  it("a user in Org A cannot read Org B's organization row", async () => {
    const rows = await asUser(userA.userId, (tx) => tx`select id from organizations where id = ${orgB.orgId}`);
    expect(rows).toHaveLength(0);
  });

  it("a user in Org A cannot read Org B's employees", async () => {
    const rows = await asUser(userA.userId, (tx) => tx`select id from employees where organization_id = ${orgB.orgId}`);
    expect(rows).toHaveLength(0);
  });

  it("a user in Org A cannot INSERT an employee into Org B", async () => {
    await expect(
      asUser(userA.userId, (tx) =>
        tx`
          insert into employees (organization_id, employee_number, first_name, last_name, employment_status, start_date)
          values (${orgB.orgId}, 'HACK-001', 'Should', 'Fail', 'active', current_date)
        `,
      ),
    ).rejects.toMatchObject(RLS_VIOLATION);
  });

  it("a user in Org A cannot UPDATE an Org B employee (RLS silently matches zero rows, not an error)", async () => {
    const rows = await asUser(userA.userId, (tx) =>
      tx`update employees set position_title = 'Hacked' where id = ${employeeB} returning id`,
    );
    expect(rows).toHaveLength(0);

    // Confirm it genuinely wasn't changed, reading as the admin connection.
    const [check] = await sql`select position_title from employees where id = ${employeeB}`;
    expect(check.position_title).not.toBe("Hacked");
  });

  it("a user in Org A cannot DELETE an Org B employee (no DELETE grant exists for any org, by design)", async () => {
    await expect(
      asUser(userA.userId, (tx) => tx`delete from employees where id = ${employeeB}`),
    ).rejects.toMatchObject(RLS_VIOLATION); // missing GRANT surfaces as the same insufficient_privilege SQLSTATE
  });

  it("a multi-org user sees exactly the orgs where their membership is ACTIVE — not orgs with a merely-invited membership", async () => {
    const rows = await asUser(userAB.userId, (tx) => tx`select id from organizations order by id`);
    const ids = rows.map((r) => r.id as string);
    expect(ids).toContain(orgA.orgId);
    expect(ids).not.toContain(orgB.orgId); // membership status is 'invited', not 'active'
  });

  it("active_organization_id is a UX preference only — it never restricts what RLS returns", async () => {
    // Point active_organization_id at Org B (where userAB is only 'invited') and confirm
    // the organizations RLS result is completely unaffected — it still reflects ACTIVE
    // membership only, exactly as before. This is the literal claim in profiles.sql's
    // column comment; this test is what makes that claim verifiable, not just documented.
    await sql`update profiles set active_organization_id = ${orgB.orgId} where id = ${userAB.userId}`;
    const rows = await asUser(userAB.userId, (tx) => tx`select id from organizations order by id`);
    const ids = rows.map((r) => r.id as string);
    expect(ids).toContain(orgA.orgId);
    expect(ids).not.toContain(orgB.orgId);
  });

  it("holding platform_super_admin grants no implicit cross-org bypass (the role is explicit and currently inert, not a hidden backdoor)", async () => {
    // platform_super_admin can only be attached via a direct admin-connection
    // insert — membership_roles_insert_managers' RLS policy explicitly
    // excludes it from ever being self-assignable through the app (see
    // 20260726120000_role_catalogue_update.sql). Simulating that
    // service-role-only path here on purpose, to prove that even holding
    // the role changes nothing about what RLS returns for a different org.
    // userA already has a membership in Org A from beforeAll — attach the
    // extra role to that existing membership rather than creating a second
    // one (organization_memberships has a unique (organization_id, user_id)).
    const existingMembershipId = await getMembershipId(orgA.orgId, userA.userId);
    const superAdminRoleId = await roleId("platform_super_admin");
    await sql`insert into membership_roles (organization_id, membership_id, role_id) values (${orgA.orgId}, ${existingMembershipId}, ${superAdminRoleId})`;

    const rows = await asUser(userA.userId, (tx) => tx`select id from organizations where id = ${orgB.orgId}`);
    expect(rows).toHaveLength(0);
  });
});
