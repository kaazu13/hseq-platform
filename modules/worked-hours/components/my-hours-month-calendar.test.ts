import { describe, it, expect } from "vitest";
import { resolveDayState, type MonthDayCell } from "./my-hours-month-calendar";

function baseCell(overrides: Partial<MonthDayCell> = {}): MonthDayCell {
  return {
    date: "2026-08-17",
    isCurrentMonth: true,
    isSunday: false,
    hoursTotal: 0,
    breakdown: null,
    attendanceStatus: "not_set",
    hasPendingRequest: false,
    hasApprovedLeave: false,
    hasConfirmedAbsence: false,
    discrepancyStatus: null,
    correctionCount: 0,
    dayEarnings: null,
    ...overrides,
  };
}

/**
 * Part 20/38's deterministic day-state precedence — the exact rule the
 * task specified: worked hours generally win visually, EXCEPT flagged as
 * a conflict (never silently hidden) when approved-leave/confirmed-
 * absence data exists for the same day; a blank day is never treated as
 * absent; a pending request never displays as approved.
 */
describe("resolveDayState — My Hours calendar day-state precedence", () => {
  it("worked hours with no contradicting data -> worked, no conflict", () => {
    expect(resolveDayState(baseCell({ hoursTotal: 8 }))).toEqual({ state: "worked", conflict: false });
  });

  it("approved leave with zero hours -> approvedLeave, no conflict", () => {
    expect(resolveDayState(baseCell({ hasApprovedLeave: true }))).toEqual({ state: "approvedLeave", conflict: false });
  });

  it("confirmed absence with zero hours -> confirmedAbsent, no conflict", () => {
    expect(resolveDayState(baseCell({ hasConfirmedAbsence: true }))).toEqual({ state: "confirmedAbsent", conflict: false });
  });

  it("worked hours ALSO on an approved-leave day -> worked wins visually but flagged as a conflict, never silently dropped", () => {
    expect(resolveDayState(baseCell({ hoursTotal: 4, hasApprovedLeave: true }))).toEqual({ state: "worked", conflict: true });
  });

  it("worked hours ALSO on a confirmed-absence day -> same conflict treatment", () => {
    expect(resolveDayState(baseCell({ hoursTotal: 4, hasConfirmedAbsence: true }))).toEqual({ state: "worked", conflict: true });
  });

  it("pending request with zero hours -> pending, never shown as approved", () => {
    expect(resolveDayState(baseCell({ hasPendingRequest: true }))).toEqual({ state: "pending", conflict: false });
  });

  it("approved leave takes precedence over a pending request on the same day", () => {
    expect(resolveDayState(baseCell({ hasApprovedLeave: true, hasPendingRequest: true }))).toEqual({ state: "approvedLeave", conflict: false });
  });

  it("a blank Sunday with no data -> sunday, never confirmedAbsent just because it's blank", () => {
    expect(resolveDayState(baseCell({ isSunday: true }))).toEqual({ state: "sunday", conflict: false });
  });

  it("a blank ordinary weekday with no data -> normal, never inferred as absent", () => {
    expect(resolveDayState(baseCell())).toEqual({ state: "normal", conflict: false });
  });

  it("worked hours on a Sunday -> worked still wins over the Sunday styling", () => {
    expect(resolveDayState(baseCell({ isSunday: true, hoursTotal: 4 }))).toEqual({ state: "worked", conflict: false });
  });
});
