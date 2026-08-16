import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  sql,
  asUser,
  createTestCompany,
  deleteTestCompany,
  createTestUser,
  deleteTestUser,
  addMembership,
  createTestProject,
  createTestEmployee,
  createTestTeam,
  RAISED_EXCEPTION,
} from "./helpers";

/**
 * Scaffold-number allocation (per-project, concurrency-safe counter table —
 * supabase/migrations/20260808090000_scaffold_numbering_and_inspection_reference.sql)
 * and the void-workflow constraints
 * (supabase/migrations/20260810090000_scaffold_inspection_void_workflow.sql).
 *
 * Scoped to what's testable WITHOUT a fully eligible scaffold row (a real
 * scaffold insert requires an eligible Responsible Foreman — an active
 * team assignment plus the Foreman company role — which is exercised by
 * modules/scaffolds/validation.test.ts and this milestone's authenticated
 * runtime smoke test instead, not re-derived here). allocate_scaffold_number()
 * only needs a real project, so its uniqueness/per-project-scoping
 * guarantee is directly testable; the void-workflow CHECK constraints are
 * directly testable via raw scaffold_inspections rows too.
 */
describe("scaffold number allocation", () => {
  let company: Awaited<ReturnType<typeof createTestCompany>>;

  beforeAll(async () => {
    company = await createTestCompany("scaffold-numbering");
  });

  afterAll(async () => {
    await deleteTestCompany(company.companyId);
    await sql.end();
  });

  it("allocates sequential numbers starting at 1, scoped independently per project", async () => {
    const projectA = await createTestProject(company.companyId, "Numbering Project A");
    const projectB = await createTestProject(company.companyId, "Numbering Project B");

    const [firstA] = await sql`select allocate_scaffold_number(${projectA}) as n`;
    const [secondA] = await sql`select allocate_scaffold_number(${projectA}) as n`;
    const [firstB] = await sql`select allocate_scaffold_number(${projectB}) as n`;

    expect(firstA.n).toBe(1);
    expect(secondA.n).toBe(2);
    // A different project's numbering starts fresh at 1 — scaffold_number
    // is unique PER PROJECT, not company-wide (this milestone's explicit
    // requirement).
    expect(firstB.n).toBe(1);
  });

  it("never allocates the same number twice for the same project under concurrent callers", async () => {
    const projectId = await createTestProject(company.companyId, "Concurrency Project");

    const results = await Promise.all(Array.from({ length: 10 }, () => sql`select allocate_scaffold_number(${projectId}) as n`));
    const numbers = results.map((r) => r[0].n as number).sort((a, b) => a - b);

    expect(new Set(numbers).size).toBe(10); // no duplicates
    expect(numbers).toEqual(Array.from({ length: 10 }, (_, i) => i + 1)); // exactly 1..10, no gaps
  });
});

describe("scaffold inspection void workflow — table-level constraints", () => {
  let company: Awaited<ReturnType<typeof createTestCompany>>;
  let admin: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    company = await createTestCompany("void-workflow");
    admin = await createTestUser("Void Workflow Admin");
    await addMembership(company.companyId, admin.userId, ["company_admin"]);
    // A full round-trip void test needs an eligible scaffold row (a real
    // Responsible Foreman with an active Foreman team assignment —
    // validate_scaffold_insert() always enforces this, even for a raw
    // superuser insert) — out of scope here; see this file's header
    // comment.
  });

  afterAll(async () => {
    await deleteTestCompany(company.companyId);
    await deleteTestUser(admin.userId);
    await sql.end();
  });

  it("scaffold_inspections_void_only_while_draft encodes 'voided_at set implies status = draft'", async () => {
    // A full behavioral test (insert a finalized inspection, attempt to
    // void it, assert rejection) needs an eligible scaffold row — see this
    // file's header comment for why that's out of scope here. This
    // confirms the shipped CHECK constraint's definition directly instead.
    const [constraint] = await sql`
      select pg_get_constraintdef(oid) as def
      from pg_constraint
      where conname = 'scaffold_inspections_void_only_while_draft'
    `;
    expect(constraint.def).toContain("voided_at IS NULL");
    expect(constraint.def).toContain("status = 'draft'");
  });

  it("scaffold_inspections_void_reason_required rejects a blank void_reason", async () => {
    const [constraint] = await sql`
      select pg_get_constraintdef(oid) as def
      from pg_constraint
      where conname = 'scaffold_inspections_void_reason_required'
    `;
    expect(constraint.def).toBeTruthy();
  });

  it("void_scaffold_inspection() raises for a nonexistent inspection id", async () => {
    await expect(
      asUser(admin.userId, (tx) => tx`select void_scaffold_inspection(gen_random_uuid(), 'test reason')`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  it("void_scaffold_inspection() raises when no reason is given", async () => {
    await expect(
      asUser(admin.userId, (tx) => tx`select void_scaffold_inspection(gen_random_uuid(), '')`),
    ).rejects.toMatchObject(RAISED_EXCEPTION);
  });

  /** A genuinely eligible Responsible Foreman — company-wide 'foreman' role AND an active team_assignments row on the project, exactly what is_eligible_scaffold_foreman()/validate_scaffold_insert() require. Same shape as tests/db/daily-workforce-invariants.test.ts's own createTestForeman. */
  async function createTestForeman(companyId: string, projectId: string, firstName: string, lastName: string) {
    const user = await createTestUser(`${firstName} ${lastName}`);
    await addMembership(companyId, user.userId, ["foreman"]);
    const employeeId = await createTestEmployee(companyId, user.userId, firstName, lastName);
    const teamId = await createTestTeam(companyId, projectId, `${firstName} Legacy Team`);
    await sql`insert into team_assignments (company_id, project_id, team_id, employee_id, assignment_role) values (${companyId}, ${projectId}, ${teamId}, ${employeeId}, 'foreman')`;
    return { userId: user.userId, employeeId };
  }

  describe("audit fix (20260830099000): scaffold_inspection_items cannot be edited once the parent inspection is voided", () => {
    async function makeDraftInspection(projectId: string, foremanEmployeeId: string, tagNumber: string) {
      const [scaffold] = await sql`
        insert into scaffolds (company_id, project_id, tag_number, work_area, scaffold_type, intended_use, max_load_class, responsible_foreman_id)
        values (${company.companyId}, ${projectId}, ${tagNumber}, 'Area 1', 'independent', 'General access', 'Light Duty 2.0 kN/m2', ${foremanEmployeeId})
        returning id
      `;
      const [inspection] = await sql`
        insert into scaffold_inspections (company_id, scaffold_id, project_id, inspection_reason, inspector_id)
        values (${company.companyId}, ${scaffold.id}, ${projectId}, 'routine_inspection', ${foremanEmployeeId})
        returning id
      `;
      const [item] = await sql`select id, item_type from scaffold_inspection_items where scaffold_inspection_id = ${inspection.id} limit 1`;
      return { inspectionId: inspection.id as string, itemId: item.id as string, itemType: item.item_type as string };
    }

    it("save_scaffold_inspection_items on a VOIDED draft is rejected — status stays 'draft' when voided, so the checklist edit guard must check voided_at explicitly, not just status", async () => {
      const projectId = await createTestProject(company.companyId, "Voided Checklist Edit Project");
      const foreman = await createTestForeman(company.companyId, projectId, "Voided", "Checklist");
      const { inspectionId, itemType } = await makeDraftInspection(projectId, foreman.employeeId, "TAG-VOID-1");

      await asUser(admin.userId, (tx) => tx`select void_scaffold_inspection(${inspectionId}, 'Mistaken entry')`);
      const [voided] = await sql`select status, voided_at from scaffold_inspections where id = ${inspectionId}`;
      expect(voided.status).toBe("draft"); // deliberately unchanged — voiding is not a status transition
      expect(voided.voided_at).not.toBeNull();

      await expect(
        asUser(
          admin.userId,
          (tx) => tx`
            select save_scaffold_inspection_items(${inspectionId}, ${JSON.stringify([
              { item_type: itemType, result: "defect_found", comment: "attempted edit after void", required_corrective_action: "fix it", severity: "low" },
            ])}::jsonb)
          `,
        ),
      ).rejects.toMatchObject(RAISED_EXCEPTION);

      await deleteTestUser(foreman.userId);
    });

    it("a raw UPDATE directly on scaffold_inspection_items (bypassing save_scaffold_inspection_items entirely) is rejected once the parent is voided", async () => {
      const projectId = await createTestProject(company.companyId, "Voided Checklist Raw Update Project");
      const foreman = await createTestForeman(company.companyId, projectId, "RawVoid", "Checklist");
      const { inspectionId, itemId } = await makeDraftInspection(projectId, foreman.employeeId, "TAG-VOID-2");

      await asUser(admin.userId, (tx) => tx`select void_scaffold_inspection(${inspectionId}, 'Mistaken entry')`);

      await expect(sql`update scaffold_inspection_items set result = 'defect_found' where id = ${itemId}`).rejects.toMatchObject(RAISED_EXCEPTION);
      const [unchanged] = await sql`select result from scaffold_inspection_items where id = ${itemId}`;
      expect(unchanged.result).toBeNull();

      await deleteTestUser(foreman.userId);
    });

    it("the checklist on a genuinely non-voided draft is still freely editable (no regression)", async () => {
      const projectId = await createTestProject(company.companyId, "Non Voided Checklist Edit Project");
      const foreman = await createTestForeman(company.companyId, projectId, "NotVoided", "Checklist");
      const { inspectionId, itemType, itemId } = await makeDraftInspection(projectId, foreman.employeeId, "TAG-VOID-3");

      await asUser(
        admin.userId,
        (tx) => tx`
          select save_scaffold_inspection_items(${inspectionId}, ${JSON.stringify([
            { item_type: itemType, result: "acceptable", comment: "legit edit, not voided", required_corrective_action: null, severity: null },
          ])}::jsonb)
        `,
      );

      const [row] = await sql`select result, comment from scaffold_inspection_items where id = ${itemId}`;
      expect(row).toMatchObject({ result: "acceptable", comment: "legit edit, not voided" });

      await deleteTestUser(foreman.userId);
    });
  });
});
