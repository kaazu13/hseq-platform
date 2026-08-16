"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";

type CreateSuccessToastProps = {
  /** Query param whose presence signals a just-completed create/submit — e.g. `?created=<id>`. */
  paramName: string;
  /**
   * Toast message template. `{value}` is replaced with the `paramName`
   * param's value; `{param:x}` is replaced with the value of companion
   * query param `x` (empty string if absent) — e.g. `?created=<id>&tag=<tag>`
   * plus `message="Scaffold {param:tag} registered successfully."`.
   */
  message: string;
  /**
   * If set, the toast gets a "View [record]" action button linking to this
   * path template (same `{value}`/`{param:x}` interpolation). Omit when
   * there's nothing more specific to view than the list itself.
   */
  viewHrefTemplate?: string;
  viewLabel?: string;
};

function interpolate(template: string, value: string, params: URLSearchParams): string {
  return template.replace(/\{value\}/g, value).replace(/\{param:(\w+)\}/g, (_match, key: string) => params.get(key) ?? "");
}

/**
 * Part 5 (Global Create/Submit UX) shared pattern: a Server Action's
 * `redirect()` fires before the client ever gets a return value back, so a
 * success toast cannot be shown from the form that submitted — instead the
 * redirect target carries a short-lived query param, and this component
 * (mounted on that destination page) shows the toast once and then strips
 * the param from the URL via `router.replace` so a browser refresh/back
 * navigation never re-shows it or leaves it in the address bar.
 *
 * `message`/`viewHrefTemplate` are plain strings (not functions) because
 * this component is always rendered from a Server Component call site —
 * functions aren't serializable across the Server→Client boundary. Build
 * any per-record wording as a template string with `{value}`/`{param:x}`
 * placeholders instead of a closure.
 *
 * Renders nothing — drop it anywhere on the destination page (typically
 * once, near the top).
 */
export function CreateSuccessToast({ paramName, message, viewHrefTemplate, viewLabel = "View" }: CreateSuccessToastProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const firedRef = useRef(false);

  const value = searchParams.get(paramName);
  const paramsString = searchParams.toString();

  useEffect(() => {
    if (!value || firedRef.current) return;
    firedRef.current = true;

    const params = new URLSearchParams(paramsString);
    const resolvedMessage = interpolate(message, value, params);
    const viewHref = viewHrefTemplate ? interpolate(viewHrefTemplate, value, params) : undefined;

    toast.success(resolvedMessage, viewHref ? { action: { label: viewLabel, onClick: () => router.push(viewHref) } } : undefined);

    params.delete(paramName);
    const remaining = params.toString();
    router.replace(remaining ? `${pathname}?${remaining}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- message/viewHrefTemplate are expected to be stable per call site; re-running on every render would re-fire the toast
  }, [value, paramsString]);

  return null;
}
