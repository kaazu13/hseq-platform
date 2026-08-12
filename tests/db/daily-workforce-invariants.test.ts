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

  it("archive reproduces historical team membership — a locked day's roster is exactly reconstructable from daily_team_members", async () => {
    const projectId = await createTestProject(companyA.companyId, "Archive Reproduction Project");
    const employeeOne = await createTestEmployee(companyA.companyId, null, "Archive", "One");
    const employeeTwo = await createTestEmployee(companyA.companyId, null, "Archive", "Two");
    const workDate = "2026-08-10";

    const [team] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Archive Team', 'day', 'A200', 'Scaffold Assembly')`);
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

  it("item 9: create_daily_team_with_foreman requires a valid shift and an eligible foreman, atomically", async () => {
    const projectId = await createTestProject(companyA.companyId, "Atomic Team Creation Project");
    const foreman = await createTestForeman(companyA.companyId, projectId, "Atomic", "Foreman");
    const plainEmployeeId = await createTestEmployee(companyA.companyId, null, "Ineligible", "Foreman");
    const workDate = "2026-08-20";

    // Missing shift.
    await expect(
      asUser(admin.userId, (tx) => tx`select * from create_daily_team_with_foreman(${projectId}, ${workDate}, 'No Shift Team', null, ${foreman.employeeId}, null, null)`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);

    // Non-eligible foreman.
    await expect(
      asUser(admin.userId, (tx) => tx`select * from create_daily_team_with_foreman(${projectId}, ${workDate}, 'Bad Foreman Team', 'day', ${plainEmployeeId}, null, null)`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);

    // No team was left behind by either failed attempt (atomicity — a failed foreman assignment must not leave an orphaned team row).
    const orphaned = await sql`select id from daily_teams where project_id = ${projectId} and work_date = ${workDate}`;
    expect(orphaned).toHaveLength(0);

    // Valid creation succeeds and the foreman is immediately, atomically assigned.
    const [team] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_with_foreman(${projectId}, ${workDate}, 'Valid Team', 'day', ${foreman.employeeId}, 'A1', 'Assembly')`);
    const [membership] = await sql`select role from daily_team_members where daily_team_id = ${team.id} and employee_id = ${foreman.employeeId} and removed_at is null`;
    expect(membership.role).toBe("foreman");

    await deleteTestUser(foreman.userId);
  });

  it("item 6/7: an already-assigned foreman cannot head a second team in the same project/date/shift slot", async () => {
    const projectId = await createTestProject(companyA.companyId, "Foreman Double-Book Project");
    const foreman = await createTestForeman(companyA.companyId, projectId, "Double", "Booked");
    const workDate = "2026-08-20";

    await asUser(admin.userId, (tx) => tx`select * from create_daily_team_with_foreman(${projectId}, ${workDate}, 'First Team', 'day', ${foreman.employeeId}, null, null)`);

    await expect(
      asUser(admin.userId, (tx) => tx`select * from create_daily_team_with_foreman(${projectId}, ${workDate}, 'Second Team', 'day', ${foreman.employeeId}, null, null)`),
    ).rejects.toMatchObject(UNIQUE_VIOLATION);

    await deleteTestUser(foreman.userId);
  });

  it("item 4: reorder_daily_teams changes display_order only — never membership, shift, foreman, or work_area/activity", async () => {
    const projectId = await createTestProject(companyA.companyId, "Reorder Project");
    const foreman = await createTestForeman(companyA.companyId, projectId, "Reorder", "Foreman");
    const workDate = "2026-08-20";

    const [teamA] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Reorder A', 'day', 'AreaA', 'ActivityA')`);
    const [teamB] = await asUser(admin.userId, (tx) => tx`select * from save_daily_team(null, ${projectId}, ${workDate}, 'Reorder B', 'day', 'AreaB', 'ActivityB')`);
    await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${teamA.id}, ${foreman.employeeId}, 'foreman')`);

    expect(teamA.display_order).toBe(0);
    expect(teamB.display_order).toBe(1);

    await asUser(admin.userId, (tx) => tx`select * from reorder_daily_teams(${projectId}, ${workDate}, ${[teamB.id, teamA.id]})`);

    const [reorderedA] = await sql`select display_order, name, shift, work_area, activity from daily_teams where id = ${teamA.id}`;
    const [reorderedB] = await sql`select display_order, name, shift, work_area, activity from daily_teams where id = ${teamB.id}`;
    expect(reorderedB.display_order).toBe(0);
    expect(reorderedA.display_order).toBe(1);
    // Every other field is byte-for-byte unchanged.
    expect(reorderedA).toMatchObject({ name: "Reorder A", shift: "day", work_area: "AreaA", activity: "ActivityA" });
    expect(reorderedB).toMatchObject({ name: "Reorder B", shift: "day", work_area: "AreaB", activity: "ActivityB" });

    const [foremanMembership] = await sql`select removed_at from daily_team_members where daily_team_id = ${teamA.id} and employee_id = ${foreman.employeeId}`;
    expect(foremanMembership.removed_at).toBeNull();

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

    it("swaps the foreman atomically — the old foreman is removed from the slot, never demoted to a plain worker; the new foreman is assigned", async () => {
      const projectId = await createTestProject(companyA.companyId, "Foreman Swap Project");
      const workDate = "2026-08-20";
      const oldForeman = await createTestForeman(companyA.companyId, projectId, "Old", "Foreman");
      const newForeman = await createTestForeman(companyA.companyId, projectId, "New", "Foreman");

      const [team] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_with_foreman(${projectId}, ${workDate}, 'Swap Team', 'day', ${oldForeman.employeeId}, null, null)`);

      await asUser(admin.userId, (tx) => tx`select * from update_daily_team_with_foreman(${team.id}, ${projectId}, ${workDate}, 'Swap Team', 'day', ${newForeman.employeeId}, null, null)`);

      const [oldRow] = await sql`select role, removed_at from daily_team_members where daily_team_id = ${team.id} and employee_id = ${oldForeman.employeeId} order by created_at desc limit 1`;
      expect(oldRow.role).toBe("foreman"); // never silently converted to 'member'
      expect(oldRow.removed_at).not.toBeNull(); // but removed from the slot

      const [newRow] = await sql`select role, removed_at from daily_team_members where daily_team_id = ${team.id} and employee_id = ${newForeman.employeeId} and removed_at is null`;
      expect(newRow.role).toBe("foreman");

      await deleteTestUser(oldForeman.userId);
      await deleteTestUser(newForeman.userId);
    });

    it("a null foremanEmployeeId leaves existing foreman assignment untouched (the legacy/repair-safe path)", async () => {
      const projectId = await createTestProject(companyA.companyId, "Foreman Untouched Project");
      const workDate = "2026-08-20";
      const foreman = await createTestForeman(companyA.companyId, projectId, "Untouched", "Foreman");
      const [team] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_with_foreman(${projectId}, ${workDate}, 'Untouched Team', 'day', ${foreman.employeeId}, null, null)`);

      await asUser(admin.userId, (tx) => tx`select * from update_daily_team_with_foreman(${team.id}, ${projectId}, ${workDate}, 'Renamed Only', 'day', null, null, null)`);

      const [row] = await sql`select role from daily_team_members where daily_team_id = ${team.id} and employee_id = ${foreman.employeeId} and removed_at is null`;
      expect(row.role).toBe("foreman");

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
});
