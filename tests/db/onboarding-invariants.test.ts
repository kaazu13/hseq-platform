import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { sql, asUser, createTestCompany, deleteTestCompany, createTestUser, deleteTestUser, addMembership, createTestEmployee, createTestProject, RAISED_EXCEPTION } from "./helpers";

/**
 * Onboarding invariants — covers
 * supabase/migrations/20260829090000_onboarding.sql end to end: company
 * creation (platform-super-admin-only), first-admin assignment (both
 * paths), the full invitation lifecycle (create/resend/revoke/accept,
 * expiry, wrong-email rejection, role-escalation rejection), bulk
 * employee import (all-or-nothing, automatic 'member' project
 * assignment), cross-company isolation, and the membership/project-
 * assignment notification triggers. Every scenario here was additionally
 * verified live against the linked remote Supabase project during
 * development — see the final report for that verification's exact
 * results.
 *
 * `accept_invitation()` requires the ACCEPTING account's own real
 * `auth.email()` to match the invitation's email exactly — since
 * `createTestUser()` (helpers.ts) auto-generates a unique email rather
 * than accepting one, every invite-then-accept test here creates the
 * invitee's test user FIRST and then invites that exact generated
 * `.email`, never the reverse.
 */
describe("onboarding invariants", () => {
  let admin: Awaited<ReturnType<typeof createTestUser>>; // company_admin in a pre-existing company, NOT a platform_super_admin
  let existingCompany: Awaited<ReturnType<typeof createTestCompany>>;

  beforeAll(async () => {
    existingCompany = await createTestCompany("onboarding-existing");
    admin = await createTestUser("Onboarding Existing Admin");
    await addMembership(existingCompany.companyId, admin.userId, ["company_admin"]);
  });

  afterAll(async () => {
    await deleteTestCompany(existingCompany.companyId);
    await deleteTestUser(admin.userId);
    await sql.end();
  });

  /** Grants platform_super_admin directly (bypassing RLS as the local superuser test connection) — mirrors the exact live-testing technique used to verify this migration manually (a dedicated identity, never a real account). */
  async function createPlatformAdmin(label: string) {
    const user = await createTestUser(`Platform Admin ${label}`);
    await sql`insert into platform_super_admins (user_id, notes) values (${user.userId}, ${"test fixture — " + label})`;
    return user;
  }

  async function cleanupCompanyWithAuditTrail(companyId: string) {
    // audit_events is unconditionally immutable (prevent_audit_event_mutation
    // rejects UPDATE/DELETE for every role) — a company with any audit
    // trail can't cascade-delete without temporarily disabling those two
    // triggers, exactly as done during this migration's own live testing.
    await sql`alter table audit_events disable trigger audit_events_prevent_update`;
    await sql`alter table audit_events disable trigger audit_events_prevent_delete`;
    await deleteTestCompany(companyId);
    await sql`alter table audit_events enable trigger audit_events_prevent_update`;
    await sql`alter table audit_events enable trigger audit_events_prevent_delete`;
  }

  describe("company creation (item 1)", () => {
    it("a platform super admin can create a company with a safely derived slug and employee number prefix", async () => {
      const platformAdmin = await createPlatformAdmin("create-co");
      const [company] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_company('Onboarding DB Test Co ' || ${randomUUID()}, null, null)`);
      expect(company.status).toBe("active");
      expect(company.slug).toMatch(/^[a-z0-9-]+$/);
      expect(company.employee_number_prefix).toMatch(/^[A-Z0-9]+$/);

      const [auditRow] = await sql`select action, entity_type from audit_events where entity_type = 'company' and entity_id = ${company.id}`;
      expect(auditRow).toMatchObject({ action: "create", entity_type: "company" });

      await cleanupCompanyWithAuditTrail(company.id);
      await deleteTestUser(platformAdmin.userId);
    });

    it("a normal company_admin (NOT a platform super admin) cannot create a company", async () => {
      await expect(asUser(admin.userId, (tx) => tx`select * from create_company('Should Never Exist', null, null)`)).rejects.toMatchObject(RAISED_EXCEPTION);
    });

    it("two companies created with colliding slugs get deduplicated with a numeric suffix", async () => {
      const platformAdmin = await createPlatformAdmin("slug-dedupe");
      const uniqueName = `Slug Collision ${randomUUID()}`;
      const [first] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_company(${uniqueName}, null, null)`);
      const [second] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_company(${uniqueName}, null, null)`);
      expect(first.slug).not.toBe(second.slug);
      expect(second.slug.startsWith(first.slug)).toBe(true);

      await cleanupCompanyWithAuditTrail(first.id);
      await cleanupCompanyWithAuditTrail(second.id);
      await deleteTestUser(platformAdmin.userId);
    });
  });

  describe("first admin assignment (item 2)", () => {
    it("path A: platform_admin_grant_company_membership adds an EXISTING account directly, active immediately, never touching platform_super_admins", async () => {
      const platformAdmin = await createPlatformAdmin("grant-existing");
      const [company] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_company(${"Grant Existing Co " + randomUUID()}, null, null)`);
      const targetUser = await createTestUser("Grant Existing Target");

      const [membership] = await asUser(platformAdmin.userId, (tx) => tx`select * from platform_admin_grant_company_membership(${company.id}, ${targetUser.userId}, ${["company_admin"]})`);
      expect(membership.status).toBe("active");

      const [platformAdminRow] = await sql`select 1 as found from platform_super_admins where user_id = ${targetUser.userId}`;
      expect(platformAdminRow).toBeUndefined();

      await cleanupCompanyWithAuditTrail(company.id);
      await deleteTestUser(platformAdmin.userId);
      await deleteTestUser(targetUser.userId);
    });

    it("path A rejects a normal (non-platform-admin) caller", async () => {
      const platformAdmin = await createPlatformAdmin("grant-reject-setup");
      const [company] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_company(${"Grant Reject Co " + randomUUID()}, null, null)`);
      const targetUser = await createTestUser("Grant Reject Target");

      await expect(asUser(admin.userId, (tx) => tx`select * from platform_admin_grant_company_membership(${company.id}, ${targetUser.userId}, ${["company_admin"]})`)).rejects.toMatchObject(RAISED_EXCEPTION);

      await cleanupCompanyWithAuditTrail(company.id);
      await deleteTestUser(platformAdmin.userId);
      await deleteTestUser(targetUser.userId);
    });
  });

  describe("invitation lifecycle (items 13/14/16)", () => {
    it("create_invitation -> accept_invitation links roles, and (with no employee_id given) creates a new employee from full_name", async () => {
      const platformAdmin = await createPlatformAdmin("invite-accept");
      const [company] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_company(${"Invite Accept Co " + randomUUID()}, null, null)`);
      const invitee = await createTestUser("Jane Doe");

      const [{ token }] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_invitation(${company.id}, ${invitee.email}, 'Jane Doe', ${["company_admin"]}, null, null)`);
      const [result] = await asUser(invitee.userId, (tx) => tx`select accept_invitation(${token}) as result`);
      expect(result.result.company_id).toBe(company.id);
      expect(result.result.role_names).toEqual(["company_admin"]);

      const [membership] = await sql`select status from company_memberships where company_id = ${company.id} and user_id = ${invitee.userId}`;
      expect(membership.status).toBe("active");
      const [employee] = await sql`select first_name, last_name, account_status from employees where company_id = ${company.id} and profile_id = ${invitee.userId}`;
      expect(employee).toMatchObject({ first_name: "Jane", last_name: "Doe", account_status: "active" });

      await cleanupCompanyWithAuditTrail(company.id);
      await deleteTestUser(platformAdmin.userId);
      await deleteTestUser(invitee.userId);
    });

    it("accept_invitation rejects a token whose invitation was sent to a DIFFERENT email than the caller's own", async () => {
      const platformAdmin = await createPlatformAdmin("invite-wrong-email");
      const [company] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_company(${"Invite Wrong Email Co " + randomUUID()}, null, null)`);
      const correctPerson = await createTestUser("Correct Person");
      const wrongPerson = await createTestUser("Wrong Person");

      const [{ token }] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_invitation(${company.id}, ${correctPerson.email}, 'Correct Person', ${["employee"]}, null, null)`);
      await expect(asUser(wrongPerson.userId, (tx) => tx`select accept_invitation(${token})`)).rejects.toMatchObject(RAISED_EXCEPTION);

      await cleanupCompanyWithAuditTrail(company.id);
      await deleteTestUser(platformAdmin.userId);
      await deleteTestUser(correctPerson.userId);
      await deleteTestUser(wrongPerson.userId);
    });

    it("accept_invitation rejects an expired invitation even though its stored status is still pending", async () => {
      const platformAdmin = await createPlatformAdmin("invite-expired");
      const [company] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_company(${"Invite Expired Co " + randomUUID()}, null, null)`);
      const invitee = await createTestUser("Expired Person");

      const [{ invitation, token }] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_invitation(${company.id}, ${invitee.email}, 'Expired Person', ${["employee"]}, null, null)`);
      await sql`update company_invitations set expires_at = now() - interval '1 minute' where id = ${invitation.id}`;

      await expect(asUser(invitee.userId, (tx) => tx`select accept_invitation(${token})`)).rejects.toMatchObject(RAISED_EXCEPTION);

      await cleanupCompanyWithAuditTrail(company.id);
      await deleteTestUser(platformAdmin.userId);
      await deleteTestUser(invitee.userId);
    });

    it("cannot accept the same invitation twice — a second-use of the token is rejected", async () => {
      const platformAdmin = await createPlatformAdmin("invite-double-accept");
      const [company] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_company(${"Invite Double Accept Co " + randomUUID()}, null, null)`);
      const invitee = await createTestUser("Double Accept");

      const [{ token }] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_invitation(${company.id}, ${invitee.email}, 'Double Accept', ${["employee"]}, null, null)`);
      await asUser(invitee.userId, (tx) => tx`select accept_invitation(${token})`);
      await expect(asUser(invitee.userId, (tx) => tx`select accept_invitation(${token})`)).rejects.toMatchObject(RAISED_EXCEPTION);

      await cleanupCompanyWithAuditTrail(company.id);
      await deleteTestUser(platformAdmin.userId);
      await deleteTestUser(invitee.userId);
    });

    it("revoke_invitation blocks acceptance, and resend_invitation rotates the token (the old one stops working)", async () => {
      const platformAdmin = await createPlatformAdmin("invite-revoke-resend");
      const [company] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_company(${"Invite Revoke Resend Co " + randomUUID()}, null, null)`);
      const revokedInvitee = await createTestUser("Revoked Person");
      const resentInvitee = await createTestUser("Resent Person");

      const [{ invitation: revokedInvitation, token: revokedToken }] = await asUser(
        platformAdmin.userId,
        (tx) => tx`select * from create_invitation(${company.id}, ${revokedInvitee.email}, 'Revoked Person', ${["employee"]}, null, null)`,
      );
      await asUser(platformAdmin.userId, (tx) => tx`select * from revoke_invitation(${revokedInvitation.id}, 'no longer needed')`);
      await expect(asUser(revokedInvitee.userId, (tx) => tx`select accept_invitation(${revokedToken})`)).rejects.toMatchObject(RAISED_EXCEPTION);

      const [{ invitation: resendInvitation, token: oldToken }] = await asUser(
        platformAdmin.userId,
        (tx) => tx`select * from create_invitation(${company.id}, ${resentInvitee.email}, 'Resent Person', ${["employee"]}, null, null)`,
      );
      const [{ token: newToken }] = await asUser(platformAdmin.userId, (tx) => tx`select * from resend_invitation(${resendInvitation.id})`);
      expect(newToken).not.toBe(oldToken);
      await expect(asUser(resentInvitee.userId, (tx) => tx`select accept_invitation(${oldToken})`)).rejects.toMatchObject(RAISED_EXCEPTION);
      const [result] = await asUser(resentInvitee.userId, (tx) => tx`select accept_invitation(${newToken}) as result`);
      expect(result.result.company_id).toBe(company.id);

      await cleanupCompanyWithAuditTrail(company.id);
      await deleteTestUser(platformAdmin.userId);
      await deleteTestUser(revokedInvitee.userId);
      await deleteTestUser(resentInvitee.userId);
    });

    it("create_invitation rejects an unknown role name", async () => {
      const platformAdmin = await createPlatformAdmin("invite-unknown-role");
      const [company] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_company(${"Invite Unknown Role Co " + randomUUID()}, null, null)`);
      const someone = await createTestUser("Someone");
      await expect(
        asUser(platformAdmin.userId, (tx) => tx`select * from create_invitation(${company.id}, ${someone.email}, 'Someone', ${["made_up_role"]}, null, null)`),
      ).rejects.toMatchObject(RAISED_EXCEPTION);
      await cleanupCompanyWithAuditTrail(company.id);
      await deleteTestUser(platformAdmin.userId);
      await deleteTestUser(someone.userId);
    });

    it("an operations_manager cannot invite someone as company_admin (privilege escalation rejected), but CAN invite a plain employee", async () => {
      const platformAdmin = await createPlatformAdmin("invite-escalation");
      const [company] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_company(${"Invite Escalation Co " + randomUUID()}, null, null)`);
      const opsUser = await createTestUser("Ops Manager");
      const escalationTarget = await createTestUser("Escalation Attempt");
      const allowedTarget = await createTestUser("Allowed Employee");

      const [{ token: opsToken }] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_invitation(${company.id}, ${opsUser.email}, 'Ops Manager', ${["operations_manager"]}, null, null)`);
      await asUser(opsUser.userId, (tx) => tx`select accept_invitation(${opsToken})`);

      await expect(
        asUser(opsUser.userId, (tx) => tx`select * from create_invitation(${company.id}, ${escalationTarget.email}, 'Escalation Attempt', ${["company_admin"]}, null, null)`),
      ).rejects.toMatchObject(RAISED_EXCEPTION);

      const [allowed] = await asUser(opsUser.userId, (tx) => tx`select * from create_invitation(${company.id}, ${allowedTarget.email}, 'Allowed Employee', ${["employee"]}, null, null)`);
      expect(allowed.invitation.status).toBe("pending");

      await cleanupCompanyWithAuditTrail(company.id);
      await deleteTestUser(platformAdmin.userId);
      await deleteTestUser(opsUser.userId);
      await deleteTestUser(escalationTarget.userId);
      await deleteTestUser(allowedTarget.userId);
    });

    it("a duplicate pending invitation for the same email in the same company is rejected", async () => {
      const platformAdmin = await createPlatformAdmin("invite-duplicate");
      const [company] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_company(${"Invite Duplicate Co " + randomUUID()}, null, null)`);
      const target = await createTestUser("Duplicate Target");
      await asUser(platformAdmin.userId, (tx) => tx`select * from create_invitation(${company.id}, ${target.email}, 'First', ${["employee"]}, null, null)`);
      await expect(asUser(platformAdmin.userId, (tx) => tx`select * from create_invitation(${company.id}, ${target.email}, 'Second', ${["employee"]}, null, null)`)).rejects.toThrow();
      await cleanupCompanyWithAuditTrail(company.id);
      await deleteTestUser(platformAdmin.userId);
      await deleteTestUser(target.userId);
    });

    it("cross-company: an admin of one company cannot invite into a DIFFERENT company they have no role in", async () => {
      const target = await createTestUser("Cross Company Target");
      await expect(
        asUser(admin.userId, (tx) => tx`select * from create_invitation(${randomUUID()}, ${target.email}, 'Cross Company', ${["employee"]}, null, null)`),
      ).rejects.toMatchObject(RAISED_EXCEPTION);
      await deleteTestUser(target.userId);
    });

    it("accepting an invitation with a linked employee_id activates that SAME employee record rather than creating a duplicate", async () => {
      const platformAdmin = await createPlatformAdmin("invite-linked-employee");
      const [company] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_company(${"Invite Linked Employee Co " + randomUUID()}, null, null)`);
      const draftEmployeeId = await createTestEmployee(company.id, null, "Draft", "Employee");
      const invitee = await createTestUser("Draft Employee");

      const [{ token }] = await asUser(
        platformAdmin.userId,
        (tx) => tx`select * from create_invitation(${company.id}, ${invitee.email}, 'Draft Employee', ${["employee"]}, null, ${draftEmployeeId})`,
      );
      const [draftAfterInvite] = await sql`select account_status from employees where id = ${draftEmployeeId}`;
      expect(draftAfterInvite.account_status).toBe("invited");

      await asUser(invitee.userId, (tx) => tx`select accept_invitation(${token})`);

      const employeeRows = await sql`select id, profile_id, account_status from employees where company_id = ${company.id}`;
      expect(employeeRows).toHaveLength(1);
      expect(employeeRows[0]).toMatchObject({ id: draftEmployeeId, profile_id: invitee.userId, account_status: "active" });

      await cleanupCompanyWithAuditTrail(company.id);
      await deleteTestUser(platformAdmin.userId);
      await deleteTestUser(invitee.userId);
    });
  });

  describe("bulk employee import (items 9/10)", () => {
    it("imports a mix of rows with and without email, auto-assigns 'member' project role for all, and only creates invitations for rows with an email", async () => {
      const projectId = await createTestProject(existingCompany.companyId, "Bulk Import Project");
      const loginUser = await createTestUser("Has Login");
      const rows = JSON.stringify([
        { firstName: "No", lastName: "Login", email: null, phone: null, positionTitle: null, roleName: null },
        { firstName: "Has", lastName: "Login", email: loginUser.email, phone: null, positionTitle: null, roleName: "foreman" },
      ]);
      const results = await asUser(admin.userId, (tx) => tx`select * from import_employees_bulk(${existingCompany.companyId}, ${projectId}, ${rows}::jsonb)`);
      expect(results).toHaveLength(2);
      expect(results[0].invitation_id).toBeNull();
      expect(results[1].invitation_id).not.toBeNull();

      const assignments = await sql`select employee_id, assignment_role from project_assignments where project_id = ${projectId} and employee_id in (${results[0].employee_id}, ${results[1].employee_id})`;
      expect(assignments).toHaveLength(2);
      expect(assignments.every((a) => a.assignment_role === "member")).toBe(true);

      await deleteTestUser(loginUser.userId);
    });

    it("is all-or-nothing: one invalid row rolls back every row in the same call", async () => {
      const marker = randomUUID();
      const rows = JSON.stringify([
        { firstName: "Should", lastName: `NotPersist-${marker}`, email: null, phone: null, positionTitle: null, roleName: null },
        { firstName: "", lastName: "MissingFirstName", email: null, phone: null, positionTitle: null, roleName: null },
      ]);
      await expect(asUser(admin.userId, (tx) => tx`select * from import_employees_bulk(${existingCompany.companyId}, null, ${rows}::jsonb)`)).rejects.toThrow();

      const orphaned = await sql`select id from employees where last_name = ${"NotPersist-" + marker}`;
      expect(orphaned).toHaveLength(0);
    });

    it("rejects a caller without EMPLOYEE_WRITE_ROLES", async () => {
      const employeeUser = await createTestUser("Bulk Import Non Manager");
      await addMembership(existingCompany.companyId, employeeUser.userId, ["employee"]);
      const rows = JSON.stringify([{ firstName: "Rejected", lastName: "Row", email: null, phone: null, positionTitle: null, roleName: null }]);
      await expect(asUser(employeeUser.userId, (tx) => tx`select * from import_employees_bulk(${existingCompany.companyId}, null, ${rows}::jsonb)`)).rejects.toMatchObject(RAISED_EXCEPTION);
      await deleteTestUser(employeeUser.userId);
    });
  });

  describe("visibility / isolation", () => {
    it("a member of one company cannot see another company's pending invitations", async () => {
      const platformAdmin = await createPlatformAdmin("isolation-invitations");
      const [otherCompany] = await asUser(platformAdmin.userId, (tx) => tx`select * from create_company(${"Isolation Other Co " + randomUUID()}, null, null)`);
      const isolatedTarget = await createTestUser("Isolated Target");
      await asUser(platformAdmin.userId, (tx) => tx`select * from create_invitation(${otherCompany.id}, ${isolatedTarget.email}, 'Isolated', ${["employee"]}, null, null)`);

      const visible = await asUser(admin.userId, (tx) => tx`select id from company_invitations where company_id = ${otherCompany.id}`);
      expect(visible).toHaveLength(0);

      await cleanupCompanyWithAuditTrail(otherCompany.id);
      await deleteTestUser(platformAdmin.userId);
      await deleteTestUser(isolatedTarget.userId);
    });
  });

  describe("membership/project-assignment notifications (item 24)", () => {
    it("suspending a membership notifies the affected user", async () => {
      const employeeUser = await createTestUser("Notify Suspend Target");
      const membershipId = await addMembership(existingCompany.companyId, employeeUser.userId, ["employee"]);

      await asUser(admin.userId, (tx) => tx`update company_memberships set status = 'suspended' where id = ${membershipId}`);

      const notifications = await sql`select type, title from notifications where recipient_user_id = ${employeeUser.userId} and type = 'company_membership_suspended'`;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe("Company access suspended");

      await deleteTestUser(employeeUser.userId);
    });

    it("adding a project assignment notifies the linked employee, and ending it notifies them again", async () => {
      const projectId = await createTestProject(existingCompany.companyId, "Notify Project Assignment Project");
      const employeeUser = await createTestUser("Notify Assignment Target");
      await addMembership(existingCompany.companyId, employeeUser.userId, ["employee"]);
      const employeeId = await createTestEmployee(existingCompany.companyId, employeeUser.userId, "Notify", "Assignment");

      const [assignment] = await sql`insert into project_assignments (company_id, project_id, employee_id, assignment_role) values (${existingCompany.companyId}, ${projectId}, ${employeeId}, 'member') returning id`;
      const addedNotifications = await sql`select type from notifications where recipient_user_id = ${employeeUser.userId} and type = 'project_assignment_added'`;
      expect(addedNotifications).toHaveLength(1);

      await sql`update project_assignments set end_at = now() where id = ${assignment.id}`;
      const removedNotifications = await sql`select type from notifications where recipient_user_id = ${employeeUser.userId} and type = 'project_assignment_removed'`;
      expect(removedNotifications).toHaveLength(1);

      await deleteTestUser(employeeUser.userId);
    });

    it("re-saving the same membership status is a no-op — no duplicate notification", async () => {
      const employeeUser = await createTestUser("Notify No Duplicate Target");
      const membershipId = await addMembership(existingCompany.companyId, employeeUser.userId, ["employee"]);
      await asUser(admin.userId, (tx) => tx`update company_memberships set status = 'suspended' where id = ${membershipId}`);
      await asUser(admin.userId, (tx) => tx`update company_memberships set status = 'suspended', updated_at = now() where id = ${membershipId}`);

      const notifications = await sql`select id from notifications where recipient_user_id = ${employeeUser.userId} and type = 'company_membership_suspended'`;
      expect(notifications).toHaveLength(1);

      await deleteTestUser(employeeUser.userId);
    });
  });

  describe("offboarding preserves history (items 21/22)", () => {
    it("suspending/removing a membership preserves the employee record and all its history — never a hard delete", async () => {
      const employeeUser = await createTestUser("Offboarding History Target");
      const membershipId = await addMembership(existingCompany.companyId, employeeUser.userId, ["employee"]);
      const employeeId = await createTestEmployee(existingCompany.companyId, employeeUser.userId, "Offboarding", "History");

      await asUser(admin.userId, (tx) => tx`update company_memberships set status = 'removed' where id = ${membershipId}`);

      const [employee] = await sql`select id, archived_at from employees where id = ${employeeId}`;
      expect(employee).toBeDefined();
      expect(employee.archived_at).toBeNull();

      await deleteTestUser(employeeUser.userId);
    });
  });
});
