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
