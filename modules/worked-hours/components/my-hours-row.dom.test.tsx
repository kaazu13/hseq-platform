// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MyHoursRow } from "./my-hours-row";
import type { WorkedHoursWithEmployee, WorkedHoursCorrection } from "@/modules/worked-hours/types";

/**
 * Items 7/8: a real interaction/render test for the compact My Hours row —
 * proves zero-value categories never render, and that a genuinely-set
 * category still shows once expanded. A static-text search on server-
 * rendered HTML cannot distinguish "the component filtered zero
 * categories" from "the fixture never had any" the way asserting against a
 * rendered DOM with a deliberately mixed fixture can.
 */

vi.mock("@/modules/worked-hours/components/report-discrepancy-button", () => ({
  ReportDiscrepancyButton: () => null,
}));

afterEach(() => cleanup());

function makeWorkedHours(overrides: Partial<WorkedHoursWithEmployee> = {}): WorkedHoursWithEmployee {
  return {
    id: "wh-1",
    company_id: "c1",
    project_id: "p1",
    employee_id: "e1",
    work_date: "2026-08-12",
    hours: 10,
    status: "submitted",
    note: null,
    created_at: "2026-08-12T08:00:00Z",
    created_by: null,
    updated_at: "2026-08-12T08:00:00Z",
    updated_by: null,
    breakdown: { regular: 10, overtime: 0, night: 0, travel: 0, other: 0 },
    ...overrides,
  } as unknown as WorkedHoursWithEmployee;
}

describe("MyHoursRow — items 7/8", () => {
  it("shows only the non-zero category on the collapsed summary line, never the zero ones", () => {
    render(<MyHoursRow companyId="c1" workedHours={makeWorkedHours()} corrections={[]} discrepancy={null} />);

    expect(screen.getByText("Regular 10.0h")).toBeInTheDocument();
    expect(screen.queryByText(/Overtime/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Night/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Travel/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Other/)).not.toBeInTheDocument();
    expect(screen.getByText("Total 10h")).toBeInTheDocument();
  });

  it("shows every non-zero category when more than one is set — 'Regular 8.0h · Overtime 2.0h'", () => {
    render(<MyHoursRow companyId="c1" workedHours={makeWorkedHours({ breakdown: { regular: 8, overtime: 2, night: 0, travel: 0, other: 0 } })} corrections={[]} discrepancy={null} />);

    expect(screen.getByText("Regular 8.0h · Overtime 2.0h")).toBeInTheDocument();
  });

  it("expanding the row reveals the full category grid (still zero-filtered) plus correction history", async () => {
    const user = userEvent.setup();
    const corrections: WorkedHoursCorrection[] = [
      {
        id: "corr-1",
        company_id: "c1",
        worked_hours_id: "wh-1",
        project_id: "p1",
        employee_id: "e1",
        category: "regular",
        previous_hours: "10.0" as unknown as number,
        new_hours: "6.0" as unknown as number,
        reason: "Payroll correction",
        changed_by: "admin-1",
        changed_at: "2026-08-13T09:00:00Z",
      } as unknown as WorkedHoursCorrection,
    ];

    render(<MyHoursRow companyId="c1" workedHours={makeWorkedHours({ breakdown: { regular: 6, overtime: 0, night: 0, travel: 0, other: 0 } })} corrections={corrections} discrepancy={null} />);

    expect(screen.queryByText(/Payroll correction/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Regular 6.0h/ }));
    expect(await screen.findByText(/Payroll correction/)).toBeInTheDocument();
    expect(screen.getByText("Regular Hours")).toBeInTheDocument();
  });

  it("a day with only Night hours shows only Night on the summary line", () => {
    render(<MyHoursRow companyId="c1" workedHours={makeWorkedHours({ breakdown: { regular: 0, overtime: 0, night: 10, travel: 0, other: 0 } })} corrections={[]} discrepancy={null} />);
    expect(screen.getByText("Night 10.0h")).toBeInTheDocument();
    expect(screen.queryByText(/Regular/)).not.toBeInTheDocument();
  });
});
