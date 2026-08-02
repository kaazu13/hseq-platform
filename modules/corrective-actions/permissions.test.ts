import { describe, it, expect } from "vitest";
import {
  canCreateCorrectiveAction,
  canManageCorrectiveActionDetails,
  canUpdateCorrectiveActionProgress,
  canCloseCorrectiveAction,
} from "./permissions";

describe("canCreateCorrectiveAction", () => {
  it("allows an HSE Manager regardless of project role/access", () => {
    expect(canCreateCorrectiveAction(["hseq_manager"], false, false)).toBe(true);
  });

  it("allows the project's own Project Manager, given project access — a clean M⁴ with no footnote-10 carve-out", () => {
    expect(canCreateCorrectiveAction(["employee"], true, true)).toBe(true);
  });

  it("allows HSE Officer/Foreman/Inspector with project access", () => {
    expect(canCreateCorrectiveAction(["hse_officer"], false, true)).toBe(true);
    expect(canCreateCorrectiveAction(["foreman"], false, true)).toBe(true);
    expect(canCreateCorrectiveAction(["inspector"], false, true)).toBe(true);
  });

  it("denies HSE Officer/Foreman/Inspector WITHOUT project access", () => {
    expect(canCreateCorrectiveAction(["hse_officer"], false, false)).toBe(false);
  });

  it("denies Employee outright — footnote 11 covers update/comment on an assigned action only, never create", () => {
    expect(canCreateCorrectiveAction(["employee"], false, true)).toBe(false);
  });

  it("denies company_admin/operations_manager — View-only per docs", () => {
    expect(canCreateCorrectiveAction(["company_admin"], false, true)).toBe(false);
    expect(canCreateCorrectiveAction(["operations_manager"], false, true)).toBe(false);
  });
});

describe("canManageCorrectiveActionDetails", () => {
  it("mirrors canCreateCorrectiveAction exactly — same role set governs due_date/priority/description/responsible_person edits", () => {
    expect(canManageCorrectiveActionDetails(["hseq_manager"], false, false)).toBe(true);
    expect(canManageCorrectiveActionDetails(["foreman"], false, true)).toBe(true);
    expect(canManageCorrectiveActionDetails(["employee"], false, true)).toBe(false);
  });
});

describe("canUpdateCorrectiveActionProgress", () => {
  it("allows a manage-tier role to progress any action", () => {
    expect(canUpdateCorrectiveActionProgress(["hseq_manager"], false, false, false)).toBe(true);
  });

  it("allows an Employee to progress an action ASSIGNED TO THEM, despite otherwise having no manage-tier standing", () => {
    expect(canUpdateCorrectiveActionProgress(["employee"], false, false, true)).toBe(true);
  });

  it("denies an Employee progressing an action NOT assigned to them", () => {
    expect(canUpdateCorrectiveActionProgress(["employee"], false, false, false)).toBe(false);
  });
});

describe("canCloseCorrectiveAction", () => {
  it("allows an HSE Manager to close/reject/reopen ANY action", () => {
    expect(canCloseCorrectiveAction(["hseq_manager"], false, false)).toBe(true);
  });

  it("allows the project's own Project Manager to close ANY action within their project, regardless of who authored/is assigned to it", () => {
    expect(canCloseCorrectiveAction(["employee"], true, false)).toBe(true);
  });

  it("allows HSE Officer/Foreman/Inspector to close an action they authored OR are assigned to (footnote 10's carve-out)", () => {
    expect(canCloseCorrectiveAction(["foreman"], false, true)).toBe(true);
  });

  it("denies HSE Officer/Foreman/Inspector closing an action assigned to SOMEONE ELSE that they didn't author — footnote 10's exact restriction: needs HSE Manager or PM sign-off", () => {
    expect(canCloseCorrectiveAction(["foreman"], false, false)).toBe(false);
  });

  it("denies an Employee outright, even for their own assigned action — footnote 11: 'cannot... close it'", () => {
    expect(canCloseCorrectiveAction(["employee"], false, true)).toBe(false);
  });
});
