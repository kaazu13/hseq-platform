import { describe, it, expect, afterAll } from "vitest";
import { sql, asUser, createTestCompany, deleteTestCompany, createTestUser, deleteTestUser, addMembership } from "./helpers";

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
