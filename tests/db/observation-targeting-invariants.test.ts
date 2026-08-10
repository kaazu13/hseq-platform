import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, createTestCompany, deleteTestCompany, createTestProject, createTestEmployee, CHECK_VIOLATION } from "./helpers";

/**
 * Safety Observation targeting/type CHECK constraints (Phase G) — covers
 * supabase/migrations/20260814090000_observation_targeting.sql's
 * safety_observations_target_consistency and
 * safety_observations_disposition_only_when_negative directly via raw
 * inserts (bypassing RLS as the local superuser role — same "constraint-
 * only, full round trip needs an eligible observer/reviewer set up through
 * the app layer" scoping tests/db/scaffold-numbering-and-void-workflow.test.ts
 * already uses for this codebase's other CHECK-constraint-only coverage).
 */
describe("safety observation targeting invariants", () => {
  let companyId: string;
  let projectId: string;
  let observerId: string;

  beforeAll(async () => {
    const company = await createTestCompany("observation-targeting");
    companyId = company.companyId;
    projectId = await createTestProject(companyId, "Observation Targeting Project");
    observerId = await createTestEmployee(companyId, null, "Observation", "Observer");
  });

  afterAll(async () => {
    await deleteTestCompany(companyId);
    await sql.end();
  });

  function insertObservation(opts: {
    targetType?: string;
    targetEmployeeId?: string | null;
    targetDailyTeamId?: string | null;
    observationType?: string;
    disposition?: string | null;
  }) {
    const targetType = opts.targetType ?? "general";
    const targetEmployeeId = opts.targetEmployeeId ?? null;
    const targetDailyTeamId = opts.targetDailyTeamId ?? null;
    const observationType = opts.observationType ?? "general";
    const disposition = opts.disposition ?? null;
    return sql`
      insert into safety_observations (
        company_id, project_id, work_area, observer_id, category, description,
        target_type, target_employee_id, target_daily_team_id, observation_type, disposition
      ) values (
        ${companyId}, ${projectId}, 'Scaffold bay 2', ${observerId}, 'housekeeping', 'Test observation',
        ${targetType}, ${targetEmployeeId}, ${targetDailyTeamId}, ${observationType}, ${disposition}
      )
    `;
  }

  it("accepts target_type=general with no target_employee_id/target_daily_team_id", async () => {
    await expect(insertObservation({})).resolves.toBeDefined();
  });

  it("rejects target_type=employee with no target_employee_id — safety_observations_target_consistency", async () => {
    await expect(insertObservation({ targetType: "employee" })).rejects.toMatchObject(CHECK_VIOLATION);
  });

  it("accepts target_type=employee with a matching target_employee_id", async () => {
    const targetEmployeeId = await createTestEmployee(companyId, null, "Target", "Employee");
    await expect(insertObservation({ targetType: "employee", targetEmployeeId })).resolves.toBeDefined();
  });

  it("rejects target_type=general that still supplies a target_employee_id", async () => {
    const targetEmployeeId = await createTestEmployee(companyId, null, "Stray", "Target");
    await expect(insertObservation({ targetType: "general", targetEmployeeId })).rejects.toMatchObject(CHECK_VIOLATION);
  });

  it("rejects a disposition when observation_type is not negative — safety_observations_disposition_only_when_negative", async () => {
    await expect(insertObservation({ observationType: "positive", disposition: "coaching" })).rejects.toMatchObject(CHECK_VIOLATION);
  });

  it("accepts a disposition when observation_type is negative", async () => {
    await expect(insertObservation({ observationType: "negative", disposition: "coaching" })).resolves.toBeDefined();
  });

  it("accepts every observation_type value (positive/negative/general)", async () => {
    for (const observationType of ["positive", "negative", "general"]) {
      await expect(insertObservation({ observationType })).resolves.toBeDefined();
    }
  });
});
