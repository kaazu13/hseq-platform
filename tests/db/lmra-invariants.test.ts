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
  RAISED_EXCEPTION,
  CHECK_VIOLATION,
} from "./helpers";

/**
 * LMRA workflow/UI redesign invariants — covers
 * supabase/migrations/20260816090000_lmra_daily_workforce_redesign.sql
 * directly: ordinary-eligible-worker creation, self-only completed-by
 * (no impersonation), cross-project rejection for both the completer and
 * participants, input-length/array-size backstops, and that archived
 * records stay immutable exactly as before this redesign.
 */

function freshHazards(overrides: Partial<{ hazardType: string; isApplicable: boolean; selectedControls: string[] }> = {}) {
  const types = [
    "working_at_height",
    "falling_objects",
    "line_of_fire",
    "manual_material_handling",
    "lifting_operations",
    "mobile_equipment_mewp",
    "weather_conditions",
    "access_egress",
    "housekeeping",
    "tools_equipment",
    "simultaneous_operations",
    "other",
  ];
  return types.map((hazard_type) => ({
    hazard_type,
    is_applicable: overrides.hazardType === hazard_type ? (overrides.isApplicable ?? true) : false,
    controls: null,
    selected_controls: overrides.hazardType === hazard_type ? (overrides.selectedControls ?? []) : [],
    responsible_person_id: null,
    controls_confirmed: false,
    other_description: null,
  }));
}

describe("LMRA invariants (redesign)", () => {
  let companyA: Awaited<ReturnType<typeof createTestCompany>>;
  let companyB: Awaited<ReturnType<typeof createTestCompany>>;
  let admin: Awaited<ReturnType<typeof createTestUser>>; // company_admin in Company A — NOT hseq_manager/foreman, used to prove admin alone can't write LMRA

  beforeAll(async () => {
    companyA = await createTestCompany("lmra-a");
    companyB = await createTestCompany("lmra-b");
    admin = await createTestUser("LMRA Admin");
    await addMembership(companyA.companyId, admin.userId, ["company_admin"]);
  });

  afterAll(async () => {
    await deleteTestCompany(companyA.companyId);
    await deleteTestCompany(companyB.companyId);
    await deleteTestUser(admin.userId);
    await sql.end();
  });

  async function rosterEmployee(projectId: string, label: string): Promise<{ userId: string; employeeId: string }> {
    const person = await createTestUser(`LMRA ${label}`);
    await addMembership(companyA.companyId, person.userId, ["employee"]);
    const employeeId = await createTestEmployee(companyA.companyId, person.userId, "LMRA", label);
    await sql`insert into project_assignments (company_id, project_id, employee_id, assignment_role) values (${companyA.companyId}, ${projectId}, ${employeeId}, 'member')`;
    return { userId: person.userId, employeeId };
  }

  it("an ordinary eligible project worker (no elevated role) can create an LMRA for themselves via create_lmra_assessment", async () => {
    const projectId = await createTestProject(companyA.companyId, "Ordinary Worker Create Project");
    const worker = await rosterEmployee(projectId, "Worker1");

    const [assessment] = await asUser(worker.userId, (tx) => tx`
      select * from create_lmra_assessment(
        ${companyA.companyId}, ${projectId}, 'Scaffold bay 2', 'Erecting scaffold', '2026-08-10', 'day',
        ${worker.employeeId}, null, null, ${[]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
      )
    `);

    expect(assessment.completed_by_employee_id).toBe(worker.employeeId);
    expect(assessment.status).toBe("draft");
  });

  it("company_admin ALONE (no hseq_manager/foreman/project-access) cannot create an LMRA — LMRA write access does not follow the org-wide-manager pattern", async () => {
    const projectId = await createTestProject(companyA.companyId, "Admin Cannot Create Project");
    // admin has no project_assignments/team_assignments row and no employee record here.
    await expect(
      asUser(admin.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-10', 'day',
          ${admin.userId}, null, null, ${[]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
        )
      `),
    ).rejects.toBeDefined();
  });

  it("an ordinary worker cannot name someone ELSE as completed_by_employee_id — no impersonation path", async () => {
    const projectId = await createTestProject(companyA.companyId, "No Impersonation Project");
    const worker = await rosterEmployee(projectId, "Impersonator");
    const other = await rosterEmployee(projectId, "Victim");

    await expect(
      asUser(worker.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-10', 'day',
          ${other.employeeId}, null, null, ${[]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
        )
      `),
    ).rejects.toBeDefined();
  });

  it("rejects a completed_by_employee_id that is not on THIS project's roster (cross-project rejection)", async () => {
    const projectA = await createTestProject(companyA.companyId, "Cross Project Completer A");
    const projectB = await createTestProject(companyA.companyId, "Cross Project Completer B");
    const workerOnB = await rosterEmployee(projectB, "OnProjectB");
    // hseq_manager's RLS branch has no project-access prerequisite, so the
    // request reaches the TRIGGER's cross-project check specifically —
    // company_admin (used elsewhere in this file) would instead be rejected
    // by RLS itself before ever reaching that trigger, which would prove a
    // different thing than what this test is about.
    const hseqAdmin = await createTestUser("Cross Project Completer HSEQ Manager");
    await addMembership(companyA.companyId, hseqAdmin.userId, ["hseq_manager"]);

    await expect(
      asUser(hseqAdmin.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectA}, 'Area', 'Activity', '2026-08-10', 'day',
          ${workerOnB.employeeId}, null, null, ${[]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
        )
      `),
    ).rejects.toMatchObject(RAISED_EXCEPTION);

    await deleteTestUser(hseqAdmin.userId);
  });

  it("rejects a participant employee id that is not on THIS project's roster (cross-project rejection)", async () => {
    const projectA = await createTestProject(companyA.companyId, "Cross Project Participant A");
    const projectB = await createTestProject(companyA.companyId, "Cross Project Participant B");
    const completer = await rosterEmployee(projectA, "CompleterA");
    const outsider = await rosterEmployee(projectB, "OutsiderB");

    await expect(
      asUser(completer.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectA}, 'Area', 'Activity', '2026-08-10', 'day',
          ${completer.employeeId}, null, null, ${[outsider.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
        )
      `),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("deduplicates participant ids — a duplicated id in the array does not error (Add Today's Team dedup guarantee)", async () => {
    const projectId = await createTestProject(companyA.companyId, "Dedup Participants Project");
    const completer = await rosterEmployee(projectId, "DedupCompleter");
    const worker = await rosterEmployee(projectId, "DedupWorker");

    const [assessment] = await asUser(completer.userId, (tx) => tx`
      select * from create_lmra_assessment(
        ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-10', 'day',
        ${completer.employeeId}, null, null, ${[worker.employeeId, worker.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
      )
    `);

    const participants = await sql`select employee_id from lmra_participants where lmra_assessment_id = ${assessment.id}`;
    expect(participants).toHaveLength(1);
    expect(participants[0].employee_id).toBe(worker.employeeId);
  });

  it("rejects more than 200 participants", async () => {
    const projectId = await createTestProject(companyA.companyId, "Too Many Participants Project");
    const completer = await rosterEmployee(projectId, "TooManyCompleter");
    const ids = Array.from({ length: 201 }, () => completer.employeeId);

    await expect(
      asUser(completer.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-10', 'day',
          ${completer.employeeId}, null, null, ${ids}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
        )
      `),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("rejects a hazards payload that isn't exactly 12 rows", async () => {
    const projectId = await createTestProject(companyA.companyId, "Wrong Hazard Count Project");
    const completer = await rosterEmployee(projectId, "WrongCountCompleter");

    await expect(
      asUser(completer.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-10', 'day',
          ${completer.employeeId}, null, null, ${[]}, ${JSON.stringify(freshHazards().slice(0, 5))}::jsonb, false, 'go', null
        )
      `),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("rejects an oversized work_area / work_activity (Phase 10 DB-level backstop)", async () => {
    const projectId = await createTestProject(companyA.companyId, "Oversized Text Project");
    const completer = await rosterEmployee(projectId, "OversizedCompleter");

    await expect(
      asUser(completer.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, ${"x".repeat(101)}, 'Activity', '2026-08-10', 'day',
          ${completer.employeeId}, null, null, ${[]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
        )
      `),
    ).rejects.toMatchObject(CHECK_VIOLATION);
  });

  it("rejects an oversized selected_controls array on a hazard row (cardinality CHECK constraint)", async () => {
    const projectId = await createTestProject(companyA.companyId, "Oversized Controls Project");
    const completer = await rosterEmployee(projectId, "OversizedControlsCompleter");
    const tooManyControls = Array.from({ length: 21 }, (_, i) => `control-${i}`);

    await expect(
      asUser(completer.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-10', 'day',
          ${completer.employeeId}, null, null, ${[]},
          ${JSON.stringify(freshHazards({ hazardType: "working_at_height", isApplicable: true, selectedControls: tooManyControls }))}::jsonb,
          false, 'go', null
        )
      `),
    ).rejects.toMatchObject(CHECK_VIOLATION);
  });

  it("rejects an invalid shift value — the controlled enum rejects free text", async () => {
    const projectId = await createTestProject(companyA.companyId, "Invalid Shift Project");
    const completer = await rosterEmployee(projectId, "InvalidShiftCompleter");

    await expect(
      asUser(completer.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-10', 'morning',
          ${completer.employeeId}, null, null, ${[]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
        )
      `),
    ).rejects.toBeDefined();
  });

  it("submitting (target_submit=true) sets status to submitted with the go/no-go decision recorded", async () => {
    const projectId = await createTestProject(companyA.companyId, "Submit On Create Project");
    const completer = await rosterEmployee(projectId, "SubmitCompleter");

    const [assessment] = await asUser(completer.userId, (tx) => tx`
      select * from create_lmra_assessment(
        ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-10', 'day',
        ${completer.employeeId}, null, null, ${[]}, ${JSON.stringify(freshHazards())}::jsonb, true, 'no_go', 'Unsafe wind conditions'
      )
    `);

    expect(assessment.status).toBe("submitted");
    expect(assessment.result).toBe("no_go");
    expect(assessment.stop_work_reason).toBe("Unsafe wind conditions");
    expect(assessment.submitted_at).not.toBeNull();
  });

  it("completed_by_employee_id is immutable after creation — even for the same completer, an attempted change is rejected", async () => {
    const projectId = await createTestProject(companyA.companyId, "Immutable Completer Project");
    const completer = await rosterEmployee(projectId, "ImmutableCompleter");
    const other = await rosterEmployee(projectId, "ImmutableOther");

    const [assessment] = await asUser(completer.userId, (tx) => tx`
      select * from create_lmra_assessment(
        ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-10', 'day',
        ${completer.employeeId}, null, null, ${[]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
      )
    `);

    await expect(
      asUser(completer.userId, (tx) => tx`update lmra_assessments set completed_by_employee_id = ${other.employeeId} where id = ${assessment.id}`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("an archived LMRA cannot be modified — via update_lmra_assessment or a raw update, unchanged from the pre-redesign behavior", async () => {
    const projectId = await createTestProject(companyA.companyId, "Archived Immutable Project");
    const completer = await rosterEmployee(projectId, "ArchivedCompleter");
    const hseqAdmin = await createTestUser("Archive HSEQ Manager");
    await addMembership(companyA.companyId, hseqAdmin.userId, ["hseq_manager"]);

    const [assessment] = await asUser(completer.userId, (tx) => tx`
      select * from create_lmra_assessment(
        ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-10', 'day',
        ${completer.employeeId}, null, null, ${[]}, ${JSON.stringify(freshHazards())}::jsonb, true, 'go', null
      )
    `);

    await asUser(hseqAdmin.userId, (tx) => tx`update lmra_assessments set status = 'archived', archived_by = ${hseqAdmin.userId}, archived_at = now() where id = ${assessment.id}`);

    await expect(
      asUser(completer.userId, (tx) => tx`
        select * from update_lmra_assessment(
          ${assessment.id}, 'New Area', 'New Activity', '2026-08-11', 'night', null, null, ${[]}, ${JSON.stringify(freshHazards())}::jsonb
        )
      `),
    ).rejects.toMatchObject(RAISED_EXCEPTION);

    await deleteTestUser(hseqAdmin.userId);
  });

  it("editing (update_lmra_assessment) leaves hazards/participants untouched once past draft, but still updates core fields", async () => {
    const projectId = await createTestProject(companyA.companyId, "Edit Past Draft Project");
    const completer = await rosterEmployee(projectId, "PastDraftCompleter");

    const [assessment] = await asUser(completer.userId, (tx) => tx`
      select * from create_lmra_assessment(
        ${companyA.companyId}, ${projectId}, 'Original Area', 'Original Activity', '2026-08-10', 'day',
        ${completer.employeeId}, null, null, ${[]}, ${JSON.stringify(freshHazards())}::jsonb, true, 'go', null
      )
    `);
    expect(assessment.status).toBe("submitted");

    const [updated] = await asUser(completer.userId, (tx) => tx`
      select * from update_lmra_assessment(
        ${assessment.id}, 'Updated Area', 'Updated Activity', '2026-08-10', 'night', null, null,
        ${[completer.employeeId]}, ${JSON.stringify(freshHazards({ hazardType: "housekeeping", isApplicable: true }))}::jsonb
      )
    `);

    expect(updated.work_area).toBe("Updated Area");
    expect(updated.shift).toBe("night");

    // Hazards/participants were NOT touched — still whatever create_lmra_assessment originally seeded (all inapplicable, no participants).
    const hazardRow = await sql`select is_applicable from lmra_hazards where lmra_assessment_id = ${assessment.id} and hazard_type = 'housekeeping'`;
    expect(hazardRow[0].is_applicable).toBe(false);
    const participants = await sql`select employee_id from lmra_participants where lmra_assessment_id = ${assessment.id}`;
    expect(participants).toHaveLength(0);
  });

  describe("item 1: responsible person must be one of this LMRA's own participants", () => {
    it("rejects an assessment-level responsible_person_id that is not a participant", async () => {
      const projectId = await createTestProject(companyA.companyId, "Responsible Not Participant Project");
      const completer = await rosterEmployee(projectId, "RPCompleter");
      const outsider = await rosterEmployee(projectId, "RPOutsider");

      await expect(
        asUser(completer.userId, (tx) => tx`
          select * from create_lmra_assessment(
            ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-10', 'day',
            ${completer.employeeId}, ${outsider.employeeId}, null, ${[completer.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
          )
        `),
      ).rejects.toMatchObject(RAISED_EXCEPTION);
    });

    it("accepts a responsible_person_id that IS a participant", async () => {
      const projectId = await createTestProject(companyA.companyId, "Responsible Is Participant Project");
      const completer = await rosterEmployee(projectId, "RP2Completer");
      const worker = await rosterEmployee(projectId, "RP2Worker");

      const [assessment] = await asUser(completer.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-10', 'day',
          ${completer.employeeId}, ${worker.employeeId}, null, ${[completer.employeeId, worker.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
        )
      `);
      expect(assessment.responsible_person_id).toBe(worker.employeeId);
    });

    it("rejects a hazard-level responsible_person_id that is not a participant, atomically — no assessment/hazards/participants rows are left behind", async () => {
      const projectId = await createTestProject(companyA.companyId, "Hazard Responsible Not Participant Project");
      const completer = await rosterEmployee(projectId, "HRCompleter");
      const outsider = await rosterEmployee(projectId, "HROutsider");

      await expect(
        asUser(completer.userId, (tx) => tx`
          select * from create_lmra_assessment(
            ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-10', 'day',
            ${completer.employeeId}, null, null, ${[completer.employeeId]},
            ${JSON.stringify(freshHazards({ hazardType: "working_at_height", isApplicable: true })).replace('"responsible_person_id":null', `"responsible_person_id":"${outsider.employeeId}"`)}::jsonb,
            false, 'go', null
          )
        `),
      ).rejects.toMatchObject(RAISED_EXCEPTION);

      const orphanedAssessments = await sql`select id from lmra_assessments where project_id = ${projectId} and work_area = 'Area'`;
      expect(orphanedAssessments).toHaveLength(0);
    });

    it("update_lmra_assessment also rejects a responsible_person_id that is not a participant", async () => {
      const projectId = await createTestProject(companyA.companyId, "Edit Responsible Not Participant Project");
      const completer = await rosterEmployee(projectId, "EditRPCompleter");
      const outsider = await rosterEmployee(projectId, "EditRPOutsider");

      const [assessment] = await asUser(completer.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-10', 'day',
          ${completer.employeeId}, null, null, ${[completer.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
        )
      `);

      await expect(
        asUser(completer.userId, (tx) => tx`
          select * from update_lmra_assessment(
            ${assessment.id}, 'Area', 'Activity', '2026-08-10', 'day', ${outsider.employeeId}, null, ${[completer.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb
          )
        `),
      ).rejects.toMatchObject(RAISED_EXCEPTION);
    });

    it("audit fix (20260830096000): a raw UPDATE setting responsible_person_id directly (bypassing create_lmra_assessment/update_lmra_assessment entirely) is rejected unless the new value is one of THIS assessment's own participants", async () => {
      const projectId = await createTestProject(companyA.companyId, "Raw Update Responsible Not Participant Project");
      const completer = await rosterEmployee(projectId, "RawRPCompleter");
      const outsider = await rosterEmployee(projectId, "RawRPOutsider");

      const [assessment] = await asUser(completer.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-10', 'day',
          ${completer.employeeId}, null, null, ${[completer.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
        )
      `);

      // outsider is project-rostered (would pass the OLDER, broader project-roster
      // check) but was never added to THIS assessment's lmra_participants.
      await expect(
        sql`update lmra_assessments set responsible_person_id = ${outsider.employeeId} where id = ${assessment.id}`,
      ).rejects.toMatchObject(RAISED_EXCEPTION);
      const [unchanged] = await sql`select responsible_person_id from lmra_assessments where id = ${assessment.id}`;
      expect(unchanged.responsible_person_id).toBeNull();

      // The legitimate case — the assessment's own completer, who IS a participant — still works via a raw UPDATE too.
      await sql`update lmra_assessments set responsible_person_id = ${completer.employeeId} where id = ${assessment.id}`;
      const [changed] = await sql`select responsible_person_id from lmra_assessments where id = ${assessment.id}`;
      expect(changed.responsible_person_id).toBe(completer.employeeId);
    });
  });

  describe("Today's Teams LMRA completion indicator regression — daily_team_id linking", () => {
    /** Creates a real daily_teams row for (project, workDate), with an eligible Foreman + one worker, mirroring the Today's Team system's own real shape (not lmra's — see modules/daily-workforce). */
    async function makeDailyTeam(projectId: string, workDate: string, name: string, foremanEmployeeId: string, workerEmployeeId: string) {
      await asUser(admin.userId, (tx) => tx`select * from add_daily_team_foreman(${projectId}, ${workDate}, ${foremanEmployeeId})`);
      const [team] = await asUser(admin.userId, (tx) => tx`select * from create_daily_team_for_foreman(${projectId}, ${workDate}, ${foremanEmployeeId}, ${name}, 'day', null, null)`);
      await asUser(admin.userId, (tx) => tx`select * from move_daily_team_member(${projectId}, ${workDate}, ${team.id}, ${workerEmployeeId}, 'member')`);
      return team.id as string;
    }

    /** A genuinely eligible Foreman — same helper shape as tests/db/daily-workforce-invariants.test.ts's own createTestForeman. */
    async function foremanEmployee(projectId: string, firstName: string, lastName: string) {
      const user = await createTestUser(`${firstName} ${lastName}`);
      await addMembership(companyA.companyId, user.userId, ["foreman"]);
      const employeeId = await createTestEmployee(companyA.companyId, user.userId, firstName, lastName);
      const teamId = await createTestTeam(companyA.companyId, projectId, `${firstName} Legacy Team`);
      await sql`insert into team_assignments (company_id, project_id, team_id, employee_id, assignment_role) values (${companyA.companyId}, ${projectId}, ${teamId}, ${employeeId}, 'foreman')`;
      return { userId: user.userId, employeeId };
    }

    it("create_lmra_assessment persists the exact target_daily_team_id — the 'LMRA from Team card' and both quick-add paths all funnel through this one write", async () => {
      const projectId = await createTestProject(companyA.companyId, "Daily Team Link Project");
      const workDate = "2026-08-20";
      const foreman = await foremanEmployee(projectId, "Link", "Foreman");
      const worker = await rosterEmployee(projectId, "LinkWorker");
      const teamId = await makeDailyTeam(projectId, workDate, "Team Link A", foreman.employeeId, worker.employeeId);

      const [assessment] = await asUser(worker.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', ${workDate}, 'day',
          ${worker.employeeId}, null, null, ${[worker.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null, ${teamId}
        )
      `);

      expect(assessment.daily_team_id).toBe(teamId);
      await deleteTestUser(foreman.userId);
    });

    it("rejects a target_daily_team_id belonging to a DIFFERENT project (same company) — never trust an id without row validation", async () => {
      const projectA = await createTestProject(companyA.companyId, "Link Wrong Project A");
      const projectB = await createTestProject(companyA.companyId, "Link Wrong Project B");
      const workDate = "2026-08-20";
      const foreman = await foremanEmployee(projectB, "Wrong", "Project");
      const workerB = await rosterEmployee(projectB, "WrongProjectWorkerB");
      const teamIdOnProjectB = await makeDailyTeam(projectB, workDate, "Team On B", foreman.employeeId, workerB.employeeId);
      const workerA = await rosterEmployee(projectA, "WrongProjectWorkerA");

      await expect(
        asUser(workerA.userId, (tx) => tx`
          select * from create_lmra_assessment(
            ${companyA.companyId}, ${projectA}, 'Area', 'Activity', ${workDate}, 'day',
            ${workerA.employeeId}, null, null, ${[workerA.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null, ${teamIdOnProjectB}
          )
        `),
      ).rejects.toMatchObject(RAISED_EXCEPTION);

      await deleteTestUser(foreman.userId);
    });

    it("rejects a target_daily_team_id whose own work_date does not match the LMRA's work_date", async () => {
      const projectId = await createTestProject(companyA.companyId, "Link Wrong Date Project");
      const teamDate = "2026-08-20";
      const lmraDate = "2026-08-21";
      const foreman = await foremanEmployee(projectId, "Wrong", "Date");
      const worker = await rosterEmployee(projectId, "WrongDateWorker");
      const teamId = await makeDailyTeam(projectId, teamDate, "Team Wrong Date", foreman.employeeId, worker.employeeId);

      await expect(
        asUser(worker.userId, (tx) => tx`
          select * from create_lmra_assessment(
            ${companyA.companyId}, ${projectId}, 'Area', 'Activity', ${lmraDate}, 'day',
            ${worker.employeeId}, null, null, ${[worker.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null, ${teamId}
          )
        `),
      ).rejects.toMatchObject(RAISED_EXCEPTION);

      await deleteTestUser(foreman.userId);
    });

    it("audit fix (20260830097000): a raw UPDATE setting daily_team_id directly (bypassing both RPCs entirely) is rejected when the team's own project/work_date does not match the assessment's", async () => {
      const projectId = await createTestProject(companyA.companyId, "Raw Update Link Wrong Date Project");
      const correctDate = "2026-08-20";
      const wrongDate = "2026-08-21";
      const foreman = await foremanEmployee(projectId, "RawLink", "Wrong");
      const worker = await rosterEmployee(projectId, "RawLinkWorker");
      // Two real daily_teams rows for the SAME project, different work_date.
      const teamOnCorrectDate = await makeDailyTeam(projectId, correctDate, "Raw Link Correct Date Team", foreman.employeeId, worker.employeeId);
      const teamOnWrongDate = await makeDailyTeam(projectId, wrongDate, "Raw Link Wrong Date Team", foreman.employeeId, worker.employeeId);

      const [assessment] = await asUser(worker.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', ${correctDate}, 'day',
          ${worker.employeeId}, null, null, ${[worker.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null, ${teamOnCorrectDate}
        )
      `);

      await expect(
        sql`update lmra_assessments set daily_team_id = ${teamOnWrongDate} where id = ${assessment.id}`,
      ).rejects.toMatchObject(RAISED_EXCEPTION);
      const [unchanged] = await sql`select daily_team_id from lmra_assessments where id = ${assessment.id}`;
      expect(unchanged.daily_team_id).toBe(teamOnCorrectDate);

      await deleteTestUser(foreman.userId);
    });

    it("update_lmra_assessment PRESERVES the existing daily_team_id when target_daily_team_id is omitted/null — editing never silently unlinks", async () => {
      const projectId = await createTestProject(companyA.companyId, "Link Preserve Project");
      const workDate = "2026-08-20";
      const foreman = await foremanEmployee(projectId, "Preserve", "Link");
      const worker = await rosterEmployee(projectId, "PreserveWorker");
      const teamId = await makeDailyTeam(projectId, workDate, "Team Preserve", foreman.employeeId, worker.employeeId);

      const [assessment] = await asUser(worker.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', ${workDate}, 'day',
          ${worker.employeeId}, null, null, ${[worker.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null, ${teamId}
        )
      `);
      expect(assessment.daily_team_id).toBe(teamId);

      const [updated] = await asUser(worker.userId, (tx) => tx`
        select * from update_lmra_assessment(
          ${assessment.id}, 'New Area', 'Activity', ${workDate}, 'day', null, null, ${[worker.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb
        )
      `);
      expect(updated.daily_team_id).toBe(teamId);
      expect(updated.work_area).toBe("New Area");

      await deleteTestUser(foreman.userId);
    });

    it("update_lmra_assessment can EXPLICITLY (re)link a draft to a valid team for the same work_date", async () => {
      const projectId = await createTestProject(companyA.companyId, "Link Relink Project");
      const workDate = "2026-08-20";
      const worker = await rosterEmployee(projectId, "RelinkWorker");
      const foreman = await foremanEmployee(projectId, "Relink", "Foreman");
      const teamId = await makeDailyTeam(projectId, workDate, "Team Relink", foreman.employeeId, worker.employeeId);

      // Created with no team link at all (e.g. manual participant entry, no quick-add button used).
      const [assessment] = await asUser(worker.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', ${workDate}, 'day',
          ${worker.employeeId}, null, null, ${[worker.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
        )
      `);
      expect(assessment.daily_team_id).toBeNull();

      const [updated] = await asUser(worker.userId, (tx) => tx`
        select * from update_lmra_assessment(
          ${assessment.id}, 'Area', 'Activity', ${workDate}, 'day', null, null, ${[worker.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, ${teamId}
        )
      `);
      expect(updated.daily_team_id).toBe(teamId);

      await deleteTestUser(foreman.userId);
    });

    it("the exact reported regression: employee on Team A on date X creates an LMRA linked to Team A -> Team A's LMRA count is 1, and a second unrelated Team B stays at 0", async () => {
      const projectId = await createTestProject(companyA.companyId, "Regression Repro Project");
      const workDate = "2026-08-20";
      const foremanA = await foremanEmployee(projectId, "TeamA", "Foreman");
      const foremanB = await foremanEmployee(projectId, "TeamB", "Foreman");
      const employee = await rosterEmployee(projectId, "ReproEmployee");
      const otherWorkerB = await rosterEmployee(projectId, "ReproOtherWorkerB");

      // 1. Employee belongs to Team A on date X.
      const teamAId = await makeDailyTeam(projectId, workDate, "Team A", foremanA.employeeId, employee.employeeId);
      const teamBId = await makeDailyTeam(projectId, workDate, "Team B", foremanB.employeeId, otherWorkerB.employeeId);

      // Resolve "my today's team" exactly the way getMyTodaysTeamForLmra does: a membership lookup for (project, work_date, employee_id).
      const [membership] = await sql`select daily_team_id from daily_team_members where project_id = ${projectId} and work_date = ${workDate} and employee_id = ${employee.employeeId} and removed_at is null`;
      expect(membership.daily_team_id).toBe(teamAId);

      // 2/3. Employee creates an LMRA using "Add My Today's Team" — the fixed app code now passes the resolved daily_team_id straight through to create_lmra_assessment.
      const [assessment] = await asUser(employee.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', ${workDate}, 'day',
          ${employee.employeeId}, null, null, ${[employee.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, true, 'go', null, ${membership.daily_team_id}
        )
      `);
      expect(assessment.status).toBe("submitted");
      expect(assessment.daily_team_id).toBe(teamAId);

      // 4/5. Re-query Team A — exactly listLmraCountsByDailyTeamId's own query shape — count is 1.
      const teamACounts = await sql`select id from lmra_assessments where company_id = ${companyA.companyId} and project_id = ${projectId} and work_date = ${workDate} and archived_at is null and daily_team_id = ${teamAId}`;
      expect(teamACounts).toHaveLength(1);
      expect(teamACounts[0].id).toBe(assessment.id);

      // Team B (a real, different team on the exact same project/date) must stay at 0 — never a false positive from a same-project/same-date coincidence.
      const teamBCounts = await sql`select id from lmra_assessments where company_id = ${companyA.companyId} and project_id = ${projectId} and work_date = ${workDate} and archived_at is null and daily_team_id = ${teamBId}`;
      expect(teamBCounts).toHaveLength(0);

      await deleteTestUser(foremanA.userId);
      await deleteTestUser(foremanB.userId);
    });

    it("an Approved/Go LMRA still counts (status is never part of the daily_team_id completion filter)", async () => {
      const projectId = await createTestProject(companyA.companyId, "Approved Counts Project");
      const workDate = "2026-08-20";
      const foreman = await foremanEmployee(projectId, "Approved", "Foreman");
      const worker = await rosterEmployee(projectId, "ApprovedWorker");
      const teamId = await makeDailyTeam(projectId, workDate, "Approved Team", foreman.employeeId, worker.employeeId);
      const hseqAdmin = await createTestUser("Approved Counts HSEQ Manager");
      await addMembership(companyA.companyId, hseqAdmin.userId, ["hseq_manager"]);

      const [assessment] = await asUser(worker.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', ${workDate}, 'day',
          ${worker.employeeId}, null, null, ${[worker.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, true, 'go', null, ${teamId}
        )
      `);
      await asUser(hseqAdmin.userId, (tx) => tx`update lmra_assessments set status = 'approved', reviewed_by = ${hseqAdmin.userId}, reviewed_at = now(), approved_at = now() where id = ${assessment.id}`);

      const counted = await sql`select status from lmra_assessments where daily_team_id = ${teamId} and work_date = ${workDate} and archived_at is null`;
      expect(counted).toHaveLength(1);
      expect(counted[0].status).toBe("approved");

      await deleteTestUser(foreman.userId);
      await deleteTestUser(hseqAdmin.userId);
    });

    it("an archived LMRA for that team no longer counts", async () => {
      const projectId = await createTestProject(companyA.companyId, "Archived Excluded Project");
      const workDate = "2026-08-20";
      const foreman = await foremanEmployee(projectId, "Archived", "Foreman");
      const worker = await rosterEmployee(projectId, "ArchivedWorker");
      const teamId = await makeDailyTeam(projectId, workDate, "Archived Team", foreman.employeeId, worker.employeeId);
      const hseqAdmin = await createTestUser("Archived Excluded HSEQ Manager");
      await addMembership(companyA.companyId, hseqAdmin.userId, ["hseq_manager"]);

      const [assessment] = await asUser(worker.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', ${workDate}, 'day',
          ${worker.employeeId}, null, null, ${[worker.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, true, 'go', null, ${teamId}
        )
      `);
      await asUser(hseqAdmin.userId, (tx) => tx`update lmra_assessments set status = 'archived', archived_by = ${hseqAdmin.userId}, archived_at = now() where id = ${assessment.id}`);

      const counted = await sql`select id from lmra_assessments where daily_team_id = ${teamId} and work_date = ${workDate} and archived_at is null`;
      expect(counted).toHaveLength(0);

      await deleteTestUser(foreman.userId);
      await deleteTestUser(hseqAdmin.userId);
    });

    it("two LMRAs for the same team/date both count (count = 2) — never restricted to one per day", async () => {
      const projectId = await createTestProject(companyA.companyId, "Two LMRAs Project");
      const workDate = "2026-08-20";
      const foreman = await foremanEmployee(projectId, "TwoLmras", "Foreman");
      const worker = await rosterEmployee(projectId, "TwoLmrasWorker");
      const teamId = await makeDailyTeam(projectId, workDate, "Two LMRAs Team", foreman.employeeId, worker.employeeId);

      await asUser(worker.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area 1', 'Activity 1', ${workDate}, 'day',
          ${worker.employeeId}, null, null, ${[worker.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null, ${teamId}
        )
      `);
      await asUser(worker.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area 2', 'Activity 2', ${workDate}, 'day',
          ${worker.employeeId}, null, null, ${[worker.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null, ${teamId}
        )
      `);

      const counted = await sql`select id from lmra_assessments where daily_team_id = ${teamId} and work_date = ${workDate} and archived_at is null`;
      expect(counted).toHaveLength(2);

      await deleteTestUser(foreman.userId);
    });
  });

  describe("My LMRAs / All LMRAs list modes (navigation/context redesign, items 8-9)", () => {
    // Mirrors modules/lmra/queries.ts's listMyLmraAssessments exactly: union
    // of (completed_by_employee_id OR responsible_person_id), lmra_participants,
    // and lmra_hazards.responsible_person_id — deduplicated by assessment id.
    async function myLmraIds(projectId: string, employeeId: string): Promise<string[]> {
      const owned = await sql`select id from lmra_assessments where project_id = ${projectId} and (completed_by_employee_id = ${employeeId} or responsible_person_id = ${employeeId})`;
      const participant = await sql`select lmra_assessment_id as id from lmra_participants where employee_id = ${employeeId}`;
      const hazardResponsible = await sql`select lmra_assessment_id as id from lmra_hazards where responsible_person_id = ${employeeId}`;
      return [...new Set([...owned, ...participant, ...hazardResponsible].map((row) => row.id))];
    }

    it("My LMRAs includes an assessment where the employee is the completed-by person", async () => {
      const projectId = await createTestProject(companyA.companyId, "My LMRAs Completed By Project");
      const worker = await rosterEmployee(projectId, "MyLmraCompletedBy");
      const [assessment] = await asUser(worker.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-20', 'day',
          ${worker.employeeId}, null, null, ${[]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
        )
      `);
      const ids = await myLmraIds(projectId, worker.employeeId);
      expect(ids).toContain(assessment.id);
    });

    it("My LMRAs includes an assessment where the employee is only a participant (Workers Involved), not the completer", async () => {
      const projectId = await createTestProject(companyA.companyId, "My LMRAs Participant Project");
      const completer = await rosterEmployee(projectId, "MyLmraCompleter");
      const participant = await rosterEmployee(projectId, "MyLmraParticipant");
      const [assessment] = await asUser(completer.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-20', 'day',
          ${completer.employeeId}, null, null, ${[completer.employeeId, participant.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
        )
      `);
      const completerIds = await myLmraIds(projectId, completer.employeeId);
      const participantIds = await myLmraIds(projectId, participant.employeeId);
      expect(completerIds).toContain(assessment.id);
      expect(participantIds).toContain(assessment.id);
    });

    it("My LMRAs includes an assessment where the employee is the assessment-level responsible person", async () => {
      const projectId = await createTestProject(companyA.companyId, "My LMRAs Responsible Project");
      const completer = await rosterEmployee(projectId, "MyLmraRespCompleter");
      const responsible = await rosterEmployee(projectId, "MyLmraResponsible");
      const [assessment] = await asUser(completer.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-20', 'day',
          ${completer.employeeId}, ${responsible.employeeId}, null, ${[completer.employeeId, responsible.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
        )
      `);
      const ids = await myLmraIds(projectId, responsible.employeeId);
      expect(ids).toContain(assessment.id);
    });

    it("My LMRAs includes an assessment where the employee is a hazard-level responsible person (via the lmra_hazards union branch, independent of the participant branch)", async () => {
      // create_lmra_assessment requires every hazard-level responsible_person_id
      // to also be a participant (20260823090000's atomicity check), so this
      // exercises the hazard-responsible UNION branch specifically, even
      // though — by that same rule — the employee is necessarily also a
      // participant here.
      const projectId = await createTestProject(companyA.companyId, "My LMRAs Hazard Responsible Project");
      const completer = await rosterEmployee(projectId, "MyLmraHazCompleter");
      const hazardResponsible = await rosterEmployee(projectId, "MyLmraHazResponsible");
      const hazards = freshHazards({ hazardType: "housekeeping", isApplicable: true });
      const hazardsWithResponsible = hazards.map((h) => (h.hazard_type === "housekeeping" ? { ...h, responsible_person_id: hazardResponsible.employeeId } : h));
      const [assessment] = await asUser(completer.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-20', 'day',
          ${completer.employeeId}, null, null, ${[completer.employeeId, hazardResponsible.employeeId]}, ${JSON.stringify(hazardsWithResponsible)}::jsonb, false, 'go', null
        )
      `);
      const ids = await myLmraIds(projectId, hazardResponsible.employeeId);
      expect(ids).toContain(assessment.id);
    });

    it("deduplicates an employee who is BOTH completed-by AND a participant on the same assessment — never returned twice", async () => {
      const projectId = await createTestProject(companyA.companyId, "My LMRAs Dedup Project");
      const worker = await rosterEmployee(projectId, "MyLmraDedup");
      const [assessment] = await asUser(worker.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-20', 'day',
          ${worker.employeeId}, null, null, ${[worker.employeeId]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
        )
      `);
      const ids = await myLmraIds(projectId, worker.employeeId);
      expect(ids.filter((id) => id === assessment.id)).toHaveLength(1);
    });

    it("All LMRAs is scoped to the active project only — a different project's LMRA never appears, even in the same company", async () => {
      const projectOne = await createTestProject(companyA.companyId, "All LMRAs Project One");
      const projectTwo = await createTestProject(companyA.companyId, "All LMRAs Project Two");
      const workerOne = await rosterEmployee(projectOne, "AllLmrasProjectOneWorker");
      const workerTwo = await rosterEmployee(projectTwo, "AllLmrasProjectTwoWorker");

      const [assessmentOne] = await asUser(workerOne.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectOne}, 'Area', 'Activity', '2026-08-20', 'day',
          ${workerOne.employeeId}, null, null, ${[]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
        )
      `);
      await asUser(workerTwo.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectTwo}, 'Area', 'Activity', '2026-08-20', 'day',
          ${workerTwo.employeeId}, null, null, ${[]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
        )
      `);

      // "All LMRAs" (listLmraAssessments with a forced projectId filter) — same shape as this query.
      const allForProjectOne = await sql`select id from lmra_assessments where company_id = ${companyA.companyId} and project_id = ${projectOne}`;
      expect(allForProjectOne.map((row) => row.id)).toEqual([assessmentOne.id]);
    });
  });

  it("cross-company isolation: a company B caller cannot create an LMRA in company A", async () => {
    const projectId = await createTestProject(companyA.companyId, "Cross Company Project");
    const bUser = await createTestUser("Company B Caller");
    await addMembership(companyB.companyId, bUser.userId, ["hseq_manager"]);

    await expect(
      asUser(bUser.userId, (tx) => tx`
        select * from create_lmra_assessment(
          ${companyA.companyId}, ${projectId}, 'Area', 'Activity', '2026-08-10', 'day',
          ${bUser.userId}, null, null, ${[]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
        )
      `),
    ).rejects.toBeDefined();

    await deleteTestUser(bUser.userId);
  });
});
