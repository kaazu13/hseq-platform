// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CreateSuccessToast } from "./create-success-toast";

/**
 * Regression test for the Next.js 16 Server→Client RSC boundary crash:
 * "Functions cannot be passed directly to Client Components unless you
 * explicitly expose it by marking it with 'use server'." `CreateSuccessToast`
 * is always rendered from Server Component pages (LMRA, Scaffold Register,
 * Observations), so its props must stay plain, serializable strings —
 * never function props like the old `buildMessage`/`buildViewHref` design.
 * `CreateSuccessToastProps` being string-only is enforced by TypeScript at
 * every call site; this test instead locks in the runtime behavior of the
 * `{value}`/`{param:x}` template-interpolation replacement, so a future
 * "let's just pass a function, it's easier" regression would also break a
 * concrete assertion, not just a type check.
 */

const toastSuccess = vi.fn();
const routerReplace = vi.fn();
const routerPush = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: routerPush }),
  usePathname: () => "/lmra",
  useSearchParams: () => searchParams,
}));

vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args) },
}));

afterEach(() => {
  cleanup();
  toastSuccess.mockClear();
  routerReplace.mockClear();
  routerPush.mockClear();
  searchParams = new URLSearchParams();
});

describe("CreateSuccessToast", () => {
  it("does nothing when the trigger param is absent", () => {
    render(<CreateSuccessToast paramName="created" message="LMRA saved successfully." />);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("interpolates {value} into the message and view href, using only serializable string props", () => {
    searchParams = new URLSearchParams("created=lmra-123");
    render(<CreateSuccessToast paramName="created" message="LMRA saved successfully." viewHrefTemplate="/lmra/{value}" viewLabel="View LMRA" />);

    expect(toastSuccess).toHaveBeenCalledWith(
      "LMRA saved successfully.",
      expect.objectContaining({ action: expect.objectContaining({ label: "View LMRA" }) }),
    );
    const [, options] = toastSuccess.mock.calls[0] as [string, { action: { onClick: () => void } }];
    options.action.onClick();
    expect(routerPush).toHaveBeenCalledWith("/lmra/lmra-123");
  });

  it("interpolates a companion query param via {param:x}", () => {
    searchParams = new URLSearchParams("created=scaffold-1&tag=SC-42");
    render(<CreateSuccessToast paramName="created" message="Scaffold {param:tag} registered successfully." />);

    expect(toastSuccess).toHaveBeenCalledWith("Scaffold SC-42 registered successfully.", undefined);
  });

  it("strips the trigger param from the URL after firing", () => {
    searchParams = new URLSearchParams("created=lmra-123&tag=SC-42");
    render(<CreateSuccessToast paramName="created" message="Saved." />);

    expect(routerReplace).toHaveBeenCalledWith("/lmra?tag=SC-42", { scroll: false });
  });
});
