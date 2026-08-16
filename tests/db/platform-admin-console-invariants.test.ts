import { describe, it, expect, afterAll } from "vitest";
import { sql, asUser, createTestCompany, deleteTestCompany, createTestUser, deleteTestUser, addMembership, roleId, getMembershipId, RAISED_EXCEPTION, UNIQUE_VIOLATION, RLS_VIOLATION } from "./helpers";

/**
 * Post-audit implementation package, Part 2 — Platform Admin console
 * regression coverage. NOT runnable in this environment (no local
 * Supabase instance available this session — see tests/db/helpers.ts's
 * hard loopback-only safety guard) — written correct-by-inspection and
 * live-verified equivalently via a disposable *@example.test platform
 * admin against the LINKED remote dev project (see this milestone's own
 * report), but this specific file itself was not executed. Run with
 * `supabase start` then `vitest run tests/db` to actually execute it.
 */
describe("audit_events readable by a platform super admin (real defect fix — root cause: audit_events_select_authorized_members never got the is_platform_super_admin() bypass every sibling platform-admin-relevant table already has)", () => {
  afterAll(async () => {
    await sql.end();
  });

  it("a platform super admin can read audit_events for a company they are NOT a member of; an unrelated non-admin user cannot", async () => {
    const company = await createTestCompany("audit-events-platform-admin");
    const platformAdmin = await createTestUser("Platform Admin Auditor");
    const unrelatedUser = await createTestUser("Unrelated Non-Admin");

    try {
      await sql`insert into platform_super_admins (user_id) values (${platformAdmin.userId})`;
      // Deliberately NOT added as a company_memberships row — proves the
      // platform admin can see this company's audit trail WITHOUT being a
      // member, which is the entire point of the fix.
      await sql`
        insert into audit_events (company_id, actor_user_id, action, entity_type, entity_id)
        values (${company.companyId}, ${platformAdmin.userId}, 'create', 'company', ${company.companyId})
      `;

      const platformAdminRows = await asUser(platformAdmin.userId, (tx) => tx`select id from audit_events where company_id = ${company.companyId}`);
      expect(platformAdminRows.length).toBeGreaterThan(0);

      const unrelatedRows = await asUser(unrelatedUser.userId, (tx) => tx`select id from audit_events where company_id = ${company.companyId}`);
      expect(unrelatedRows.length).toBe(0);
    } finally {
      await sql`delete from platform_super_admins where user_id = ${platformAdmin.userId}`;
      await deleteTestCompany(company.companyId);
      await deleteTestUser(platformAdmin.userId);
      await deleteTestUser(unrelatedUser.userId);
    }
  });

  it("company_admin/hseq_manager access to their OWN company's audit trail is unchanged by the fix", async () => {
    const company = await createTestCompany("audit-events-company-admin-unchanged");
    const companyAdmin = await createTestUser("Company Admin Auditor");

    try {
      await addMembership(company.companyId, companyAdmin.userId, ["company_admin"]);
      await sql`
        insert into audit_events (company_id, actor_user_id, action, entity_type, entity_id)
        values (${company.companyId}, ${companyAdmin.userId}, 'create', 'company', ${company.companyId})
      `;

      const rows = await asUser(companyAdmin.userId, (tx) => tx`select id from audit_events where company_id = ${company.companyId}`);
      expect(rows.length).toBeGreaterThan(0);
    } finally {
      await deleteTestCompany(company.companyId);
      await deleteTestUser(companyAdmin.userId);
    }
  });
});

describe("platform_admin_list_companies_without_admin — surfaces exactly the companies missing an ACTIVE company_admin", () => {
  afterAll(async () => {
    await sql.end();
  });

  it("a company with an active company_admin is excluded; a company with none is included", async () => {
    const withAdmin = await createTestCompany("without-admin-check-has-admin");
    const withoutAdmin = await createTestCompany("without-admin-check-missing");
    const platformAdmin = await createTestUser("Without-Admin Checker");
    const companyAdminUser = await createTestUser("Has An Admin");

    try {
      await sql`insert into platform_super_admins (user_id) values (${platformAdmin.userId})`;
      await addMembership(withAdmin.companyId, companyAdminUser.userId, ["company_admin"]);

      const rows = await asUser(platformAdmin.userId, (tx) => tx`select id from platform_admin_list_companies_without_admin(500)`);
      const ids = rows.map((r) => r.id as string);
      expect(ids).toContain(withoutAdmin.companyId);
      expect(ids).not.toContain(withAdmin.companyId);
    } finally {
      await sql`delete from platform_super_admins where user_id = ${platformAdmin.userId}`;
      await deleteTestCompany(withAdmin.companyId);
      await deleteTestCompany(withoutAdmin.companyId);
      await deleteTestUser(platformAdmin.userId);
      await deleteTestUser(companyAdminUser.userId);
    }
  });

  it("a company whose only company_admin membership is SUSPENDED (not active) still counts as missing an admin", async () => {
    const company = await createTestCompany("without-admin-check-suspended-admin");
    const platformAdmin = await createTestUser("Suspended-Admin Checker");
    const suspendedAdminUser = await createTestUser("Suspended Admin");

    try {
      await sql`insert into platform_super_admins (user_id) values (${platformAdmin.userId})`;
      await addMembership(company.companyId, suspendedAdminUser.userId, ["company_admin"], "suspended");

      const rows = await asUser(platformAdmin.userId, (tx) => tx`select id from platform_admin_list_companies_without_admin(500)`);
      const ids = rows.map((r) => r.id as string);
      expect(ids).toContain(company.companyId);
    } finally {
      await sql`delete from platform_super_admins where user_id = ${platformAdmin.userId}`;
      await deleteTestCompany(company.companyId);
      await deleteTestUser(platformAdmin.userId);
      await deleteTestUser(suspendedAdminUser.userId);
    }
  });
});

describe("platform_admin_* RPCs reject a non-platform-admin caller", () => {
  afterAll(async () => {
    await sql.end();
  });

  it("platform_admin_get_overview_stats() raises for an ordinary authenticated user", async () => {
    const plainUser = await createTestUser("Plain Non-Admin");
    try {
      await expect(asUser(plainUser.userId, (tx) => tx`select * from platform_admin_get_overview_stats()`)).rejects.toThrow();
    } finally {
      await deleteTestUser(plainUser.userId);
    }
  });

  it("platform_admin_list_companies() raises for an ordinary authenticated user, even one with a company_admin membership somewhere", async () => {
    const company = await createTestCompany("rpc-reject-company-admin");
    const companyAdminUser = await createTestUser("Company Admin, Not Platform Admin");
    try {
      await addMembership(company.companyId, companyAdminUser.userId, ["company_admin"]);
      await expect(asUser(companyAdminUser.userId, (tx) => tx`select * from platform_admin_list_companies(null, 20, 0)`)).rejects.toThrow();
    } finally {
      await deleteTestCompany(company.companyId);
      await deleteTestUser(companyAdminUser.userId);
    }
  });
});

/**
 * Completion pass, Part 6 — custom-role escalation regression tests. The
 * foundation (20260831092000_roles_permissions_foundation.sql) is
 * deliberately not wired into any operational module's own enforcement
 * yet (see the Roles & Permissions page's own "Custom permission
 * enforcement rollout pending" notice) — these tests only cover the
 * custom-role CRUD/assignment layer itself: who may touch it, and what it
 * can never be made to do, independent of whether anything downstream
 * consults it yet.
 */
describe("custom role escalation attempts are rejected", () => {
  afterAll(async () => {
    await sql.end();
  });

  it("a company_admin (not a platform super admin) cannot create/edit/delete a custom role", async () => {
    const company = await createTestCompany("custom-role-reject-company-admin");
    const companyAdminUser = await createTestUser("Company Admin, Not Platform Admin (roles)");
    try {
      await addMembership(company.companyId, companyAdminUser.userId, ["company_admin"]);
      await expect(
        asUser(companyAdminUser.userId, (tx) => tx`select * from create_custom_role(${company.companyId}, 'Attempted Role', null, array[]::text[])`),
      ).rejects.toMatchObject(RAISED_EXCEPTION);
    } finally {
      await deleteTestCompany(company.companyId);
      await deleteTestUser(companyAdminUser.userId);
    }
  });

  it("a platform super admin cannot grant a reserved permission to a custom role", async () => {
    const company = await createTestCompany("custom-role-reject-reserved-permission");
    const platformAdmin = await createTestUser("Reserved-Permission Checker");
    try {
      await sql`insert into platform_super_admins (user_id) values (${platformAdmin.userId})`;
      await expect(
        asUser(
          platformAdmin.userId,
          (tx) => tx`select * from create_custom_role(${company.companyId}, 'Would-Be Escalated Role', null, array['company_admin.manage']::text[])`,
        ),
      ).rejects.toMatchObject(RAISED_EXCEPTION);
    } finally {
      await sql`delete from platform_super_admins where user_id = ${platformAdmin.userId}`;
      await deleteTestCompany(company.companyId);
      await deleteTestUser(platformAdmin.userId);
    }
  });

  it("a platform super admin cannot edit or delete a SYSTEM role via the custom-role RPCs", async () => {
    const platformAdmin = await createTestUser("System-Role Protection Checker");
    try {
      await sql`insert into platform_super_admins (user_id) values (${platformAdmin.userId})`;
      const foremanRoleId = await roleId("foreman");

      await expect(
        asUser(platformAdmin.userId, (tx) => tx`select * from update_custom_role_permissions(${foremanRoleId}, array[]::text[])`),
      ).rejects.toMatchObject(RAISED_EXCEPTION);
      await expect(asUser(platformAdmin.userId, (tx) => tx`select * from delete_custom_role(${foremanRoleId})`)).rejects.toMatchObject(RAISED_EXCEPTION);

      const stillExists = await sql`select id from roles where id = ${foremanRoleId}`;
      expect(stillExists.length).toBe(1);
    } finally {
      await sql`delete from platform_super_admins where user_id = ${platformAdmin.userId}`;
      await deleteTestUser(platformAdmin.userId);
    }
  });

  it("two custom roles cannot share the same name within one company", async () => {
    const company = await createTestCompany("custom-role-reject-duplicate-name");
    const platformAdmin = await createTestUser("Duplicate-Name Checker");
    try {
      await sql`insert into platform_super_admins (user_id) values (${platformAdmin.userId})`;
      await asUser(platformAdmin.userId, (tx) => tx`select * from create_custom_role(${company.companyId}, 'Site Auditor', null, array[]::text[])`);
      await expect(
        asUser(platformAdmin.userId, (tx) => tx`select * from create_custom_role(${company.companyId}, 'Site Auditor', null, array[]::text[])`),
      ).rejects.toMatchObject(UNIQUE_VIOLATION);
    } finally {
      await sql`delete from role_permissions where role_id in (select id from roles where company_id = ${company.companyId})`;
      await sql`delete from roles where company_id = ${company.companyId}`;
      await sql`delete from platform_super_admins where user_id = ${platformAdmin.userId}`;
      await deleteTestCompany(company.companyId);
      await deleteTestUser(platformAdmin.userId);
    }
  });

  it("a custom role still assigned to a membership cannot be deleted", async () => {
    const company = await createTestCompany("custom-role-reject-delete-assigned");
    const platformAdmin = await createTestUser("Delete-Guard Checker");
    const holder = await createTestUser("Custom Role Holder");
    try {
      await sql`insert into platform_super_admins (user_id) values (${platformAdmin.userId})`;
      await addMembership(company.companyId, holder.userId, []);
      const [created] = await asUser(
        platformAdmin.userId,
        (tx) => tx`select id from create_custom_role(${company.companyId}, 'Assigned Custom Role', null, array[]::text[])`,
      );
      const membershipId = await getMembershipId(company.companyId, holder.userId);
      await sql`insert into membership_roles (membership_id, role_id, company_id) values (${membershipId}, ${created.id}, ${company.companyId})`;

      await expect(asUser(platformAdmin.userId, (tx) => tx`select * from delete_custom_role(${created.id})`)).rejects.toMatchObject(RAISED_EXCEPTION);
    } finally {
      await sql`delete from membership_roles where company_id = ${company.companyId} and role_id in (select id from roles where company_id = ${company.companyId})`;
      await sql`delete from role_permissions where role_id in (select id from roles where company_id = ${company.companyId})`;
      await sql`delete from roles where company_id = ${company.companyId}`;
      await sql`delete from platform_super_admins where user_id = ${platformAdmin.userId}`;
      await deleteTestCompany(company.companyId);
      await deleteTestUser(platformAdmin.userId);
      await deleteTestUser(holder.userId);
    }
  });

  it("REGRESSION (completion pass fix, 20260901095000): a custom role belonging to Company A cannot be assigned to a membership in Company B, even by that company's own company_admin", async () => {
    const companyA = await createTestCompany("custom-role-scope-fix-owner");
    const companyB = await createTestCompany("custom-role-scope-fix-target");
    const platformAdmin = await createTestUser("Cross-Company Scope Checker");
    const companyBAdmin = await createTestUser("Company B Admin (scope fix)");
    try {
      await sql`insert into platform_super_admins (user_id) values (${platformAdmin.userId})`;
      const [created] = await asUser(
        platformAdmin.userId,
        (tx) => tx`select id from create_custom_role(${companyA.companyId}, 'Company A Only Role', null, array[]::text[])`,
      );
      await addMembership(companyB.companyId, companyBAdmin.userId, ["company_admin"]);
      const membershipId = await getMembershipId(companyB.companyId, companyBAdmin.userId);

      await expect(
        asUser(
          companyBAdmin.userId,
          (tx) => tx`insert into membership_roles (membership_id, role_id, company_id) values (${membershipId}, ${created.id}, ${companyB.companyId})`,
        ),
      ).rejects.toMatchObject(RLS_VIOLATION);
    } finally {
      await sql`delete from role_permissions where role_id in (select id from roles where company_id = ${companyA.companyId})`;
      await sql`delete from roles where company_id = ${companyA.companyId}`;
      await sql`delete from platform_super_admins where user_id = ${platformAdmin.userId}`;
      await deleteTestCompany(companyA.companyId);
      await deleteTestCompany(companyB.companyId);
      await deleteTestUser(platformAdmin.userId);
      await deleteTestUser(companyBAdmin.userId);
    }
  });
});
