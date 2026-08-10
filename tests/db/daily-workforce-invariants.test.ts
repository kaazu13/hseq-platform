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
  UNIQUE_VIOLATION,
  FK_VIOLATION,
  RAISED_EXCEPTION,
} from "./helpers";

/**
 * Daily Workforce / Today's Teams invariants — covers
 * supabase/migrations/20260812090000_daily_workforce_and_teams.sql and its
 * fix, 20260815090000_daily_workforce_fixes.sql, directly: attendance
 * gating (an unavailable employee can never be assigned to a team),
 * atomic removal when marking an assigned employee unavailable, the
 * one-open-team-per-(project,date,shift) constraint, the lock/unlock
 * lifecycle, and cross-company/cross-project isolation.
 */
describe("daily workforce invariants", () => {
  let companyA: Awaited<ReturnType<typeof createTestCompany>>;
  let companyB: Awaited<ReturnType<typeof createTestCompany>>;
  let admin: Awaited<ReturnType<typeof createTestUser>>; // company_admin in Company A

  beforeAll(async () => {
    companyA = await createTestCompany("daily-workforce-a");
    companyB = await createTestCompany("daily-workforce-b");
    admin = await createTestUser("Daily Workforce Admin");
    await addMembership(companyA.companyId, admin.userId, ["company_admin"]);
  });

  afterAll(async () => {
    await deleteTestCompany(companyA.companyId);
    await deleteTestCompany(companyB.companyId);
    await deleteTestUser(admin.userId);
    await sql.end();
  });

  it("an employee marked unavailable (e.g. absent) cannot be inserted into a daily team", async () => {
    const projectId = await createTestProject(companyA.companyId, "Attendance Gate Project");
    const employeeId = await createTestEmployee(companyA.companyId, null, "Unavailable", "Employee");
    const workDate = "2026-08-10";

    await asUser(admin.userId, (tx) => tx`select * from set_daily_attendance_status(${projectId}, ${employeeId}, ${workDate}, 'absent')`);

    const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Team A200', 'Day Shift', 'A200', 'Scaffold Assembly')`);

    await expect(
      asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${team.id}, ${employeeId}, 'member')`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("marking an assigned employee absent atomically removes them from today's open team", async () => {
    const projectId = await createTestProject(companyA.companyId, "Atomic Removal Project");
    const employeeId = await createTestEmployee(companyA.companyId, null, "Assigned", "Employee");
    const workDate = "2026-08-10";

    const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Team Removal', 'Day Shift', null, null)`);
    await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${team.id}, ${employeeId}, 'member')`);

    const [openBefore] = await sql`select id from daily_team_members where daily_team_id = ${team.id} and employee_id = ${employeeId} and removed_at is null`;
    expect(openBefore).toBeDefined();

    const [result] = await asUser(admin.userId, (tx) => tx`select * from set_daily_attendance_status(${projectId}, ${employeeId}, ${workDate}, 'absent')`);
    expect(result.removed_from_team_id).toBe(team.id);

    const [row] = await sql`select removed_at from daily_team_members where id = ${openBefore.id}`;
    expect(row.removed_at).not.toBeNull();

    const [attendance] = await sql`select status from daily_attendance where project_id = ${projectId} and employee_id = ${employeeId} and work_date = ${workDate}`;
    expect(attendance.status).toBe("absent");
  });

  it("an employee cannot belong to two teams for the same project/date/shift — moving is atomic close-then-open, never a duplicate open row", async () => {
    const projectId = await createTestProject(companyA.companyId, "One Slot Project");
    const employeeId = await createTestEmployee(companyA.companyId, null, "One", "Slot");
    const workDate = "2026-08-10";

    const [teamAlpha] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Slot Alpha', 'Day Shift', null, null)`);
    const [teamBravo] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Slot Bravo', 'Day Shift', null, null)`);

    await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${teamAlpha.id}, ${employeeId}, 'member')`);
    await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${teamBravo.id}, ${employeeId}, 'member')`);

    const openRows = await sql`select daily_team_id from daily_team_members where project_id = ${projectId} and work_date = ${workDate} and employee_id = ${employeeId} and removed_at is null`;
    expect(openRows).toHaveLength(1);
    expect(openRows[0].daily_team_id).toBe(teamBravo.id);

    // A direct, bypassing-the-RPC duplicate insert into the same open slot is rejected by the partial unique index.
    await expect(
      sql`insert into daily_team_members (company_id, project_id, work_date, daily_team_id, employee_id, role) values (${companyA.companyId}, ${projectId}, ${workDate}, ${teamAlpha.id}, ${employeeId}, 'member')`,
    ).rejects.toMatchObject(UNIQUE_VIOLATION);
  });

  it("locking a day prevents unauthorized modification of team membership and the team's own fields", async () => {
    const projectId = await createTestProject(companyA.companyId, "Lock Project");
    const employeeId = await createTestEmployee(companyA.companyId, null, "Locked", "Member");
    const workDate = "2026-08-10";

    const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Locked Team', 'Day Shift', null, null)`);
    await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${team.id}, ${employeeId}, 'member')`);

    await asUser(admin.userId, (tx) => tx`select * from lock_daily_teams(${projectId}, ${workDate})`);
    const [lockedTeam] = await sql`select status from daily_teams where id = ${team.id}`;
    expect(lockedTeam.status).toBe("locked");

    // Moving the member away (which closes the existing open row) is rejected once locked.
    const [otherTeam] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Other Team', 'Day Shift', null, null)`);
    await expect(
      asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${otherTeam.id}, ${employeeId}, 'member')`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);

    // Editing the locked team's own fields is rejected too.
    await expect(
      asUser(admin.userId, (tx) => tx`select * from save_daily_team(${team.id}, ${projectId}, ${workDate}, 'Renamed While Locked', 'Day Shift', null, null)`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("correcting attendance after a day is locked still works — a locked team's roster stays frozen, but the status itself updates", async () => {
    const projectId = await createTestProject(companyA.companyId, "Locked Attendance Correction Project");
    const employeeId = await createTestEmployee(companyA.companyId, null, "Post", "Lock");
    const workDate = "2026-08-10";

    const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Post Lock Team', 'Day Shift', null, null)`);
    await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${team.id}, ${employeeId}, 'member')`);
    await asUser(admin.userId, (tx) => tx`select * from lock_daily_teams(${projectId}, ${workDate})`);

    // Must not raise, even though the employee's team for this date is locked.
    const [result] = await asUser(admin.userId, (tx) => tx`select * from set_daily_attendance_status(${projectId}, ${employeeId}, ${workDate}, 'absent')`);
    expect(result.removed_from_team_id).toBeNull();

    const [attendance] = await sql`select status from daily_attendance where project_id = ${projectId} and employee_id = ${employeeId} and work_date = ${workDate}`;
    expect(attendance.status).toBe("absent");

    // The locked team's roster is untouched (frozen historical evidence).
    const [membership] = await sql`select removed_at from daily_team_members where daily_team_id = ${team.id} and employee_id = ${employeeId}`;
    expect(membership.removed_at).toBeNull();
  });

  it("unlocking requires a non-blank reason", async () => {
    const projectId = await createTestProject(companyA.companyId, "Unlock Reason Project");
    const workDate = "2026-08-10";
    await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'To Lock', 'Day Shift', null, null)`);
    await asUser(admin.userId, (tx) => tx`select * from lock_daily_teams(${projectId}, ${workDate})`);

    await expect(
      asUser(admin.userId, (tx) => tx`select * from unlock_daily_teams(${projectId}, ${workDate}, '')`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("unlocking (with a reason) reopens the day, preserves the original lock audit fields, and records an audit_events row", async () => {
    const projectId = await createTestProject(companyA.companyId, "Unlock Audit Project");
    const workDate = "2026-08-10";
    const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Unlock Audit Team', 'Day Shift', null, null)`);
    await asUser(admin.userId, (tx) => tx`select * from lock_daily_teams(${projectId}, ${workDate})`);
    const [lockedTeam] = await sql`select locked_at, locked_by from daily_teams where id = ${team.id}`;

    await asUser(admin.userId, (tx) => tx`select * from unlock_daily_teams(${projectId}, ${workDate}, 'Foreman reported a data entry error')`);

    const [unlockedTeam] = await sql`select status, locked_at, locked_by, unlocked_at, unlocked_by, unlock_reason from daily_teams where id = ${team.id}`;
    expect(unlockedTeam.status).toBe("open");
    expect(unlockedTeam.locked_at).toEqual(lockedTeam.locked_at); // original lock audit fields survive unlock
    expect(unlockedTeam.locked_by).toBe(lockedTeam.locked_by);
    expect(unlockedTeam.unlocked_at).not.toBeNull();
    expect(unlockedTeam.unlock_reason).toBe("Foreman reported a data entry error");

    const [auditRow] = await sql`select action, entity_type from audit_events where entity_type = 'daily_teams_day' and entity_id = ${projectId} order by created_at desc limit 1`;
    expect(auditRow).toBeDefined();
  });

  it("archive reproduces historical team membership — a locked day's roster is exactly reconstructable from daily_team_members", async () => {
    const projectId = await createTestProject(companyA.companyId, "Archive Reproduction Project");
    const employeeOne = await createTestEmployee(companyA.companyId, null, "Archive", "One");
    const employeeTwo = await createTestEmployee(companyA.companyId, null, "Archive", "Two");
    const workDate = "2026-08-10";

    const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Archive Team', 'Day Shift', 'A200', 'Scaffold Assembly')`);
    await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${team.id}, ${employeeOne}, 'foreman')`);
    await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${team.id}, ${employeeTwo}, 'member')`);
    await asUser(admin.userId, (tx) => tx`select * from lock_daily_teams(${projectId}, ${workDate})`);

    const members = await sql`select employee_id, role from daily_team_members where daily_team_id = ${team.id} and removed_at is null order by role`;
    expect(members).toHaveLength(2);
    expect(members.map((m) => m.employee_id).sort()).toEqual([employeeOne, employeeTwo].sort());

    const [archivedTeam] = await sql`select name, shift, work_area, activity, status from daily_teams where id = ${team.id}`;
    expect(archivedTeam).toMatchObject({ name: "Archive Team", shift: "Day Shift", work_area: "A200", activity: "Scaffold Assembly", status: "locked" });
  });

  it("cross-company daily_teams/daily_attendance rows fail at the database level (composite FK)", async () => {
    const projectInA = await createTestProject(companyA.companyId, "Cross Company Project");
    await expect(
      sql`insert into daily_teams (company_id, project_id, work_date, name) values (${companyB.companyId}, ${projectInA}, '2026-08-10', 'Cross Company Team')`,
    ).rejects.toMatchObject(FK_VIOLATION);

    const employeeInA = await createTestEmployee(companyA.companyId, null, "Cross", "Company");
    await expect(
      sql`insert into daily_attendance (company_id, project_id, employee_id, work_date, status) values (${companyB.companyId}, ${projectInA}, ${employeeInA}, '2026-08-10', 'present')`,
    ).rejects.toMatchObject(FK_VIOLATION);
  });

  it("two daily teams cannot share the same (project, date, name) — the same-day name-uniqueness constraint", async () => {
    const projectId = await createTestProject(companyA.companyId, "Duplicate Name Project");
    const workDate = "2026-08-10";
    await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Duplicate Name', 'Day Shift', null, null)`);

    await expect(
      sql`insert into daily_teams (company_id, project_id, work_date, name) values (${companyA.companyId}, ${projectId}, ${workDate}, 'Duplicate Name')`,
    ).rejects.toMatchObject(UNIQUE_VIOLATION);
  });

  it("an employee sees only their own daily_attendance row (RLS), never another employee's", async () => {
    const projectId = await createTestProject(companyA.companyId, "Own Attendance RLS Project");
    const employeeUser = await createTestUser("Own Attendance Employee");
    await addMembership(companyA.companyId, employeeUser.userId, ["employee"]);
    const employeeId = await createTestEmployee(companyA.companyId, employeeUser.userId, "Own", "View");
    const otherEmployeeId = await createTestEmployee(companyA.companyId, null, "Other", "Employee");
    const workDate = "2026-08-10";

    await asUser(admin.userId, (tx) => tx`select * from set_daily_attendance_status(${projectId}, ${employeeId}, ${workDate}, 'present')`);
    await asUser(admin.userId, (tx) => tx`select * from set_daily_attendance_status(${projectId}, ${otherEmployeeId}, ${workDate}, 'sick')`);

    const visible = await asUser(employeeUser.userId, (tx) => tx`select employee_id from daily_attendance where project_id = ${projectId} and work_date = ${workDate}`);
    expect(visible.map((r) => r.employee_id)).toEqual([employeeId]);

    await deleteTestUser(employeeUser.userId);
  });
});
