/**
 * Postgres/PostgREST error-code classifiers shared by every domain's
 * Server Functions (each module's actions.ts). Pure classifiers, no domain
 * logic — each was previously copy-pasted verbatim into every actions.ts
 * file; extracted here so a fourth/fifth module doesn't paste it again.
 */

/** Zod's flatten().fieldErrors -> the flat `{field: message}` shape ActionResult's error.fieldErrors expects (first message per field only). */
export function flattenFieldErrors(error: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const [field, messages] of Object.entries(error.flatten().fieldErrors)) {
    if (messages?.[0]) fieldErrors[field] = messages[0];
  }
  return fieldErrors;
}

/** Postgres unique_violation (e.g. a race on a unique index/constraint). */
export function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}

/** Postgres insufficient_privilege — an RLS policy rejected the operation. */
export function isRlsViolation(error: { code?: string }): boolean {
  return error.code === "42501";
}

/** Postgres error code for an unhandled `RAISE EXCEPTION` in a plpgsql function/trigger with no explicit SQLSTATE — e.g. validate_project_assignment_role_holder()'s "doesn't hold that organization role" check. */
export function isRaisedException(error: { code?: string }): boolean {
  return error.code === "P0001";
}
