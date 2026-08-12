// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

afterEach(() => cleanup());
import { DailyTeamsGrid } from "./daily-teams-grid";
import type { DailyTeamWithMembers, EmployeeDailyState } from "@/modules/daily-workforce/types";

/**
 * Milestone G, item 1/11: an interaction test for the exact regression
 * reported in the browser — "clicking the pencil icon does nothing."
 * Rendering-only smoke tests (HTTP fetch of server-rendered HTML) cannot
 * catch this class of bug at all, since the pencil's dialog is closed by
 * default and only reachable through a real click; a static-text search
 * proves nothing about whether the click handler actually fires. This
 * test renders the real client component tree and fires a real click,
 * asserting the Edit Team dialog actually opens — and separately asserts
 * the drag handle is a small, disjoint element (never an ancestor of the
 * pencil button), which is what caused the swallowed click: an earlier
 * version made the ENTIRE card draggable and absolutely positioned
 * Up/Down/grip controls directly on top of the card's own pencil button.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/modules/daily-workforce/actions", () => ({
  reorderDailyTeams: vi.fn().mockResolvedValue({ ok: true, data: null }),
  moveDailyTeamMember: vi.fn().mockResolvedValue({ ok: true, data: { dailyTeamMemberId: "m1" } }),
  removeDailyTeamMember: vi.fn().mockResolvedValue({ ok: true, data: null }),
  updateDailyTeam: vi.fn().mockResolvedValue({ ok: true, data: { dailyTeamId: "t1" } }),
}));

beforeAll(() => {
  // Base UI's positioning logic touches ResizeObserver, which jsdom does not implement.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = ResizeObserverStub;
});

function makeTeam(overrides: Partial<DailyTeamWithMembers> = {}): DailyTeamWithMembers {
  return {
    id: "team-1",
    company_id: "c1",
    project_id: "p1",
    work_date: "2026-08-20",
    name: "Team Alpha",
    shift: "day",
    work_area: null,
    activity: null,
    status: "open",
    display_order: 0,
    locked_at: null,
    locked_by: null,
    unlocked_at: null,
    unlocked_by: null,
    unlock_reason: null,
    created_at: "2026-08-20T07:00:00Z",
    updated_at: "2026-08-20T07:00:00Z",
    created_by: null,
    updated_by: null,
    foreman_employee_id: "karl-1",
    foreman: { id: "karl-1", first_name: "Karl", last_name: "Andersson", position_title: "", profile_id: "", archived_at: "" },
    workers: [],
    ...overrides,
  } as unknown as DailyTeamWithMembers;
}

const workforce: EmployeeDailyState[] = [];

describe("DailyTeamsGrid — pencil click interaction (item 1)", () => {
  it("opens the Edit Team dialog when the pencil button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <DailyTeamsGrid companyId="c1" projectId="p1" workDate="2026-08-20" canManage={true} teams={[makeTeam()]} workforce={workforce} lmraCountsByTeamId={{}} />,
    );

    expect(screen.queryByText("Edit team")).not.toBeInTheDocument();

    const editButton = screen.getByRole("button", { name: "Edit Team Alpha" });
    await user.click(editButton);

    expect(await screen.findByRole("heading", { name: "Edit team" })).toBeInTheDocument();
  });

  it("the drag handle is not an ancestor of the pencil button — dragging can never swallow the edit click", () => {
    render(
      <DailyTeamsGrid companyId="c1" projectId="p1" workDate="2026-08-20" canManage={true} teams={[makeTeam()]} workforce={workforce} lmraCountsByTeamId={{}} />,
    );

    const editButton = screen.getByRole("button", { name: "Edit Team Alpha" });
    const dragHandle = screen.getByTitle("Drag to reorder");

    expect(dragHandle.contains(editButton)).toBe(false);
    expect(editButton.contains(dragHandle)).toBe(false);
    // The pencil button itself must never be draggable, nor sit inside a draggable ancestor.
    expect(editButton.closest("[draggable=true]")).toBeNull();
  });

  it("the permanent desktop Up/Down arrow buttons are gone (item 8) — the same moves live in an overflow menu instead", () => {
    render(
      <DailyTeamsGrid companyId="c1" projectId="p1" workDate="2026-08-20" canManage={true} teams={[makeTeam()]} workforce={workforce} lmraCountsByTeamId={{}} />,
    );

    expect(screen.queryByRole("button", { name: "Move card earlier" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move card later" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More actions for Team Alpha" })).toBeInTheDocument();
  });
});
