import { describe, it, expect, afterAll } from "vitest";
import { sql, asUser, createTestCompany, deleteTestCompany, createTestUser, deleteTestUser, addMembership } from "./helpers";

/**
 * Post-audit implementation package, Part 1 — Platform Super Admin
 * regression coverage. `platform_super_admins` is a completely separate
 * table from `company_memberships`/`membership_roles` (see
 * supabase/migrations/20260819095000_platform_admin.sql) — there is no FK
 * or mutual-exclusion constraint between them by construction, so a real
 * account (e.g. cristi.3ddd@gmail.com, verified live this session to
 * already hold company_admin in two companies AND a platform_super_admins
 * grant since 2026-08-11) can legitimately hold both simultaneously. This
 * test proves that live fact holds structurally, not just anecdotally for
 * one account: the platform grant is unaffected by company memberships,
 * and vice versa, and both checks are genuinely server/database-backed
 * (is_platform_super_admin()/is_company_member() — not UI-only).
 */
describe("platform super admin coexists with ordinary company memberships", () => {
  afterAll(async () => {
    await sql.end();
  });

  it("a user can hold platform_super_admin AND an active company_admin membership at the same time, and both checks are independently true", async () => {
    const company = await createTestCompany("platform-admin-coexist");
    const user = await createTestUser("Coexisting Admin");

    try {
      await addMembership(company.companyId, user.userId, ["company_admin"]);

      // Direct insert (mirrors the documented "no service_role INSERT grant
      // on platform_super_admins — superuser-only" path this session's
      // audit relied on repeatedly for test-fixture setup).
      await sql`insert into platform_super_admins (user_id) values (${user.userId})`;

      const [isPlatformAdmin] = await asUser(user.userId, (tx) => tx`select is_platform_super_admin() as result`);
      expect(isPlatformAdmin.result).toBe(true);

      const [isCompanyMember] = await asUser(user.userId, (tx) => tx`select is_company_member(${company.companyId}) as result`);
      expect(isCompanyMember.result).toBe(true);

      const [hasCompanyAdminRole] = await asUser(user.userId, (tx) => tx`select has_company_role(${company.companyId}, 'company_admin') as result`);
      expect(hasCompanyAdminRole.result).toBe(true);

      // Revoking the platform grant must not touch the company membership at all.
      await sql`delete from platform_super_admins where user_id = ${user.userId}`;
      const [stillCompanyMember] = await asUser(user.userId, (tx) => tx`select is_company_member(${company.companyId}) as result`);
      expect(stillCompanyMember.result).toBe(true);
      const [noLongerPlatformAdmin] = await asUser(user.userId, (tx) => tx`select is_platform_super_admin() as result`);
      expect(noLongerPlatformAdmin.result).toBe(false);
    } finally {
      await sql`delete from platform_super_admins where user_id = ${user.userId}`;
      await deleteTestCompany(company.companyId);
      await deleteTestUser(user.userId);
    }
  });

  it("suspending the account's account_status blocks BOTH the platform grant and the company membership identically (the account_status RLS fix applies uniformly, not just to company access)", async () => {
    const company = await createTestCompany("platform-admin-suspend-coexist");
    const user = await createTestUser("Suspended Coexisting Admin");

    try {
      await addMembership(company.companyId, user.userId, ["company_admin"]);
      await sql`insert into platform_super_admins (user_id) values (${user.userId})`;

      await sql`update profiles set account_status = 'suspended', account_status_changed_at = now() where id = ${user.userId}`;

      const [isPlatformAdmin] = await asUser(user.userId, (tx) => tx`select is_platform_super_admin() as result`);
      expect(isPlatformAdmin.result).toBe(false);
      const [isCompanyMember] = await asUser(user.userId, (tx) => tx`select is_company_member(${company.companyId}) as result`);
      expect(isCompanyMember.result).toBe(false);

      await sql`update profiles set account_status = 'active', account_status_changed_at = now() where id = ${user.userId}`;
      const [restoredPlatformAdmin] = await asUser(user.userId, (tx) => tx`select is_platform_super_admin() as result`);
      expect(restoredPlatformAdmin.result).toBe(true);
    } finally {
      await sql`delete from platform_super_admins where user_id = ${user.userId}`;
      await deleteTestCompany(company.companyId);
      await deleteTestUser(user.userId);
    }
  });
});
