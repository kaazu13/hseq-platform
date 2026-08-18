// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PersonalInformationCard } from "./personal-information-card";

/**
 * Account redesign (Section 21) — real interaction tests for the combined
 * Personal Information section: default view mode, entering edit mode,
 * Cancel restoring the original values without saving, and a single Save
 * writing both phone (updateOwnProfile) and birth date (updateMyBirthDate)
 * exactly once each — the "one Save operation for the whole section"
 * requirement a static-HTML smoke test can't verify. Also locks in that
 * full_name is never rendered as an editable field, and that the birth
 * date row is entirely absent when the caller has no linked employee
 * record (Task 3 Part 7's own-view/edit-only rule).
 */

const updateOwnProfile = vi.fn();
const updateMyBirthDate = vi.fn();
const toastSuccess = vi.fn();

vi.mock("@/modules/companies/actions", () => ({
  updateOwnProfile: (...args: unknown[]) => updateOwnProfile(...args),
}));
vi.mock("@/modules/employees/actions", () => ({
  updateMyBirthDate: (...args: unknown[]) => updateMyBirthDate(...args),
}));
vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args) },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: unknown) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  useLocale: () => "en",
  useFormatter: () => ({ dateTime: (date: Date) => new Date(date).toISOString().slice(0, 10) }),
}));

beforeAll(() => {
  // Base UI's Combobox (used by PhoneInput's country picker) touches ResizeObserver, which jsdom does not implement.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  updateOwnProfile.mockReset();
  updateMyBirthDate.mockReset();
  toastSuccess.mockClear();
});

describe("PersonalInformationCard", () => {
  it("renders phone/birth date as read-only text by default, with full_name never as an input", () => {
    render(<PersonalInformationCard companyId="c1" fullName="Jane Doe" phone="+15550100000" birthDate="1990-05-20" hasEmployeeRecord />);

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /fullName/i })).not.toBeInTheDocument();
    expect(screen.getByText("+15550100000")).toBeInTheDocument();
    expect(screen.getByText("1990-05-20")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "saveChanges" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "edit" })).toBeInTheDocument();
  });

  it("Edit reveals the phone and birth-date inputs; Cancel discards changes and exits edit mode without saving", async () => {
    const user = userEvent.setup();
    render(<PersonalInformationCard companyId="c1" fullName="Jane Doe" phone="+15550100000" birthDate="1990-05-20" hasEmployeeRecord />);

    await user.click(screen.getByRole("button", { name: "edit" }));
    expect(screen.getByLabelText("birthDate")).toBeInTheDocument();
    expect(screen.getByLabelText("phoneNumber")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("birthDate"));
    await user.type(screen.getByLabelText("birthDate"), "2000-01-01");

    await user.click(screen.getByRole("button", { name: "cancel" }));

    expect(updateOwnProfile).not.toHaveBeenCalled();
    expect(updateMyBirthDate).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("birthDate")).not.toBeInTheDocument();
    expect(screen.getByText("1990-05-20")).toBeInTheDocument();
  });

  it("Save calls both updateOwnProfile and updateMyBirthDate exactly once, then shows the success toast and exits edit mode", async () => {
    updateOwnProfile.mockResolvedValue({ ok: true, data: null });
    updateMyBirthDate.mockResolvedValue({ ok: true, data: null });
    const user = userEvent.setup();
    render(<PersonalInformationCard companyId="c1" fullName="Jane Doe" phone="+15550100000" birthDate="1990-05-20" hasEmployeeRecord />);

    await user.click(screen.getByRole("button", { name: "edit" }));
    await user.click(screen.getByRole("button", { name: "saveChanges" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(updateOwnProfile).toHaveBeenCalledTimes(1);
    expect(updateMyBirthDate).toHaveBeenCalledTimes(1);
    expect(updateMyBirthDate).toHaveBeenCalledWith("c1", { birthDate: "1990-05-20" });
    expect(screen.queryByLabelText("birthDate")).not.toBeInTheDocument();
  });

  it("skips updateMyBirthDate entirely and hides the birth-date row when the caller has no linked employee record", async () => {
    updateOwnProfile.mockResolvedValue({ ok: true, data: null });
    const user = userEvent.setup();
    render(<PersonalInformationCard companyId="c1" fullName="Jane Doe" phone="+15550100000" birthDate={null} hasEmployeeRecord={false} />);

    expect(screen.queryByText("birthDate")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "edit" }));
    expect(screen.queryByLabelText("birthDate")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "saveChanges" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(updateMyBirthDate).not.toHaveBeenCalled();
  });

  it("surfaces a field error and stays in edit mode when the save fails", async () => {
    updateOwnProfile.mockResolvedValue({ ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: { phone: "Invalid phone number." } } });
    updateMyBirthDate.mockResolvedValue({ ok: true, data: null });
    const user = userEvent.setup();
    render(<PersonalInformationCard companyId="c1" fullName="Jane Doe" phone="+15550100000" birthDate="1990-05-20" hasEmployeeRecord />);

    await user.click(screen.getByRole("button", { name: "edit" }));
    await user.click(screen.getByRole("button", { name: "saveChanges" }));

    expect(await screen.findByText("Invalid phone number.")).toBeInTheDocument();
    expect(screen.getByLabelText("phoneNumber")).toBeInTheDocument();
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
