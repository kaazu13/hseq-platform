import { describe, it, expect } from "vitest";
import {
  lmraShiftSchema,
  lmraHazardSchema,
  lmraHazardsFormSchema,
  lmraParticipantsFormSchema,
  lmraCreateFormSchema,
  lmraEditFormSchema,
  lmraReviewFormSchema,
  lmraSubmitFormSchema,
} from "./validation";
import { LMRA_COMMON_CONTROLS, LMRA_MAX_PARTICIPANTS, LMRA_WORK_AREA_MAX_LENGTH, LMRA_WORK_ACTIVITY_MAX_LENGTH, initialLmraHazardRows } from "./types";

// zod's .uuid() validates the version/variant nibbles, not just the
// hyphenation shape — an all-zero placeholder like
// "00000000-0000-0000-0000-000000000001" fails it (version nibble '0' isn't
// a real UUID version), so these fixtures use valid-shaped v4 UUIDs.
const PROJECT_ID = "123e4567-e89b-42d3-a456-426614174000";
const EMPLOYEE_ID = "123e4567-e89b-42d3-a456-426614174001";
const OTHER_EMPLOYEE_ID = "123e4567-e89b-42d3-a456-426614174002";

function validHazardRows() {
  return initialLmraHazardRows();
}

const VALID_CREATE_INPUT = {
  projectId: PROJECT_ID,
  workArea: "Scaffold bay 3",
  workActivity: "Erecting tube-and-clip scaffold",
  workDate: "2026-08-01",
  shift: "day",
  completedByEmployeeId: EMPLOYEE_ID,
  responsiblePersonId: null,
  notes: "",
  participantEmployeeIds: [],
  hazards: validHazardRows(),
  submit: false,
  result: "go",
  stopWorkReason: "",
  confirmed: false,
} as const;

describe("lmraShiftSchema", () => {
  it("accepts the three fixed shift values", () => {
    for (const shift of ["day", "night", "late"]) {
      expect(lmraShiftSchema.safeParse(shift).success).toBe(true);
    }
  });

  it("rejects free text outside the controlled vocabulary", () => {
    expect(lmraShiftSchema.safeParse("Morning").success).toBe(false);
    expect(lmraShiftSchema.safeParse("DAY").success).toBe(false);
  });
});

describe("lmraHazardSchema", () => {
  it("accepts a valid inapplicable row", () => {
    expect(
      lmraHazardSchema.safeParse({
        hazardType: "working_at_height",
        isApplicable: false,
        selectedControls: [],
        controls: "",
        responsiblePersonId: null,
        controlsConfirmed: false,
        otherDescription: "",
      }).success,
    ).toBe(true);
  });

  it("accepts predefined common controls that exist in that hazard's catalogue", () => {
    const controls = LMRA_COMMON_CONTROLS.working_at_height.slice(0, 2);
    expect(
      lmraHazardSchema.safeParse({
        hazardType: "working_at_height",
        isApplicable: true,
        selectedControls: controls,
        controls: "",
        responsiblePersonId: null,
        controlsConfirmed: false,
        otherDescription: "",
      }).success,
    ).toBe(true);
  });

  it("rejects a selected control that isn't in that hazard type's fixed catalogue", () => {
    const result = lmraHazardSchema.safeParse({
      hazardType: "working_at_height",
      isApplicable: true,
      selectedControls: ["Made up control not on the list"],
      controls: "",
      responsiblePersonId: null,
      controlsConfirmed: false,
      otherDescription: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a control valid for a DIFFERENT hazard type — catalogues are hazard-specific, not interchangeable", () => {
    const foreignControl = LMRA_COMMON_CONTROLS.housekeeping[0];
    const result = lmraHazardSchema.safeParse({
      hazardType: "working_at_height",
      isApplicable: true,
      selectedControls: [foreignControl],
      controls: "",
      responsiblePersonId: null,
      controlsConfirmed: false,
      otherDescription: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a hazard type outside the fixed 12-item vocabulary", () => {
    expect(
      lmraHazardSchema.safeParse({
        hazardType: "not_a_real_hazard",
        isApplicable: true,
        selectedControls: [],
        controls: "",
        responsiblePersonId: null,
        controlsConfirmed: false,
        otherDescription: "",
      }).success,
    ).toBe(false);
  });

  it("rejects oversized custom control text (Phase 10 limit)", () => {
    const result = lmraHazardSchema.safeParse({
      hazardType: "other",
      isApplicable: true,
      selectedControls: [],
      controls: "x".repeat(1001),
      responsiblePersonId: null,
      controlsConfirmed: false,
      otherDescription: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an oversized custom hazard description (other_description, Phase 10 limit)", () => {
    const result = lmraHazardSchema.safeParse({
      hazardType: "other",
      isApplicable: true,
      selectedControls: [],
      controls: "",
      responsiblePersonId: null,
      controlsConfirmed: false,
      otherDescription: "x".repeat(151),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an oversized selectedControls array (Phase 10 'sensible upper limit')", () => {
    const result = lmraHazardSchema.safeParse({
      hazardType: "working_at_height",
      isApplicable: true,
      selectedControls: Array.from({ length: 21 }, (_, i) => `control-${i}`),
      controls: "",
      responsiblePersonId: null,
      controlsConfirmed: false,
      otherDescription: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("lmraHazardsFormSchema", () => {
  it("accepts exactly 12 fresh rows", () => {
    expect(lmraHazardsFormSchema.safeParse(validHazardRows()).success).toBe(true);
  });

  it("rejects fewer than 12 rows", () => {
    expect(lmraHazardsFormSchema.safeParse(validHazardRows().slice(0, 11)).success).toBe(false);
  });

  it("rejects more than 12 rows", () => {
    const rows = [...validHazardRows(), validHazardRows()[0]];
    expect(lmraHazardsFormSchema.safeParse(rows).success).toBe(false);
  });
});

describe("lmraParticipantsFormSchema", () => {
  it("accepts an array of uuids, including an empty array", () => {
    expect(lmraParticipantsFormSchema.safeParse([]).success).toBe(true);
    expect(lmraParticipantsFormSchema.safeParse([EMPLOYEE_ID]).success).toBe(true);
  });

  it("rejects a non-uuid entry", () => {
    expect(lmraParticipantsFormSchema.safeParse(["not-a-uuid"]).success).toBe(false);
  });

  it("rejects an oversized participant array (Phase 10 'sensible upper limit')", () => {
    const ids = Array.from({ length: LMRA_MAX_PARTICIPANTS + 1 }, () => EMPLOYEE_ID);
    expect(lmraParticipantsFormSchema.safeParse(ids).success).toBe(false);
  });

  it("accepts exactly the max participant count", () => {
    const ids = Array.from({ length: LMRA_MAX_PARTICIPANTS }, () => EMPLOYEE_ID);
    expect(lmraParticipantsFormSchema.safeParse(ids).success).toBe(true);
  });
});

describe("lmraCreateFormSchema", () => {
  it("accepts a fully populated valid Save Draft input (submit=false, no confirmation required)", () => {
    expect(lmraCreateFormSchema.safeParse(VALID_CREATE_INPUT).success).toBe(true);
  });

  it("rejects submit=true without the confirmation checkbox", () => {
    const result = lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, submit: true, confirmed: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.confirmed).toBeTruthy();
    }
  });

  it("accepts submit=true with confirmation and a go result", () => {
    expect(lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, submit: true, confirmed: true, result: "go" }).success).toBe(true);
  });

  it("rejects submit=true with a no_go result and a blank stop-work reason", () => {
    const result = lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, submit: true, confirmed: true, result: "no_go", stopWorkReason: "" });
    expect(result.success).toBe(false);
  });

  it("accepts submit=true with a no_go result and a stop-work reason", () => {
    expect(
      lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, submit: true, confirmed: true, result: "no_go", stopWorkReason: "Unsafe wind conditions" }).success,
    ).toBe(true);
  });

  it("rejects a non-uuid projectId/completedByEmployeeId", () => {
    expect(lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, projectId: "not-a-uuid" }).success).toBe(false);
    expect(lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, completedByEmployeeId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects blank work area/work activity", () => {
    expect(lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, workArea: "  " }).success).toBe(false);
    expect(lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, workActivity: "" }).success).toBe(false);
  });

  it("rejects oversized work area/work activity (Phase 10 limits)", () => {
    expect(lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, workArea: "x".repeat(LMRA_WORK_AREA_MAX_LENGTH + 1) }).success).toBe(false);
    expect(lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, workActivity: "x".repeat(LMRA_WORK_ACTIVITY_MAX_LENGTH + 1) }).success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, workDate: "08/01/2026" }).success).toBe(false);
    expect(lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, workDate: "" }).success).toBe(false);
  });

  it("rejects a shift outside day/night/late", () => {
    expect(lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, shift: "morning" }).success).toBe(false);
  });

  it("allows notes/responsiblePersonId to be omitted", () => {
    expect(lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, notes: "", responsiblePersonId: null }).success).toBe(true);
  });

  it("accepts a distinct responsiblePersonId from completedByEmployeeId — the two are never conflated — as long as they're a participant", () => {
    expect(
      lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, responsiblePersonId: OTHER_EMPLOYEE_ID, participantEmployeeIds: [OTHER_EMPLOYEE_ID] }).success,
    ).toBe(true);
  });

  describe("item 1: responsible person must be one of Workers involved", () => {
    it("rejects an assessment-level responsiblePersonId that isn't in participantEmployeeIds", () => {
      const result = lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, responsiblePersonId: OTHER_EMPLOYEE_ID, participantEmployeeIds: [] });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.responsiblePersonId).toBeTruthy();
      }
    });

    it("accepts responsiblePersonId === null regardless of participants — 'optional' is preserved", () => {
      expect(lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, responsiblePersonId: null, participantEmployeeIds: [] }).success).toBe(true);
    });

    it("rejects a hazard's responsiblePersonId that isn't in participantEmployeeIds", () => {
      const hazards = validHazardRows();
      hazards[0] = { ...hazards[0], isApplicable: true, responsiblePersonId: OTHER_EMPLOYEE_ID };
      const result = lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, participantEmployeeIds: [], hazards });
      expect(result.success).toBe(false);
    });

    it("accepts a hazard's responsiblePersonId that IS in participantEmployeeIds", () => {
      const hazards = validHazardRows();
      hazards[0] = { ...hazards[0], isApplicable: true, responsiblePersonId: OTHER_EMPLOYEE_ID };
      const result = lmraCreateFormSchema.safeParse({ ...VALID_CREATE_INPUT, participantEmployeeIds: [OTHER_EMPLOYEE_ID], hazards });
      expect(result.success).toBe(true);
    });
  });
});

describe("lmraEditFormSchema", () => {
  const VALID_EDIT_INPUT = {
    workArea: "Scaffold bay 3",
    workActivity: "Erecting tube-and-clip scaffold",
    workDate: "2026-08-01",
    shift: "night",
    responsiblePersonId: null,
    notes: "",
    participantEmployeeIds: [EMPLOYEE_ID],
    hazards: validHazardRows(),
  };

  it("accepts a fully populated valid input — no completedByEmployeeId/submit/result fields at all", () => {
    expect(lmraEditFormSchema.safeParse(VALID_EDIT_INPUT).success).toBe(true);
    expect("completedByEmployeeId" in lmraEditFormSchema.shape).toBe(false);
  });

  it("rejects blank work area/work activity same as create", () => {
    expect(lmraEditFormSchema.safeParse({ ...VALID_EDIT_INPUT, workArea: "" }).success).toBe(false);
  });

  it("item 1: rejects a responsiblePersonId that isn't in participantEmployeeIds", () => {
    expect(lmraEditFormSchema.safeParse({ ...VALID_EDIT_INPUT, responsiblePersonId: OTHER_EMPLOYEE_ID, participantEmployeeIds: [EMPLOYEE_ID] }).success).toBe(false);
  });

  it("item 1: accepts a responsiblePersonId that IS in participantEmployeeIds", () => {
    expect(lmraEditFormSchema.safeParse({ ...VALID_EDIT_INPUT, responsiblePersonId: EMPLOYEE_ID, participantEmployeeIds: [EMPLOYEE_ID] }).success).toBe(true);
  });

  it("item 1: rejects a hazard's responsiblePersonId that isn't a participant", () => {
    const hazards = validHazardRows();
    hazards[0] = { ...hazards[0], isApplicable: true, responsiblePersonId: OTHER_EMPLOYEE_ID };
    expect(lmraEditFormSchema.safeParse({ ...VALID_EDIT_INPUT, participantEmployeeIds: [EMPLOYEE_ID], hazards }).success).toBe(false);
  });
});

describe("lmraReviewFormSchema", () => {
  it("accepts approved/rejected decisions", () => {
    expect(lmraReviewFormSchema.safeParse({ decision: "approved", reviewNotes: "" }).success).toBe(true);
    expect(lmraReviewFormSchema.safeParse({ decision: "rejected", reviewNotes: "Missing fall protection detail" }).success).toBe(true);
  });

  it("rejects any other decision value", () => {
    expect(lmraReviewFormSchema.safeParse({ decision: "pending", reviewNotes: "" }).success).toBe(false);
  });
});

describe("lmraSubmitFormSchema", () => {
  it("accepts a go decision with no stop-work reason", () => {
    expect(lmraSubmitFormSchema.safeParse({ result: "go", stopWorkReason: "" }).success).toBe(true);
  });

  it("accepts a no_go decision WITH a stop-work reason", () => {
    expect(lmraSubmitFormSchema.safeParse({ result: "no_go", stopWorkReason: "Unsafe wind conditions" }).success).toBe(true);
  });

  it("rejects a no_go decision with a blank stop-work reason — the crew must record why work stopped", () => {
    const result = lmraSubmitFormSchema.safeParse({ result: "no_go", stopWorkReason: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.stopWorkReason).toBeTruthy();
    }
  });

  it("rejects a no_go decision with only whitespace as the reason", () => {
    expect(lmraSubmitFormSchema.safeParse({ result: "no_go", stopWorkReason: "   " }).success).toBe(false);
  });
});
