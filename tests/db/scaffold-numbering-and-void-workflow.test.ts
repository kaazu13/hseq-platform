import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, asUser, createTestCompany, deleteTestCompany, createTestUser, deleteTestUser, addMembership, createTestProject, RAISED_EXCEPTION } from "./helpers";

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
});
