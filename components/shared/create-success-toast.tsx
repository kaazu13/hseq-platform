"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";

type CreateSuccessToastProps = {
  /** Query param whose presence signals a just-completed create/submit — e.g. `?created=<id>`. */
  paramName: string;
  /** Toast message, built from the param's value and the full query string (for reading companion params like `?created=<id>&tag=<tag>`). */
  buildMessage: (value: string, params: URLSearchParams) => string;
  /** If set, the toast gets a "View [record]" action button linking here. Omit when there's nothing more specific to view than the list itself. */
  buildViewHref?: (value: string, params: URLSearchParams) => string;
  viewLabel?: string;
};

/**
 * Part 5 (Global Create/Submit UX) shared pattern: a Server Action's
 * `redirect()` fires before the client ever gets a return value back, so a
 * success toast cannot be shown from the form that submitted — instead the
 * redirect target carries a short-lived query param, and this component
 * (mounted on that destination page) shows the toast once and then strips
 * the param from the URL via `router.replace` so a browser refresh/back
 * navigation never re-shows it or leaves it in the address bar.
 *
 * Renders nothing — drop it anywhere on the destination page (typically
 * once, near the top).
 */
export function CreateSuccessToast({ paramName, buildMessage, buildViewHref, viewLabel = "View" }: CreateSuccessToastProps) {
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
    const message = buildMessage(value, params);
    const viewHref = buildViewHref?.(value, params);

    toast.success(message, viewHref ? { action: { label: viewLabel, onClick: () => router.push(viewHref) } } : undefined);

    params.delete(paramName);
    const remaining = params.toString();
    router.replace(remaining ? `${pathname}?${remaining}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildMessage/buildViewHref are expected to be stable per call site; re-running on every render would re-fire the toast
  }, [value, paramsString]);

  return null;
}
