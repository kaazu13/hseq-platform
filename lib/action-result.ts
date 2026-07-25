/**
 * Shared Server Function return shape — see docs/API_CONVENTIONS.md §4
 * (Result and Error Shape). Every Server Function that can fail in an
 * "expected" way (validation, not-found, business-rule conflict) returns
 * this instead of throwing, so the calling form/component can render the
 * error inline. Genuinely unexpected failures are still thrown and land in
 * the nearest error.tsx boundary.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ActionErrorCode; message: string; fieldErrors?: Record<string, string> } };

export type ActionErrorCode =
  | "validation_error"
  | "not_found"
  | "conflict"
  | "unauthorized"
  | "forbidden"
  | "server_error";
