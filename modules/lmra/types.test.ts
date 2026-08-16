import { describe, it, expect } from "vitest";
import { initialLmraHazardRows, lmraHazardInputsFromRows, LMRA_HAZARD_TYPES, LMRA_COMMON_CONTROLS, buildMyTodaysTeamParticipantIds, resolveLmraDateRange } from "./types";

describe("initialLmraHazardRows", () => {
  it("returns exactly 12 rows, one per LMRA_HAZARD_TYPES entry, in that fixed order", () => {
    const rows = initialLmraHazardRows();
    expect(rows).toHaveLength(12);
    expect(rows.map((row) => row.hazardType)).toEqual(LMRA_HAZARD_TYPES);
  });

  it("every fresh row starts inapplicable with empty controls", () => {
    for (const row of initialLmraHazardRows()) {
      expect(row.isApplicable).toBe(false);
      expect(row.selectedControls).toEqual([]);
      expect(row.controls).toBe("");
      expect(row.responsiblePersonId).toBeNull();
      expect(row.controlsConfirmed).toBe(false);
      expect(row.otherDescription).toBe("");
    }
  });
});

describe("lmraHazardInputsFromRows", () => {
  it("maps an existing assessment's DB rows into the camelCase input shape, preserving values", () => {
    const rows = lmraHazardInputsFromRows([
      {
        hazard_type: "working_at_height",
        is_applicable: true,
        selected_controls: ["Approved scaffold or work platform"],
        controls: "Extra tie-off point added",
        responsible_person_id: "123e4567-e89b-42d3-a456-426614174000",
        controls_confirmed: true,
        other_description: null,
      },
    ]);

    const heightRow = rows.find((row) => row.hazardType === "working_at_height")!;
    expect(heightRow.isApplicable).toBe(true);
    expect(heightRow.selectedControls).toEqual(["Approved scaffold or work platform"]);
    expect(heightRow.controls).toBe("Extra tie-off point added");
    expect(heightRow.responsiblePersonId).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(heightRow.controlsConfirmed).toBe(true);
  });

  it("always returns exactly 12 rows, filling in defaults for any hazard type missing from the input", () => {
    const rows = lmraHazardInputsFromRows([]);
    expect(rows).toHaveLength(12);
    expect(rows.every((row) => row.isApplicable === false)).toBe(true);
  });

  it("preserves LMRA_HAZARD_TYPES' fixed order regardless of input order", () => {
    const rows = lmraHazardInputsFromRows([
      { hazard_type: "other", is_applicable: false, selected_controls: [], controls: null, responsible_person_id: null, controls_confirmed: false, other_description: null },
      { hazard_type: "working_at_height", is_applicable: false, selected_controls: [], controls: null, responsible_person_id: null, controls_confirmed: false, other_description: null },
    ]);
    expect(rows.map((row) => row.hazardType)).toEqual(LMRA_HAZARD_TYPES);
  });
});

describe("LMRA_COMMON_CONTROLS", () => {
  it("has an entry for every one of the 12 fixed hazard types", () => {
    for (const hazardType of LMRA_HAZARD_TYPES) {
      expect(LMRA_COMMON_CONTROLS[hazardType]).toBeDefined();
      expect(Array.isArray(LMRA_COMMON_CONTROLS[hazardType])).toBe(true);
    }
  });

  it("'other' has no predefined common controls — it's a catch-all served by other_description instead", () => {
    expect(LMRA_COMMON_CONTROLS.other).toEqual([]);
  });

  it("every non-'other' hazard type has at least one predefined common control", () => {
    for (const hazardType of LMRA_HAZARD_TYPES) {
      if (hazardType === "other") continue;
      expect(LMRA_COMMON_CONTROLS[hazardType].length).toBeGreaterThan(0);
    }
  });

  it("item 3: Working at Height has an explicit, separate harness control — never relying only on '100% tie-off' to imply it", () => {
    expect(LMRA_COMMON_CONTROLS.working_at_height).toContain("Safety harness worn and correctly fitted");
    expect(LMRA_COMMON_CONTROLS.working_at_height.some((control) => control.toLowerCase().includes("tie-off"))).toBe(true);
  });

  it("item 3: Working at Height distinguishes every required control listed in the instruction", () => {
    const controls = LMRA_COMMON_CONTROLS.working_at_height;
    expect(controls).toContain("Approved scaffold or work platform");
    expect(controls).toContain("Safety harness worn and correctly fitted");
    expect(controls).toContain("100% tie-off maintained where required");
    expect(controls).toContain("Connected to an approved anchor point");
    expect(controls).toContain("Scaffold inspected and tagged before use");
    expect(controls).toContain("Tools secured against falling");
    expect(controls).toContain("Keep the area below clear or barricaded");
    expect(controls).toContain("Rescue plan understood and available");
  });

  it("item 4: Line of Fire uses the simplified, one-instruction-per-line wording", () => {
    expect(LMRA_COMMON_CONTROLS.line_of_fire).toEqual([
      "Keep away from moving equipment",
      "Do not stand below suspended loads",
      "Keep hands away from pinch/crush points",
      "Barricade the danger area where needed",
      "Make sure the operator can see you",
      "Use a spotter when needed",
    ]);
  });

  it("item 4: no control string exceeds a short, simple sentence — a rough proxy for 'short sentences, common words'", () => {
    for (const hazardType of LMRA_HAZARD_TYPES) {
      for (const control of LMRA_COMMON_CONTROLS[hazardType]) {
        expect(control.length).toBeLessThanOrEqual(60);
      }
    }
  });

  it("item 4: the old, more technical wording no longer appears verbatim", () => {
    expect(LMRA_COMMON_CONTROLS.falling_objects).not.toContain("Exclusion zone established below work area");
    expect(LMRA_COMMON_CONTROLS.line_of_fire).not.toContain("No work permitted directly below/above others");
  });
});

describe("buildMyTodaysTeamParticipantIds — item 2's 'Add My Today's Team'", () => {
  function employee(id: string) {
    return { id } as never;
  }

  it("adds the Foreman and every worker plus the caller", () => {
    const team = { foreman: employee("foreman-1"), workers: [{ employee: employee("worker-1") }, { employee: employee("worker-2") }] };
    const ids = buildMyTodaysTeamParticipantIds(team, "me-1");
    expect(ids.sort()).toEqual(["foreman-1", "me-1", "worker-1", "worker-2"].sort());
  });

  it("deduplicates the caller when they are already the Foreman or a worker", () => {
    const asForeman = buildMyTodaysTeamParticipantIds({ foreman: employee("me-1"), workers: [{ employee: employee("worker-1") }] }, "me-1");
    expect(asForeman.filter((id) => id === "me-1")).toHaveLength(1);

    const asWorker = buildMyTodaysTeamParticipantIds({ foreman: employee("foreman-1"), workers: [{ employee: employee("me-1") }] }, "me-1");
    expect(asWorker.filter((id) => id === "me-1")).toHaveLength(1);
  });

  it("handles a team with no Foreman assigned", () => {
    const ids = buildMyTodaysTeamParticipantIds({ foreman: null, workers: [{ employee: employee("worker-1") }] }, "me-1");
    expect(ids.sort()).toEqual(["me-1", "worker-1"].sort());
  });

  it("handles a team with no other workers — just the caller", () => {
    const ids = buildMyTodaysTeamParticipantIds({ foreman: null, workers: [] }, "me-1");
    expect(ids).toEqual(["me-1"]);
  });
});

describe("resolveLmraDateRange", () => {
  const reference = new Date("2026-08-20T15:30:00Z"); // a Thursday, mid-month

  it("'today' returns the same date for both bounds", () => {
    expect(resolveLmraDateRange("today", {}, reference)).toEqual({ dateFrom: "2026-08-20", dateTo: "2026-08-20" });
  });

  it("'7d' spans exactly 7 calendar days including today", () => {
    expect(resolveLmraDateRange("7d", {}, reference)).toEqual({ dateFrom: "2026-08-14", dateTo: "2026-08-20" });
  });

  it("'30d' spans exactly 30 calendar days including today", () => {
    expect(resolveLmraDateRange("30d", {}, reference)).toEqual({ dateFrom: "2026-07-22", dateTo: "2026-08-20" });
  });

  it("'month' spans from the 1st of the current month through today", () => {
    expect(resolveLmraDateRange("month", {}, reference)).toEqual({ dateFrom: "2026-08-01", dateTo: "2026-08-20" });
  });

  it("'custom' passes through whatever the caller supplied, unmodified", () => {
    expect(resolveLmraDateRange("custom", { dateFrom: "2026-01-01", dateTo: "2026-02-15" }, reference)).toEqual({ dateFrom: "2026-01-01", dateTo: "2026-02-15" });
    expect(resolveLmraDateRange("custom", {}, reference)).toEqual({ dateFrom: undefined, dateTo: undefined });
  });

  it("'all' returns no date bounds at all — the caller (page.tsx) is still required to paginate separately", () => {
    expect(resolveLmraDateRange("all", {}, reference)).toEqual({});
  });

  it("crosses a month boundary correctly for '30d'", () => {
    const earlyMonth = new Date("2026-03-05T00:00:00Z");
    expect(resolveLmraDateRange("30d", {}, earlyMonth)).toEqual({ dateFrom: "2026-02-04", dateTo: "2026-03-05" });
  });
});
