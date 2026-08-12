import { describe, it, expect, afterAll } from "vitest";
import { sql, asUser, createTestUser, deleteTestUser, RAISED_EXCEPTION } from "./helpers";

/**
 * Milestone H, item 10: ordinary users must not be able to change their
 * own (or anyone else's) display name — only a Platform Super Admin may,
 * via the dedicated admin_update_profile_name() path. Covers
 * supabase/migrations/20260824090000_lock_down_profile_name_edit.sql
 * directly: validate_profile_update()'s extended full_name freeze, and
 * admin_update_profile_name()'s own is_platform_super_admin() gate.
 */
describe("profile identity invariants (name-edit lockdown)", () => {
  afterAll(async () => {
    await sql.end();
  });

  it("a normal user cannot change their own full_name via a raw client update — even on their own row", async () => {
    const user = await createTestUser("Original Name");

    await expect(asUser(user.userId, (tx) => tx`update profiles set full_name = 'Changed Name' where id = ${user.userId}`)).rejects.toMatchObject(RAISED_EXCEPTION);

    const [profile] = await sql`select full_name from profiles where id = ${user.userId}`;
    expect(profile.full_name).toBe("Original Name");

    await deleteTestUser(user.userId);
  });

  it("re-saving the SAME full_name (a no-op) is not rejected — only an actual change is blocked", async () => {
    const user = await createTestUser("Same Name");

    await asUser(user.userId, (tx) => tx`update profiles set full_name = 'Same Name' where id = ${user.userId}`);

    const [profile] = await sql`select full_name from profiles where id = ${user.userId}`;
    expect(profile.full_name).toBe("Same Name");

    await deleteTestUser(user.userId);
  });

  it("an unrelated safe preference (phone) remains freely self-editable", async () => {
    const user = await createTestUser("Phone Editable User");

    await asUser(user.userId, (tx) => tx`update profiles set phone = '+15551234567' where id = ${user.userId}`);

    const [profile] = await sql`select phone from profiles where id = ${user.userId}`;
    expect(profile.phone).toBe("+15551234567");

    await deleteTestUser(user.userId);
  });

  it("a normal user cannot call admin_update_profile_name — not even on their own row", async () => {
    const user = await createTestUser("Not An Admin");

    await expect(
      asUser(user.userId, (tx) => tx`select * from admin_update_profile_name(${user.userId}, 'Should Not Work')`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);

    await deleteTestUser(user.userId);
  });

  it("a normal user cannot use admin_update_profile_name to rename SOMEONE ELSE either", async () => {
    const attacker = await createTestUser("Attacker");
    const victim = await createTestUser("Victim Name");

    await expect(
      asUser(attacker.userId, (tx) => tx`select * from admin_update_profile_name(${victim.userId}, 'Renamed By Attacker')`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);

    const [profile] = await sql`select full_name from profiles where id = ${victim.userId}`;
    expect(profile.full_name).toBe("Victim Name");

    await deleteTestUser(attacker.userId);
    await deleteTestUser(victim.userId);
  });

  it("a genuine Platform Super Admin CAN change another user's name via admin_update_profile_name — the one dedicated authorized path", async () => {
    const admin = await createTestUser("Test Super Admin");
    const target = await createTestUser("Target Original Name");
    await sql`insert into platform_super_admins (user_id) values (${admin.userId})`;

    const [updated] = await asUser(admin.userId, (tx) => tx`select * from admin_update_profile_name(${target.userId}, 'Target Corrected Name')`);
    expect(updated.full_name).toBe("Target Corrected Name");

    const [profile] = await sql`select full_name from profiles where id = ${target.userId}`;
    expect(profile.full_name).toBe("Target Corrected Name");

    await sql`delete from platform_super_admins where user_id = ${admin.userId}`;
    await deleteTestUser(admin.userId);
    await deleteTestUser(target.userId);
  });

  it("admin_update_profile_name rejects a blank name even for a genuine Platform Super Admin", async () => {
    const admin = await createTestUser("Blank Name Super Admin");
    const target = await createTestUser("Blank Name Target");
    await sql`insert into platform_super_admins (user_id) values (${admin.userId})`;

    await expect(asUser(admin.userId, (tx) => tx`select * from admin_update_profile_name(${target.userId}, '   ')`)).rejects.toMatchObject(RAISED_EXCEPTION);

    await sql`delete from platform_super_admins where user_id = ${admin.userId}`;
    await deleteTestUser(admin.userId);
    await deleteTestUser(target.userId);
  });
});
