import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, asUser, createTestCompany, deleteTestCompany, createTestUser, deleteTestUser, addMembership, createTestEmployee, createTestProject, RAISED_EXCEPTION, RLS_VIOLATION } from "./helpers";

/**
 * External report sharing invariants — covers
 * supabase/migrations/20260817090000_report_pdf_export_and_sharing.sql (and
 * its two follow-up fixes) directly: token round-trip (create → resolve →
 * revoke → resolve-returns-null), uniform null on every invalid-token shape
 * (never distinguishing why), and that only a manage-tier caller in the
 * OWNING company can create or revoke a share — mirroring the exact live,
 * manual round-trip verification already performed against the remote
 * database while building this migration (see the session's own report),
 * now captured as a repeatable local-Supabase test.
 */

function freshHazards() {
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
    is_applicable: false,
    controls: null,
    selected_controls: [],
    responsible_person_id: null,
    controls_confirmed: false,
    other_description: null,
  }));
}

describe("report sharing invariants", () => {
  let companyA: Awaited<ReturnType<typeof createTestCompany>>;
  let companyB: Awaited<ReturnType<typeof createTestCompany>>;
  let adminA: Awaited<ReturnType<typeof createTestUser>>; // company_admin in Company A
  let adminB: Awaited<ReturnType<typeof createTestUser>>; // company_admin in Company B — unrelated to any Company A record

  beforeAll(async () => {
    companyA = await createTestCompany("report-shares-a");
    companyB = await createTestCompany("report-shares-b");
    adminA = await createTestUser("Report Share Admin A");
    adminB = await createTestUser("Report Share Admin B");
    await addMembership(companyA.companyId, adminA.userId, ["company_admin"]);
    await addMembership(companyB.companyId, adminB.userId, ["company_admin"]);
  });

  afterAll(async () => {
    await deleteTestCompany(companyA.companyId);
    await deleteTestCompany(companyB.companyId);
    await deleteTestUser(adminA.userId);
    await deleteTestUser(adminB.userId);
    await sql.end();
  });

  async function createTestLmra(): Promise<{ projectId: string; lmraId: string }> {
    const projectId = await createTestProject(companyA.companyId, "Report Share Project");
    const employeeId = await createTestEmployee(companyA.companyId, null, "Share", "Subject");
    const [assessment] = await asUser(adminA.userId, (tx) => tx`
      select * from create_lmra_assessment(
        ${companyA.companyId}, ${projectId}, 'Scaffold bay 7', 'Erecting scaffold', '2026-08-10', 'day',
        ${employeeId}, null, null, ${[]}, ${JSON.stringify(freshHazards())}::jsonb, false, 'go', null
      )
    `);
    return { projectId, lmraId: assessment.id };
  }

  it("round-trips a share: create resolves correctly, revoke makes it resolve to null", async () => {
    const { projectId, lmraId } = await createTestLmra();

    const [share] = await asUser(adminA.userId, (tx) => tx`select * from create_report_share(${companyA.companyId}, ${projectId}, 'lmra', ${lmraId}, null)`);
    expect(share.token).toBeTruthy();
    expect(share.id).toBeTruthy();

    const [resolved] = await sql`select resolve_public_report(${share.token}) as payload`;
    expect(resolved.payload).not.toBeNull();
    expect(resolved.payload.share.record_type).toBe("lmra");
    expect(resolved.payload.record.id).toBe(lmraId);
    expect(resolved.payload.record.work_area).toBe("Scaffold bay 7");
    expect(resolved.payload.company.id).toBe(companyA.companyId);

    await asUser(adminA.userId, (tx) => tx`select * from revoke_report_share(${share.id})`);

    const [afterRevoke] = await sql`select resolve_public_report(${share.token}) as payload`;
    expect(afterRevoke.payload).toBeNull();
  });

  it("an expired share resolves to null, indistinguishable from a revoked or unknown token", async () => {
    const { projectId, lmraId } = await createTestLmra();
    const [share] = await asUser(adminA.userId, (tx) => tx`select * from create_report_share(${companyA.companyId}, ${projectId}, 'lmra', ${lmraId}, now() + interval '1 second')`);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const [resolved] = await sql`select resolve_public_report(${share.token}) as payload`;
    expect(resolved.payload).toBeNull();
  });

  it("a malformed or entirely unknown token resolves to null, never an error", async () => {
    const [garbage] = await sql`select resolve_public_report('not-a-real-token') as payload`;
    expect(garbage.payload).toBeNull();

    const [random] = await sql`select resolve_public_report(encode(gen_random_bytes(32), 'hex')) as payload`;
    expect(random.payload).toBeNull();
  });

  it("rejects expires_at in the past at creation time", async () => {
    const { projectId, lmraId } = await createTestLmra();
    await expect(asUser(adminA.userId, (tx) => tx`select * from create_report_share(${companyA.companyId}, ${projectId}, 'lmra', ${lmraId}, now() - interval '1 hour')`)).rejects.toMatchObject(
      RAISED_EXCEPTION,
    );
  });

  it("a caller with no reach into the owning company cannot create a share for its record", async () => {
    const { projectId, lmraId } = await createTestLmra();
    await expect(asUser(adminB.userId, (tx) => tx`select * from create_report_share(${companyA.companyId}, ${projectId}, 'lmra', ${lmraId}, null)`)).rejects.toMatchObject(RLS_VIOLATION);
  });

  it("a caller with no reach into the owning company cannot revoke its share", async () => {
    const { projectId, lmraId } = await createTestLmra();
    const [share] = await asUser(adminA.userId, (tx) => tx`select * from create_report_share(${companyA.companyId}, ${projectId}, 'lmra', ${lmraId}, null)`);

    await expect(asUser(adminB.userId, (tx) => tx`select * from revoke_report_share(${share.id})`)).rejects.toMatchObject(RAISED_EXCEPTION);

    // Untouched — still resolves normally, proving the cross-company attempt had no effect.
    const [resolved] = await sql`select resolve_public_report(${share.token}) as payload`;
    expect(resolved.payload).not.toBeNull();
  });

  it("re-revoking an already-revoked share is rejected, not silently accepted", async () => {
    const { projectId, lmraId } = await createTestLmra();
    const [share] = await asUser(adminA.userId, (tx) => tx`select * from create_report_share(${companyA.companyId}, ${projectId}, 'lmra', ${lmraId}, null)`);
    await asUser(adminA.userId, (tx) => tx`select * from revoke_report_share(${share.id})`);
    await expect(asUser(adminA.userId, (tx) => tx`select * from revoke_report_share(${share.id})`)).rejects.toMatchObject(RAISED_EXCEPTION);
  });
});
