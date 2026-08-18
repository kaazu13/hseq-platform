// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangePasswordDialog } from "./change-password-dialog";

/**
 * Account redesign (Section 7/8/21) — password fields must not exist in
 * the DOM at all until the user explicitly clicks "Change password"; a
 * static-HTML smoke test of the closed state can't distinguish "rendered
 * but hidden via CSS" from "not rendered", which matters for both the
 * "never permanently render password fields" requirement and for password
 * managers not picking up a hidden field. Also covers the show/hide
 * toggle and a field-level validation error surfacing inside the dialog.
 */

const changeMyPassword = vi.fn();
const toastSuccess = vi.fn();

vi.mock("@/modules/account-security/actions", () => ({
  changeMyPassword: (...args: unknown[]) => changeMyPassword(...args),
}));
vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args) },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

beforeAll(() => {
  // Base UI's Dialog positioning touches ResizeObserver, which jsdom does not implement.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  changeMyPassword.mockReset();
  toastSuccess.mockClear();
});

describe("ChangePasswordDialog", () => {
  it("renders no password fields until the trigger is clicked", () => {
    render(<ChangePasswordDialog />);
    expect(screen.queryByLabelText("currentPassword")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("newPassword")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("confirmNewPassword")).not.toBeInTheDocument();
  });

  it("clicking Change password opens the dialog with all three password fields, masked by default", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordDialog />);

    await user.click(screen.getByRole("button", { name: /changePassword/ }));

    const current = await screen.findByLabelText("currentPassword");
    expect(current).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("newPassword")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("confirmNewPassword")).toHaveAttribute("type", "password");
  });

  it("the show/hide toggle reveals and re-hides one field's value independently of the others", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordDialog />);
    await user.click(screen.getByRole("button", { name: /changePassword/ }));

    const newPasswordInput = await screen.findByLabelText("newPassword");
    const toggles = screen.getAllByRole("button", { name: "showPassword" });
    await user.click(toggles[1]); // new password's own toggle

    expect(newPasswordInput).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("currentPassword")).toHaveAttribute("type", "password");
  });

  it("a validation error from the server shows inline and keeps the dialog open", async () => {
    changeMyPassword.mockResolvedValue({ ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: { currentPassword: "Current password is incorrect." } } });
    const user = userEvent.setup();
    render(<ChangePasswordDialog />);
    await user.click(screen.getByRole("button", { name: /changePassword/ }));

    await user.type(await screen.findByLabelText("currentPassword"), "wrong-password");
    await user.type(screen.getByLabelText("newPassword"), "NewPassword123!");
    await user.type(screen.getByLabelText("confirmNewPassword"), "NewPassword123!");
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "changePassword" }));

    expect(await screen.findByText("Current password is incorrect.")).toBeInTheDocument();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByLabelText("currentPassword")).toBeInTheDocument();
  });

  it("a successful change shows the success toast and closes the dialog", async () => {
    changeMyPassword.mockResolvedValue({ ok: true, data: null });
    const user = userEvent.setup();
    render(<ChangePasswordDialog />);
    await user.click(screen.getByRole("button", { name: /changePassword/ }));

    await user.type(await screen.findByLabelText("currentPassword"), "CurrentPassword123!");
    await user.type(screen.getByLabelText("newPassword"), "NewPassword123!");
    await user.type(screen.getByLabelText("confirmNewPassword"), "NewPassword123!");
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "changePassword" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("passwordUpdated"));
    await waitFor(() => expect(screen.queryByLabelText("currentPassword")).not.toBeInTheDocument());
  });
});
