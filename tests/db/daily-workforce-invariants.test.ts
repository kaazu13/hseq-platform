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
  createTestTeam,
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

    const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Team A200', 'day', 'A200', 'Scaffold Assembly')`);

    await expect(
      asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${team.id}, ${employeeId}, 'member')`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("marking an assigned employee absent atomically removes them from today's open team", async () => {
    const projectId = await createTestProject(companyA.companyId, "Atomic Removal Project");
    const employeeId = await createTestEmployee(companyA.companyId, null, "Assigned", "Employee");
    const workDate = "2026-08-10";

    const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Team Removal', 'day', null, null)`);
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

    const [teamAlpha] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Slot Alpha', 'day', null, null)`);
    const [teamBravo] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Slot Bravo', 'day', null, null)`);

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

    const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Locked Team', 'day', null, null)`);
    await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${team.id}, ${employeeId}, 'member')`);

    await asUser(admin.userId, (tx) => tx`select * from lock_daily_teams(${projectId}, ${workDate})`);
    const [lockedTeam] = await sql`select status from daily_teams where id = ${team.id}`;
    expect(lockedTeam.status).toBe("locked");

    // Moving the member away (which closes the existing open row) is rejected once locked.
    const [otherTeam] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Other Team', 'day', null, null)`);
    await expect(
      asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${otherTeam.id}, ${employeeId}, 'member')`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);

    // Editing the locked team's own fields is rejected too.
    await expect(
      asUser(admin.userId, (tx) => tx`select * from save_daily_team(${team.id}, ${projectId}, ${workDate}, 'Renamed While Locked', 'day', null, null)`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("correcting attendance after a day is locked still works — a locked team's roster stays frozen, but the status itself updates", async () => {
    const projectId = await createTestProject(companyA.companyId, "Locked Attendance Correction Project");
    const employeeId = await createTestEmployee(companyA.companyId, null, "Post", "Lock");
    const workDate = "2026-08-10";

    const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Post Lock Team', 'day', null, null)`);
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
    await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'To Lock', 'day', null, null)`);
    await asUser(admin.userId, (tx) => tx`select * from lock_daily_teams(${projectId}, ${workDate})`);

    await expect(
      asUser(admin.userId, (tx) => tx`select * from unlock_daily_teams(${projectId}, ${workDate}, '')`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("unlocking (with a reason) reopens the day, preserves the original lock audit fields, and records an audit_events row", async () => {
    const projectId = await createTestProject(companyA.companyId, "Unlock Audit Project");
    const workDate = "2026-08-10";
    const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Unlock Audit Team', 'day', null, null)`);
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

  it("archive reproduces historical team state — a locked day's foreman (direct column) and worker roster (daily_team_members) are exactly reconstructable", async () => {
    const projectId = await createTestProject(companyA.companyId, "Archive Reproduction Project");
    const foreman = await createTestForeman(companyA.companyId, projectId, "Archive", "Foreman");
    const employeeTwo = await createTestEmployee(companyA.companyId, null, "Archive", "Two");
    const workDate = "2026-08-10";

    await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${foreman.employeeId})`);
    const [team] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${foreman.employeeId}, 'Archive Team', 'day', 'A200', 'Scaffold Assembly')`);
    await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${team.id}, ${employeeTwo}, 'member')`);
    await asUser(admin.userId, (tx) => tx`select * from lock_daily_teams(${projectId}, ${workDate})`);

    const members = await sql`select employee_id, role from daily_team_members where daily_team_id = ${team.id} and removed_at is null`;
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ employee_id: employeeTwo, role: "member" });

    const [archivedTeam] = await sql`select name, shift, work_area, activity, status, foreman_employee_id from daily_teams where id = ${team.id}`;
    expect(archivedTeam).toMatchObject({ name: "Archive Team", shift: "Day Shift", work_area: "A200", activity: "Scaffold Assembly", status: "locked", foreman_employee_id: foreman.employeeId });

    await deleteTestUser(foreman.userId);
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
    await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Duplicate Name', 'day', null, null)`);

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

  /** Creates an employee who genuinely holds the project's Foreman role — company-wide `foreman` membership role AND an open team_assignments row with assignment_role='foreman' on the project, exactly what is_eligible_scaffold_foreman() checks (reused, not reinvented, by items 7/8/9). */
  async function createTestForeman(companyId: string, projectId: string, firstName: string, lastName: string) {
    const user = await createTestUser(`${firstName} ${lastName}`);
    await addMembership(companyId, user.userId, ["foreman"]);
    const employeeId = await createTestEmployee(companyId, user.userId, firstName, lastName);
    const teamId = await createTestTeam(companyId, projectId, `${firstName} Legacy Team`);
    await sql`insert into team_assignments (company_id, project_id, team_id, employee_id, assignment_role) values (${companyId}, ${projectId}, ${teamId}, ${employeeId}, 'foreman')`;
    return { userId: user.userId, employeeId };
  }

  it("item 7: list_eligible_scaffold_foremen only returns employees who genuinely hold the project's Foreman role", async () => {
    const projectId = await createTestProject(companyA.companyId, "Foreman Eligibility Project");
    const foreman = await createTestForeman(companyA.companyId, projectId, "Real", "Foreman");
    const plainEmployeeId = await createTestEmployee(companyA.companyId, null, "Plain", "Worker");

    const eligible = await asUser(admin.userId, (tx) => tx`select id from list_eligible_scaffold_foremen(${companyA.companyId}, ${projectId})`);
    const eligibleIds = eligible.map((row) => row.id);
    expect(eligibleIds).toContain(foreman.employeeId);
    expect(eligibleIds).not.toContain(plainEmployeeId);

    await deleteTestUser(foreman.userId);
  });

  it("item 7: assigning a non-foreman employee as the 'foreman' role on a daily team is rejected at the database level", async () => {
    const projectId = await createTestProject(companyA.companyId, "Foreman Role Enforcement Project");
    const plainEmployeeId = await createTestEmployee(companyA.companyId, null, "Not", "AForeman");
    const workDate = "2026-08-20";

    const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Team Enforcement', 'day', null, null)`);

    await expect(
      asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${team.id}, ${plainEmployeeId}, 'foreman')`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("milestone G, item 5: create_daily_team_for_foreman requires a valid shift, an eligible foreman, and that foreman already on today's roster, atomically", async () => {
    const projectId = await createTestProject(companyA.companyId, "Atomic Team Creation Project");
    const foreman = await createTestForeman(companyA.companyId, projectId, "Atomic", "Foreman");
    const plainEmployeeId = await createTestEmployee(companyA.companyId, null, "Ineligible", "Foreman");
    const workDate = "2026-08-20";

    // Missing shift.
    await expect(
      asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${foreman.employeeId}, 'No Shift Team', null, null, null)`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);

    // Non-eligible foreman.
    await expect(
      asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${plainEmployeeId}, 'Bad Foreman Team', 'day', null, null)`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);

    // Eligible foreman, but not yet on today's roster.
    await expect(
      asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${foreman.employeeId}, 'Not Rostered Team', 'day', null, null)`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);

    // No team was left behind by any failed attempt (atomicity).
    const orphaned = await sql`select id from daily_teams where project_id = ${projectId} and work_date = ${workDate}`;
    expect(orphaned).toHaveLength(0);

    // Once rostered, creation succeeds and the foreman is immediately assigned via the direct column.
    await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${foreman.employeeId})`);
    const [team] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${foreman.employeeId}, 'Valid Team', 'day', 'A1', 'Assembly')`);
    expect(team.foreman_employee_id).toBe(foreman.employeeId);

    await deleteTestUser(foreman.userId);
  });

  it("milestone G, item 2: a Foreman already running one team may head ANOTHER team in the same project/date/shift — the corrected model", async () => {
    const projectId = await createTestProject(companyA.companyId, "Foreman Multi-Team Project");
    const foreman = await createTestForeman(companyA.companyId, projectId, "Multi", "Team");
    const workDate = "2026-08-20";

    await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${foreman.employeeId})`);
    const [teamOne] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${foreman.employeeId}, 'Team One', 'day', null, null)`);
    const [teamThree] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${foreman.employeeId}, 'Team Three', 'day', null, null)`);
    const [teamFour] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${foreman.employeeId}, 'Team Four', 'day', null, null)`);

    const teams = await sql`select id, foreman_employee_id from daily_teams where project_id = ${projectId} and work_date = ${workDate}`;
    expect(teams).toHaveLength(3);
    expect(teams.every((t) => t.foreman_employee_id === foreman.employeeId)).toBe(true);
    expect([teamOne.id, teamThree.id, teamFour.id].sort()).toEqual(teams.map((t) => t.id).sort());

    await deleteTestUser(foreman.userId);
  });

  describe("milestone G, item 4: add_daily_team_foreman / remove_daily_team_foreman — the daily Foreman roster", () => {
    it("adds an eligible foreman without creating any team", async () => {
      const projectId = await createTestProject(companyA.companyId, "Add Foreman Project");
      const foreman = await createTestForeman(companyA.companyId, projectId, "Roster", "Only");
      const workDate = "2026-08-20";

      const [row] = await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${foreman.employeeId})`);
      expect(row.foreman_employee_id).toBe(foreman.employeeId);

      const teams = await sql`select id from daily_teams where project_id = ${projectId} and work_date = ${workDate}`;
      expect(teams).toHaveLength(0);

      await deleteTestUser(foreman.userId);
    });

    it("rejects an employee who is not an eligible foreman", async () => {
      const projectId = await createTestProject(companyA.companyId, "Add Foreman Invalid Project");
      const plainEmployeeId = await createTestEmployee(companyA.companyId, null, "Not", "Eligible");
      const workDate = "2026-08-20";

      await expect(
        asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${plainEmployeeId})`),
      ).rejects.toMatchObject(RAISED_EXCEPTION);
    });

    it("rejects adding the same foreman twice for the same day", async () => {
      const projectId = await createTestProject(companyA.companyId, "Add Foreman Duplicate Project");
      const foreman = await createTestForeman(companyA.companyId, projectId, "Duplicate", "Add");
      const workDate = "2026-08-20";

      await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${foreman.employeeId})`);
      await expect(
        asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${foreman.employeeId})`),
      ).rejects.toMatchObject(RAISED_EXCEPTION);

      await deleteTestUser(foreman.userId);
    });

    it("rejects adding a foreman marked unavailable (e.g. absent) today", async () => {
      const projectId = await createTestProject(companyA.companyId, "Add Foreman Unavailable Project");
      const foreman = await createTestForeman(companyA.companyId, projectId, "Absent", "Today");
      const workDate = "2026-08-20";
      await asUser(admin.userId, (tx) => tx`select * from set_daily_attendance_status(${projectId}, ${foreman.employeeId}, ${workDate}, 'absent')`);

      await expect(
        asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${foreman.employeeId})`),
      ).rejects.toMatchObject(RAISED_EXCEPTION);

      await deleteTestUser(foreman.userId);
    });

    it("remove_daily_team_foreman refuses while the foreman still has a team, then succeeds once teams are gone", async () => {
      const projectId = await createTestProject(companyA.companyId, "Remove Foreman Project");
      const foreman = await createTestForeman(companyA.companyId, projectId, "Remove", "Me");
      const workDate = "2026-08-20";
      await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${foreman.employeeId})`);
      const [team] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${foreman.employeeId}, 'Team', 'day', null, null)`);

      await expect(
        asUser(admin.userId, (tx) => tx`select * from remove_daily_team_foreman(${projectId}, ${workDate}, ${foreman.employeeId})`),
      ).rejects.toMatchObject(RAISED_EXCEPTION);

      await sql`delete from daily_teams where id = ${team.id}`;
      await asUser(admin.userId, (tx) => tx`select * from remove_daily_team_foreman(${projectId}, ${workDate}, ${foreman.employeeId})`);

      const rosterRows = await sql`select id from daily_team_foreman_roster where project_id = ${projectId} and work_date = ${workDate} and foreman_employee_id = ${foreman.employeeId}`;
      expect(rosterRows).toHaveLength(0);

      await deleteTestUser(foreman.userId);
    });
  });

  it("item 4: reorder_daily_teams changes display_order only — never membership, shift, foreman, or work_area/activity", async () => {
    const projectId = await createTestProject(companyA.companyId, "Reorder Project");
    const foreman = await createTestForeman(companyA.companyId, projectId, "Reorder", "Foreman");
    const workDate = "2026-08-20";
    await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${foreman.employeeId})`);

    const [teamA] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${foreman.employeeId}, 'Reorder A', 'day', 'AreaA', 'ActivityA')`);
    const [teamB] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Reorder B', 'day', 'AreaB', 'ActivityB')`);

    expect(teamA.display_order).toBe(0);
    expect(teamB.display_order).toBe(1);

    await asUser(admin.userId, (tx) => tx`select * from reorder_daily_teams(${projectId}, ${workDate}, ${[teamB.id, teamA.id]})`);

    const [reorderedA] = await sql`select display_order, name, shift, work_area, activity, foreman_employee_id from daily_teams where id = ${teamA.id}`;
    const [reorderedB] = await sql`select display_order, name, shift, work_area, activity from daily_teams where id = ${teamB.id}`;
    expect(reorderedB.display_order).toBe(0);
    expect(reorderedA.display_order).toBe(1);
    // Every other field is byte-for-byte unchanged.
    expect(reorderedA).toMatchObject({ name: "Reorder A", shift: "day", work_area: "AreaA", activity: "ActivityA", foreman_employee_id: foreman.employeeId });
    expect(reorderedB).toMatchObject({ name: "Reorder B", shift: "day", work_area: "AreaB", activity: "ActivityB" });

    await deleteTestUser(foreman.userId);
  });

  it("item 6: a worker already assigned to one team is rejected by a raw duplicate insert into a second team for the same slot, even bypassing move_daily_team_member() entirely", async () => {
    const projectId = await createTestProject(companyA.companyId, "Raw Insert Double Assignment Project");
    const employeeId = await createTestEmployee(companyA.companyId, null, "Raw", "Insert");
    const workDate = "2026-08-20";

    const [teamA] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Raw A', 'day', null, null)`);
    const [teamB] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Raw B', 'day', null, null)`);
    await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${teamA.id}, ${employeeId}, 'member')`);

    await expect(
      sql`insert into daily_team_members (company_id, project_id, work_date, daily_team_id, employee_id, role) values (${companyA.companyId}, ${projectId}, ${workDate}, ${teamB.id}, ${employeeId}, 'member')`,
    ).rejects.toMatchObject(UNIQUE_VIOLATION);
  });

  it("item 5: an LMRA created with a daily_team_id is precisely linked — a different team on the same project/day is never marked complete", async () => {
    const projectId = await createTestProject(companyA.companyId, "LMRA Link Project");
    const worker = await createTestUser("LMRA Link Worker");
    await addMembership(companyA.companyId, worker.userId, ["employee"]);
    const workerEmployeeId = await createTestEmployee(companyA.companyId, worker.userId, "LMRA", "LinkWorker");
    await sql`insert into project_assignments (company_id, project_id, employee_id, assignment_role) values (${companyA.companyId}, ${projectId}, ${workerEmployeeId}, 'member')`;
    const workDate = "2026-08-20";

    const [teamWithLmra] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Has LMRA', 'day', null, null)`);
    const [teamWithoutLmra] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'No LMRA', 'day', null, null)`);

    const hazardTypes = [
      "working_at_height", "falling_objects", "line_of_fire", "manual_material_handling", "lifting_operations",
      "mobile_equipment_mewp", "weather_conditions", "access_egress", "housekeeping", "tools_equipment",
      "simultaneous_operations", "other",
    ];
    const hazards = hazardTypes.map((hazard_type) => ({
      hazard_type,
      is_applicable: false,
      controls: null,
      selected_controls: [],
      responsible_person_id: null,
      controls_confirmed: false,
      other_description: null,
    }));

    const [assessment] = await asUser(
      worker.userId,
      (tx) =>
        tx`select * from create_lmra_assessment(${companyA.companyId}, ${projectId}, 'Area 1', 'Activity 1', ${workDate}, 'day', ${workerEmployeeId}, null, null, ${[]}, ${JSON.stringify(hazards)}::jsonb, false, 'go', null, ${teamWithLmra.id})`,
    );
    expect(assessment.daily_team_id).toBe(teamWithLmra.id);

    const linked = await sql`select id, daily_team_id from lmra_assessments where daily_team_id = ${teamWithLmra.id} and archived_at is null`;
    expect(linked.map((row) => row.id)).toContain(assessment.id);

    const linkedToOther = await sql`select id from lmra_assessments where daily_team_id = ${teamWithoutLmra.id} and archived_at is null`;
    expect(linkedToOther).toHaveLength(0);

    await deleteTestUser(worker.userId);
  });

  /**
   * Milestone F, item 1/9/10: update_daily_team_with_foreman() — the ONE
   * atomic edit path behind the Edit Team dialog. Covers: field persistence
   * (name/work_area/activity), foreman swap (old foreman removed, never
   * demoted to a plain worker; new eligible foreman assigned), rejection of
   * an ineligible foreman, atomic rejection of a shift change that would
   * collide with another team's current member, and the locked-team freeze.
   */
  describe("update_daily_team_with_foreman — item 1/9", () => {
    it("persists name, work area, and activity", async () => {
      const projectId = await createTestProject(companyA.companyId, "Edit Fields Project");
      const workDate = "2026-08-20";
      const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Original Name', 'day', 'Old Area', 'Old Activity')`);

      const [updated] = await asUser(
        admin.userId,
        (tx) => tx`select * from update_daily_team_with_foreman(${team.id}, ${projectId}, ${workDate}, 'Renamed Team', 'day', null, 'New Area', 'New Activity')`,
      );
      expect(updated).toMatchObject({ name: "Renamed Team", work_area: "New Area", activity: "New Activity" });
    });

    it("swaps the foreman atomically (direct column) — the old foreman is never touched as a worker; the new foreman is assigned and may already run another team", async () => {
      const projectId = await createTestProject(companyA.companyId, "Foreman Swap Project");
      const workDate = "2026-08-20";
      const oldForeman = await createTestForeman(companyA.companyId, projectId, "Old", "Foreman");
      const newForeman = await createTestForeman(companyA.companyId, projectId, "New", "Foreman");
      await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${oldForeman.employeeId})`);
      // The new foreman already runs a DIFFERENT team — swapping them onto this one must not be blocked by that.
      await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${newForeman.employeeId})`);
      const [otherTeam] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${newForeman.employeeId}, 'New Foreman Other Team', 'day', null, null)`);

      const [team] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${oldForeman.employeeId}, 'Swap Team', 'day', null, null)`);

      await asUser(admin.userId, (tx) => tx`select * from update_daily_team_with_foreman(${team.id}, ${projectId}, ${workDate}, 'Swap Team', 'day', ${newForeman.employeeId}, null, null)`);

      const [updatedTeam] = await sql`select foreman_employee_id from daily_teams where id = ${team.id}`;
      expect(updatedTeam.foreman_employee_id).toBe(newForeman.employeeId);

      // The old foreman never appears as a daily_team_members row (they were never a "worker" of this team).
      const oldForemanRows = await sql`select id from daily_team_members where daily_team_id = ${team.id} and employee_id = ${oldForeman.employeeId}`;
      expect(oldForemanRows).toHaveLength(0);

      // The new foreman's OTHER team is completely unaffected.
      const [otherTeamRow] = await sql`select foreman_employee_id from daily_teams where id = ${otherTeam.id}`;
      expect(otherTeamRow.foreman_employee_id).toBe(newForeman.employeeId);

      await deleteTestUser(oldForeman.userId);
      await deleteTestUser(newForeman.userId);
    });

    it("a null foremanEmployeeId leaves existing foreman assignment untouched (the legacy/repair-safe path)", async () => {
      const projectId = await createTestProject(companyA.companyId, "Foreman Untouched Project");
      const workDate = "2026-08-20";
      const foreman = await createTestForeman(companyA.companyId, projectId, "Untouched", "Foreman");
      await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${foreman.employeeId})`);
      const [team] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${foreman.employeeId}, 'Untouched Team', 'day', null, null)`);

      await asUser(admin.userId, (tx) => tx`select * from update_daily_team_with_foreman(${team.id}, ${projectId}, ${workDate}, 'Renamed Only', 'day', null, null, null)`);

      const [row] = await sql`select foreman_employee_id from daily_teams where id = ${team.id}`;
      expect(row.foreman_employee_id).toBe(foreman.employeeId);

      await deleteTestUser(foreman.userId);
    });

    it("changing the Foreman auto-adds them to today's roster if they weren't already on it", async () => {
      const projectId = await createTestProject(companyA.companyId, "Foreman Auto Roster Project");
      const workDate = "2026-08-20";
      const foreman = await createTestForeman(companyA.companyId, projectId, "AutoAdd", "Foreman");
      const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Auto Roster Team', 'day', null, null)`);

      await asUser(admin.userId, (tx) => tx`select * from update_daily_team_with_foreman(${team.id}, ${projectId}, ${workDate}, 'Auto Roster Team', 'day', ${foreman.employeeId}, null, null)`);

      const rosterRows = await sql`select id from daily_team_foreman_roster where project_id = ${projectId} and work_date = ${workDate} and foreman_employee_id = ${foreman.employeeId}`;
      expect(rosterRows).toHaveLength(1);

      await deleteTestUser(foreman.userId);
    });

    it("rejects an employee who does not hold the project's foreman role", async () => {
      const projectId = await createTestProject(companyA.companyId, "Invalid Foreman Edit Project");
      const workDate = "2026-08-20";
      const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Invalid Foreman Team', 'day', null, null)`);
      const plainEmployeeId = await createTestEmployee(companyA.companyId, null, "Not", "Eligible");

      await expect(
        asUser(admin.userId, (tx) => tx`select * from update_daily_team_with_foreman(${team.id}, ${projectId}, ${workDate}, 'Invalid Foreman Team', 'day', ${plainEmployeeId}, null, null)`),
      ).rejects.toMatchObject(RAISED_EXCEPTION);
    });

    it("rejects a shift change that would conflict with another team's current member, atomically — nothing is partially updated, and the conflicting worker is unaffected", async () => {
      const projectId = await createTestProject(companyA.companyId, "Shift Conflict Project");
      const workDate = "2026-08-20";
      const worker = await createTestEmployee(companyA.companyId, null, "Conflict", "Worker");

      const [teamDay] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Day Team', 'day', null, null)`);
      const [teamNight] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Night Team', 'night', null, null)`);
      await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${teamDay.id}, ${worker}, 'member')`);
      await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${teamNight.id}, ${worker}, 'member')`);

      // Attempting to change the Night team to 'day' would collide with the worker's existing Day Team membership.
      await expect(
        asUser(admin.userId, (tx) => tx`select * from update_daily_team_with_foreman(${teamNight.id}, ${projectId}, ${workDate}, 'Night Team', 'day', null, null, null)`),
      ).rejects.toMatchObject(RAISED_EXCEPTION);

      // Nothing partially applied: the Night team's shift is unchanged, and the worker's two memberships are untouched.
      const [unchangedTeam] = await sql`select shift from daily_teams where id = ${teamNight.id}`;
      expect(unchangedTeam.shift).toBe("night");
      const openRows = await sql`select daily_team_id from daily_team_members where project_id = ${projectId} and work_date = ${workDate} and employee_id = ${worker} and removed_at is null`;
      expect(openRows.map((r) => r.daily_team_id).sort()).toEqual([teamDay.id, teamNight.id].sort());
    });

    it("a successful shift change resyncs every current member's denormalized shift to match", async () => {
      const projectId = await createTestProject(companyA.companyId, "Shift Resync Project");
      const workDate = "2026-08-20";
      const worker = await createTestEmployee(companyA.companyId, null, "Resync", "Worker");
      const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Resync Team', 'day', null, null)`);
      await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${team.id}, ${worker}, 'member')`);

      await asUser(admin.userId, (tx) => tx`select * from update_daily_team_with_foreman(${team.id}, ${projectId}, ${workDate}, 'Resync Team', 'late', null, null, null)`);

      const [row] = await sql`select shift from daily_team_members where daily_team_id = ${team.id} and employee_id = ${worker} and removed_at is null`;
      expect(row.shift).toBe("late");
    });

    it("a locked team cannot be edited via update_daily_team_with_foreman", async () => {
      const projectId = await createTestProject(companyA.companyId, "Locked Edit Project");
      const workDate = "2026-08-20";
      const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Locked Edit Team', 'day', null, null)`);
      await asUser(admin.userId, (tx) => tx`select * from lock_daily_teams(${projectId}, ${workDate})`);

      await expect(
        asUser(admin.userId, (tx) => tx`select * from update_daily_team_with_foreman(${team.id}, ${projectId}, ${workDate}, 'Renamed While Locked', 'day', null, null, null)`),
      ).rejects.toMatchObject(RAISED_EXCEPTION);
    });
  });

  /** Milestone F, item 3/10: LMRA count precision — exact per (company, project, daily_team_id, work_date), never fuzzy. */
  describe("listLmraCountsByDailyTeamId's underlying query — item 3/10", () => {
    async function rosterEmployee(projectId: string, firstName: string) {
      const user = await createTestUser(`${firstName} Worker`);
      await addMembership(companyA.companyId, user.userId, ["employee"]);
      const employeeId = await createTestEmployee(companyA.companyId, user.userId, firstName, "Worker");
      await sql`insert into project_assignments (company_id, project_id, employee_id, assignment_role) values (${companyA.companyId}, ${projectId}, ${employeeId}, 'member')`;
      return { userId: user.userId, employeeId };
    }

    function freshHazards() {
      const hazardTypes = [
        "working_at_height", "falling_objects", "line_of_fire", "manual_material_handling", "lifting_operations",
        "mobile_equipment_mewp", "weather_conditions", "access_egress", "housekeeping", "tools_equipment",
        "simultaneous_operations", "other",
      ];
      return hazardTypes.map((hazard_type) => ({
        hazard_type, is_applicable: false, controls: null, selected_controls: [], responsible_person_id: null, controls_confirmed: false, other_description: null,
      }));
    }

    it("multiple LMRAs for the same daily_team_id all count — a team is never restricted to one per day", async () => {
      const projectId = await createTestProject(companyA.companyId, "Multiple LMRA Project");
      const workDate = "2026-08-20";
      const worker = await rosterEmployee(projectId, "Multi");
      const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Multi LMRA Team', 'day', null, null)`);

      const hazardsJson = JSON.stringify(freshHazards());
      const [first] = await asUser(
        worker.userId,
        (tx) => tx`select * from create_lmra_assessment(${companyA.companyId}, ${projectId}, 'Area 1', 'Activity 1', ${workDate}, 'day', ${worker.employeeId}, null, null, ${[]}, ${hazardsJson}::jsonb, false, 'go', null, ${team.id})`,
      );
      const [second] = await asUser(
        worker.userId,
        (tx) => tx`select * from create_lmra_assessment(${companyA.companyId}, ${projectId}, 'Area 2', 'Activity 2', ${workDate}, 'day', ${worker.employeeId}, null, null, ${[]}, ${hazardsJson}::jsonb, false, 'go', null, ${team.id})`,
      );

      const linked = await sql`select id from lmra_assessments where daily_team_id = ${team.id} and work_date = ${workDate} and archived_at is null`;
      expect(linked.map((row) => row.id).sort()).toEqual([first.id, second.id].sort());

      await deleteTestUser(worker.userId);
    });

    it("an archived LMRA does not count toward the valid total", async () => {
      const projectId = await createTestProject(companyA.companyId, "Archived LMRA Project");
      const workDate = "2026-08-20";
      const worker = await rosterEmployee(projectId, "Archive");
      const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Archived LMRA Team', 'day', null, null)`);

      const hazardsJson = JSON.stringify(freshHazards());
      const [assessment] = await asUser(
        worker.userId,
        (tx) => tx`select * from create_lmra_assessment(${companyA.companyId}, ${projectId}, 'Area 1', 'Activity 1', ${workDate}, 'day', ${worker.employeeId}, null, null, ${[]}, ${hazardsJson}::jsonb, false, 'go', null, ${team.id})`,
      );
      await sql`update lmra_assessments set archived_at = now() where id = ${assessment.id}`;

      const linked = await sql`select id from lmra_assessments where daily_team_id = ${team.id} and work_date = ${workDate} and archived_at is null`;
      expect(linked).toHaveLength(0);

      await deleteTestUser(worker.userId);
    });
  });

  it("item 4/10: reorder_daily_teams persists across a fresh re-fetch, ordered by display_order — a second reorder call still round-trips correctly", async () => {
    const projectId = await createTestProject(companyA.companyId, "Reorder Refetch Project");
    const workDate = "2026-08-20";
    const [teamA] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Refetch A', 'day', null, null)`);
    const [teamB] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Refetch B', 'day', null, null)`);

    await asUser(admin.userId, (tx) => tx`select * from reorder_daily_teams(${projectId}, ${workDate}, ${[teamB.id, teamA.id]})`);
    const firstFetch = await sql`select id from daily_teams where project_id = ${projectId} and work_date = ${workDate} order by display_order`;
    expect(firstFetch.map((r) => r.id)).toEqual([teamB.id, teamA.id]);

    // A fully independent second "session" re-fetches — order must still hold (simulates logout/login).
    const secondFetch = await sql`select id from daily_teams where project_id = ${projectId} and work_date = ${workDate} order by display_order`;
    expect(secondFetch.map((r) => r.id)).toEqual([teamB.id, teamA.id]);

    // Reordering back the other way round-trips cleanly too.
    await asUser(admin.userId, (tx) => tx`select * from reorder_daily_teams(${projectId}, ${workDate}, ${[teamA.id, teamB.id]})`);
    const thirdFetch = await sql`select id from daily_teams where project_id = ${projectId} and work_date = ${workDate} order by display_order`;
    expect(thirdFetch.map((r) => r.id)).toEqual([teamA.id, teamB.id]);
  });

  it("milestone H, item 2: an employee's team membership is scoped to the EXACT work_date — 'Add My Today's Team' for a backdated LMRA sees that day's historical roster, never a different day's", async () => {
    const projectId = await createTestProject(companyA.companyId, "Historical Roster Project");
    const employeeId = await createTestEmployee(companyA.companyId, null, "Historical", "Worker");
    const dayOne = "2026-08-10";
    const dayTwo = "2026-08-11";

    const [teamDayOne] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${dayOne}, 'Day One Team', 'day', null, null)`);
    const [teamDayTwo] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${dayTwo}, 'Day Two Team', 'day', null, null)`);
    await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${dayOne}, ${teamDayOne.id}, ${employeeId}, 'member')`);
    await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${dayTwo}, ${teamDayTwo.id}, ${employeeId}, 'member')`);

    const dayOneMembership = await sql`select daily_team_id from daily_team_members where project_id = ${projectId} and work_date = ${dayOne} and employee_id = ${employeeId} and removed_at is null`;
    expect(dayOneMembership).toHaveLength(1);
    expect(dayOneMembership[0].daily_team_id).toBe(teamDayOne.id);

    const dayTwoMembership = await sql`select daily_team_id from daily_team_members where project_id = ${projectId} and work_date = ${dayTwo} and employee_id = ${employeeId} and removed_at is null`;
    expect(dayTwoMembership).toHaveLength(1);
    expect(dayTwoMembership[0].daily_team_id).toBe(teamDayTwo.id);

    // A third day the employee was never assigned on: the "no team" case (getMyTodaysTeamForLmra's safe empty/error state).
    const dayThreeMembership = await sql`select daily_team_id from daily_team_members where project_id = ${projectId} and work_date = '2026-08-12' and employee_id = ${employeeId} and removed_at is null`;
    expect(dayThreeMembership).toHaveLength(0);
  });

  it("milestone H, item 9: 'Your Dashboard' team colleagues are exactly this team's OTHER current workers — self excluded, foreman resolved separately, no unrelated team leaks in", async () => {
    const projectId = await createTestProject(companyA.companyId, "Team Colleagues Project");
    const foreman = await createTestForeman(companyA.companyId, projectId, "Colleagues", "Foreman");
    const me = await createTestEmployee(companyA.companyId, null, "Me", "Myself");
    const colleagueOne = await createTestEmployee(companyA.companyId, null, "Colleague", "One");
    const colleagueTwo = await createTestEmployee(companyA.companyId, null, "Colleague", "Two");
    const workDate = "2026-08-20";

    await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${foreman.employeeId})`);
    const [team] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${foreman.employeeId}, 'Colleagues Team', 'day', null, null)`);
    await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${team.id}, ${me}, 'member')`);
    await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${team.id}, ${colleagueOne}, 'member')`);
    await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${team.id}, ${colleagueTwo}, 'member')`);

    // A completely unrelated team on the same day, to prove nothing leaks across teams.
    const otherForeman = await createTestForeman(companyA.companyId, projectId, "Other", "Foreman");
    await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${otherForeman.employeeId})`);
    const [otherTeam] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${otherForeman.employeeId}, 'Unrelated Team', 'day', null, null)`);
    const stranger = await createTestEmployee(companyA.companyId, null, "Stranger", "Unrelated");
    await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${otherTeam.id}, ${stranger}, 'member')`);

    // Exactly what getEmployeeTodayCard's colleague resolution queries: role='member', removed_at is null, self excluded client-side.
    const memberRows = await sql`select employee_id from daily_team_members where daily_team_id = ${team.id} and role = 'member' and removed_at is null`;
    const colleagueIds = memberRows.map((row) => row.employee_id).filter((id) => id !== me);

    expect(colleagueIds.sort()).toEqual([colleagueOne, colleagueTwo].sort());
    expect(colleagueIds).not.toContain(me); // never includes yourself
    expect(colleagueIds).not.toContain(foreman.employeeId); // the foreman is resolved separately, never folded into "colleagues"
    expect(colleagueIds).not.toContain(stranger); // no leak from the unrelated team

    await deleteTestUser(foreman.userId);
    await deleteTestUser(otherForeman.userId);
  });

  describe("copy_daily_teams_to_date — Copy Teams (items 6-10)", () => {
    it("copies a Foreman's team and its available workers onto a clean destination date, and assigns/team-changed notifications are created", async () => {
      const projectId = await createTestProject(companyA.companyId, "Copy Happy Path Project");
      const foreman = await createTestForeman(companyA.companyId, projectId, "Copy", "Foreman");
      const worker = await createTestUser("Copy Worker");
      await addMembership(companyA.companyId, worker.userId, ["employee"]);
      const workerId = await createTestEmployee(companyA.companyId, worker.userId, "Copy", "Worker");
      await sql`insert into project_assignments (company_id, project_id, employee_id, assignment_role) values (${companyA.companyId}, ${projectId}, ${workerId}, 'member')`;
      const sourceDate = "2026-08-10";
      const destinationDate = "2026-08-11";

      await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${sourceDate}, ${foreman.employeeId})`);
      const [team] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${sourceDate}, ${foreman.employeeId}, 'Copy Source Team', 'day', 'A100', 'Scaffolding')`);
      await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${sourceDate}, ${team.id}, ${workerId}, 'member')`);

      const [result] = await asUser(admin.userId, (tx) => tx`select * from copy_daily_teams_to_date(${projectId}, ${sourceDate}, ${destinationDate})`);
      expect(result.skipped_existing).toBe(false);
      expect(result.teams_created).toBe(1);
      expect(result.workers_assigned).toBe(1);
      expect(result.workers_skipped_unavailable).toBe(0);
      expect(result.teams_requiring_attention).toBe(0);

      const [copiedTeam] = await sql`select id, name, shift, work_area, activity, foreman_employee_id from daily_teams where project_id = ${projectId} and work_date = ${destinationDate}`;
      expect(copiedTeam).toMatchObject({ name: "Copy Source Team", shift: "day", work_area: "A100", activity: "Scaffolding", foreman_employee_id: foreman.employeeId });

      const copiedMembers = await sql`select employee_id from daily_team_members where daily_team_id = ${copiedTeam.id} and removed_at is null`;
      expect(copiedMembers.map((m) => m.employee_id)).toEqual([workerId]);

      const notifications = await sql`select type, recipient_user_id from notifications where type = 'daily_team_assigned' and recipient_user_id = ${worker.userId}`;
      expect(notifications).toHaveLength(1);

      await deleteTestUser(foreman.userId);
      await deleteTestUser(worker.userId);
    });

    it("skips a worker who is marked unavailable (e.g. absent) on the destination date, and reports the exact reason", async () => {
      const projectId = await createTestProject(companyA.companyId, "Copy Unavailable Worker Project");
      const foreman = await createTestForeman(companyA.companyId, projectId, "CopyUnavail", "Foreman");
      const workerId = await createTestEmployee(companyA.companyId, null, "Unavailable", "OnDestination");
      await sql`insert into project_assignments (company_id, project_id, employee_id, assignment_role) values (${companyA.companyId}, ${projectId}, ${workerId}, 'member')`;
      const sourceDate = "2026-08-10";
      const destinationDate = "2026-08-12";

      await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${sourceDate}, ${foreman.employeeId})`);
      const [team] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${sourceDate}, ${foreman.employeeId}, 'Unavail Source Team', 'day', null, null)`);
      await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${sourceDate}, ${team.id}, ${workerId}, 'member')`);
      await asUser(admin.userId, (tx) => tx`select * from set_daily_attendance_status(${projectId}, ${workerId}, ${destinationDate}, 'absent')`);

      const [result] = await asUser(admin.userId, (tx) => tx`select * from copy_daily_teams_to_date(${projectId}, ${sourceDate}, ${destinationDate})`);
      expect(result.teams_created).toBe(1);
      expect(result.workers_assigned).toBe(0);
      expect(result.workers_skipped_unavailable).toBe(1);
      const details = result.skipped_worker_details as { employeeId: string; reason: string }[];
      expect(details).toHaveLength(1);
      expect(details[0]).toMatchObject({ employeeId: workerId, reason: "unavailable" });

      await deleteTestUser(foreman.userId);
    });

    it("an unavailable source Foreman means that team is entirely skipped and reported as 'requires attention' — never created without a valid foreman", async () => {
      const projectId = await createTestProject(companyA.companyId, "Copy Foreman Unavailable Project");
      const foreman = await createTestForeman(companyA.companyId, projectId, "GoingAbsent", "Foreman");
      const sourceDate = "2026-08-10";
      const destinationDate = "2026-08-13";

      await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${sourceDate}, ${foreman.employeeId})`);
      await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${sourceDate}, ${foreman.employeeId}, 'Foreman Unavail Team', 'day', null, null)`);
      await asUser(admin.userId, (tx) => tx`select * from set_daily_attendance_status(${projectId}, ${foreman.employeeId}, ${destinationDate}, 'sick')`);

      const [result] = await asUser(admin.userId, (tx) => tx`select * from copy_daily_teams_to_date(${projectId}, ${sourceDate}, ${destinationDate})`);
      expect(result.teams_created).toBe(0);
      expect(result.teams_requiring_attention).toBe(1);
      const attention = result.attention_team_details as { reason: string; foremanEmployeeId: string }[];
      expect(attention[0]).toMatchObject({ reason: "foreman_unavailable", foremanEmployeeId: foreman.employeeId });

      const teamsOnDestination = await sql`select id from daily_teams where project_id = ${projectId} and work_date = ${destinationDate}`;
      expect(teamsOnDestination).toHaveLength(0);

      await deleteTestUser(foreman.userId);
    });

    it("a destination date that already has teams is skipped wholesale by default — never silently overwritten", async () => {
      const projectId = await createTestProject(companyA.companyId, "Copy Skip Existing Project");
      const foreman = await createTestForeman(companyA.companyId, projectId, "SkipExisting", "Foreman");
      const sourceDate = "2026-08-10";
      const destinationDate = "2026-08-14";

      await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${sourceDate}, ${foreman.employeeId})`);
      await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${sourceDate}, ${foreman.employeeId}, 'Skip Source Team', 'day', null, null)`);
      // The destination day already has its OWN independent team.
      await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${destinationDate}, ${foreman.employeeId})`);
      const [existingTeam] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${destinationDate}, ${foreman.employeeId}, 'Pre-Existing Team', 'night', null, null)`);

      const [result] = await asUser(admin.userId, (tx) => tx`select * from copy_daily_teams_to_date(${projectId}, ${sourceDate}, ${destinationDate})`);
      expect(result.skipped_existing).toBe(true);
      expect(result.teams_created).toBe(0);

      const stillThere = await sql`select id, name from daily_teams where project_id = ${projectId} and work_date = ${destinationDate}`;
      expect(stillThere).toHaveLength(1);
      expect(stillThere[0].id).toBe(existingTeam.id);
      expect(stillThere[0].name).toBe("Pre-Existing Team"); // untouched, never overwritten

      await deleteTestUser(foreman.userId);
    });
  });

  describe("daily_team_members_notify_assignment trigger — items 13/14", () => {
    it("does not create a second notification for an idempotent re-save (same team, same role)", async () => {
      const projectId = await createTestProject(companyA.companyId, "Notify Idempotent Project");
      const foreman = await createTestForeman(companyA.companyId, projectId, "Idempotent", "Foreman");
      const worker = await createTestUser("Idempotent Worker");
      await addMembership(companyA.companyId, worker.userId, ["employee"]);
      const workerId = await createTestEmployee(companyA.companyId, worker.userId, "Idempotent", "Worker");
      const workDate = "2026-08-15";

      await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${foreman.employeeId})`);
      const [team] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${foreman.employeeId}, 'Idempotent Team', 'day', null, null)`);

      await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${team.id}, ${workerId}, 'member')`);
      await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${team.id}, ${workerId}, 'member')`);

      const notifications = await sql`select id from notifications where type = 'daily_team_assigned' and recipient_user_id = ${worker.userId}`;
      expect(notifications).toHaveLength(1);

      await deleteTestUser(foreman.userId);
      await deleteTestUser(worker.userId);
    });

    it("notifies 'daily_team_changed' (not 'daily_team_assigned') when moved to a genuinely different team", async () => {
      const projectId = await createTestProject(companyA.companyId, "Notify Team Change Project");
      const foreman = await createTestForeman(companyA.companyId, projectId, "TeamChange", "Foreman");
      const worker = await createTestUser("Team Change Worker");
      await addMembership(companyA.companyId, worker.userId, ["employee"]);
      const workerId = await createTestEmployee(companyA.companyId, worker.userId, "TeamChange", "Worker");
      const workDate = "2026-08-16";

      await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${foreman.employeeId})`);
      const [teamAlpha] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${foreman.employeeId}, 'Alpha', 'day', null, null)`);
      const [teamBravo] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${foreman.employeeId}, 'Bravo', 'day', null, null)`);

      await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${teamAlpha.id}, ${workerId}, 'member')`);
      await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${teamBravo.id}, ${workerId}, 'member')`);

      const assigned = await sql`select id from notifications where type = 'daily_team_assigned' and recipient_user_id = ${worker.userId}`;
      expect(assigned).toHaveLength(1); // the first move
      const changed = await sql`select body from notifications where type = 'daily_team_changed' and recipient_user_id = ${worker.userId}`;
      expect(changed).toHaveLength(1);
      expect(changed[0].body).toContain("Alpha");
      expect(changed[0].body).toContain("Bravo");

      await deleteTestUser(foreman.userId);
      await deleteTestUser(worker.userId);
    });

    it("closing and reinserting into the SAME team never notifies, even when done directly (bypassing move_daily_team_member's own early-return) — the trigger's own old-vs-new comparison is what actually prevents it, not just the RPC's optimization", async () => {
      const projectId = await createTestProject(companyA.companyId, "Notify Role Change Project");
      const foreman = await createTestForeman(companyA.companyId, projectId, "RoleChange", "Foreman");
      const worker = await createTestUser("Role Change Worker");
      await addMembership(companyA.companyId, worker.userId, ["employee"]);
      const workerId = await createTestEmployee(companyA.companyId, worker.userId, "RoleChange", "Worker");
      const workDate = "2026-08-17";

      await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${foreman.employeeId})`);
      const [team] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${foreman.employeeId}, 'Role Change Team', 'day', null, null)`);
      await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${team.id}, ${workerId}, 'member')`);

      const beforeCount = await sql`select count(*)::int as count from notifications where recipient_user_id = ${worker.userId}`;
      await sql`update daily_team_members set removed_at = now() where daily_team_id = ${team.id} and employee_id = ${workerId} and removed_at is null`;
      await sql`insert into daily_team_members (company_id, project_id, work_date, daily_team_id, employee_id, role, created_by) values (${companyA.companyId}, ${projectId}, ${workDate}, ${team.id}, ${workerId}, 'member', ${admin.userId})`;
      const afterCount = await sql`select count(*)::int as count from notifications where recipient_user_id = ${worker.userId}`;
      expect(afterCount[0].count).toBe(beforeCount[0].count);

      await deleteTestUser(foreman.userId);
      await deleteTestUser(worker.userId);
    });
  });
});
