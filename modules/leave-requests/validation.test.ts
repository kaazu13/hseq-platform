import { describe, it, expect } from "vitest";
import { requestLeaveSchema, denyLeaveRequestSchema, returnLeaveRequestSchema } from "./validation";

describe("requestLeaveSchema", () => {
  it("accepts a valid request", () => {
    const result = requestLeaveSchema.safeParse({ leaveType: "annual", startDate: "2026-08-20", endDate: "2026-08-22", comment: "Family trip" });
    expect(result.success).toBe(true);
  });

  it("rejects end date before start date — the critical invariant", () => {
    const result = requestLeaveSchema.safeParse({ leaveType: "annual", startDate: "2026-08-22", endDate: "2026-08-20" });
    expect(result.success).toBe(false);
  });

  it("accepts a single-day request (start === end)", () => {
    expect(requestLeaveSchema.safeParse({ leaveType: "sick", startDate: "2026-08-20", endDate: "2026-08-20" }).success).toBe(true);
  });

  it("rejects an unreasonably long date range", () => {
    const result = requestLeaveSchema.safeParse({ leaveType: "annual", startDate: "2026-01-01", endDate: "2028-01-01" });
    expect(result.success).toBe(false);
  });

  it("rejects a leave type outside the controlled list", () => {
    expect(requestLeaveSchema.safeParse({ leaveType: "sabbatical", startDate: "2026-08-20", endDate: "2026-08-22" }).success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(requestLeaveSchema.safeParse({ leaveType: "annual", startDate: "20-08-2026", endDate: "2026-08-22" }).success).toBe(false);
  });
});

describe("denyLeaveRequestSchema", () => {
  it("requires a non-blank comment", () => {
    expect(denyLeaveRequestSchema.safeParse({ comment: "Coverage gap during that period" }).success).toBe(true);
    expect(denyLeaveRequestSchema.safeParse({ comment: "" }).success).toBe(false);
  });
});

describe("returnLeaveRequestSchema", () => {
  it("requires a non-blank comment", () => {
    expect(returnLeaveRequestSchema.safeParse({ comment: "Please adjust the end date" }).success).toBe(true);
    expect(returnLeaveRequestSchema.safeParse({ comment: "" }).success).toBe(false);
  });
});
