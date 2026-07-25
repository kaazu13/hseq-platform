# API Conventions

This document covers how the app talks to itself (and later, potentially, to the outside world) via Server Functions and Route Handlers. See [ARCHITECTURE.md §11](./ARCHITECTURE.md#11-api-surface) for why Server Functions are the default mutation path.

## 1. When to Use What

| Mechanism | Use for | Location |
|---|---|---|
| **Server Function** (`'use server'`, invoked as a "Server Action" in React docs) | Any mutation triggered from a form or UI action within the app: create/update/delete/approve/sign, etc. | `modules/<domain>/actions.ts` |
| **Server Component data fetching** | Any read used to render a page/section server-side. Not every read needs an API layer — a Server Component can call a `modules/<domain>/queries.ts` function directly. | `modules/<domain>/queries.ts`, called from `app/**/page.tsx` |
| **Route Handler** (`app/api/**/route.ts`) | Webhooks (Supabase Auth events), file/export downloads (including the CSV and Excel-friendly/XLSX payroll timesheet exports — v1 is export-only, no payroll-provider integration, see [PRODUCT_REQUIREMENTS.md §3](./PRODUCT_REQUIREMENTS.md#3-non-goals-initial-release)), anything that must be a real HTTP endpoint (e.g., future external API consumers), or a client-side fetch that genuinely needs a URL (rare — prefer Server Functions from Client Components too, via `useActionState`/`useTransition`). | `app/api/<resource>/route.ts` |

Do not build a Route Handler that just wraps a Server Function for no reason — pick one path per use case.

## 2. Naming Conventions

- Server Functions: verb-first, domain-scoped, e.g. `createProject`, `updateEmployeeDocument`, `approveTimesheet`, `closeIncidentReport`, `signToolboxTalkAttendance`. Not generic (`update`, `save`, `handleSubmit`).
- Query functions: noun-first, e.g. `getProjectById`, `listOpenCorrectiveActionsForAssignee`, `getScheduleForDate`.
- Route Handlers: standard REST-ish nouns and HTTP verbs, e.g. `GET /api/reports/timesheets/export`, `POST /api/webhooks/supabase-auth`.

## 3. Server Function Shape

Every Server Function follows the same shape:

```ts
'use server'

export async function approveTimesheet(input: ApproveTimesheetInput): Promise<ActionResult<Timesheet>> {
  const { user, organizationId, roles } = await requireUser()
  requireRole(roles, ['company_admin', 'operations_manager', 'supervisor']) // true if roles has ANY of these — a role union check, not equality

  const parsed = approveTimesheetSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'validation_error', message: parsed.error.message } }
  }

  // domain-specific authorization beyond role (e.g., "supervisor must be assigned to this project")
  const timesheet = await getTimesheetById(parsed.data.timesheetId, organizationId)
  if (!timesheet) {
    return { ok: false, error: { code: 'not_found', message: 'Timesheet not found' } }
  }
  if (!canApproveTimesheet(user, timesheet)) {
    forbidden() // next/navigation — renders app/forbidden.tsx, 403
  }

  const updated = await updateTimesheetStatus(timesheet.id, 'approved', user.id)
  await writeAuditLog({ organizationId, actorUserId: user.id, action: 'approve', entityType: 'timesheet', entityId: timesheet.id })
  revalidatePath(`/timesheets/${timesheet.id}`)

  return { ok: true, data: updated }
}
```

Fixed steps, in order, for every mutating Server Function:
1. **Authenticate** — `requireUser()` (throws/redirects via `unauthorized()` if no session), resolving the user's validated active organization and their **full role array** for it (see [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-organization-membership-model)).
2. **Coarse authorize** — `requireRole(roles, [...])` for roles that can never perform this action at all; this is a union/overlap check ("does `roles` contain any of these"), not equality against a single role, since a user may hold several roles at once (see [ARCHITECTURE.md §6](./ARCHITECTURE.md#6-authorization-model)).
3. **Validate input** — shared `zod` schema (see [§5](#5-validation)); return a structured error, don't throw, for validation failures.
4. **Fetch + fine-grained authorize** — load the target record scoped to `organizationId` (relying on RLS as the backstop, but querying scoped explicitly too) and check record-level permission (e.g., "assigned to this project") via the module's `permissions.ts`, calling `forbidden()` on failure.
5. **Validate cross-references** — if the input sets a reference to another row (a `profiles.id`, or a polymorphic `entity_type`/`entity_id` or `source_type`/`source_id` pair), run it through the [cross-reference validation rule](./ARCHITECTURE.md#34-cross-reference-validation-rule): confirm the target exists, belongs to this organization (or is a legitimate global/system reference), and that the caller may reference it. See [§6](#6-server-side-authorization).
6. **Mutate**.
7. **Audit log** — for anything in the audit-required list per [ARCHITECTURE.md §8](./ARCHITECTURE.md#8-audit-logging). Corrections to a finalized/closed record are written as a new record referencing the original (`action: 'amend'`) rather than an in-place edit — see [ARCHITECTURE.md §8](./ARCHITECTURE.md#8-audit-logging).
8. **Revalidate** (`revalidatePath`/`revalidateTag`) so the UI reflects the change.
9. **Return a typed result** (see [§4](#4-result-and-error-shape)).

## 4. Result and Error Shape

Server Functions return a discriminated union rather than throwing for expected failure cases (validation errors, not-found, business-rule violations) — reserve thrown exceptions for genuinely unexpected failures (which Next.js turns into the nearest `error.tsx` boundary).

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ActionErrorCode; message: string; fieldErrors?: Record<string, string> } }

type ActionErrorCode =
  | 'validation_error'
  | 'not_found'
  | 'conflict'        // e.g., unique constraint (duplicate employee_number), stale approval state
  | 'unauthorized'    // should be rare — requireUser() normally redirects before this
  | 'forbidden'       // should be rare — forbidden() normally redirects before this
  | 'server_error'
```

`unauthorized()`/`forbidden()` (from `next/navigation`) are the default for whole-page or whole-action access denial (they redirect to the corresponding special file per [ARCHITECTURE.md §5](./ARCHITECTURE.md#5-authentication--session-handling)). The `'unauthorized'`/`'forbidden'` result codes exist for the narrower case of an inline UI action (e.g., a button that should already have been hidden but the check fails server-side anyway) where redirecting the whole page away is the wrong UX and returning an error to a `useActionState` form is preferred instead.

Route Handlers (used for webhooks/exports/future API consumers) return standard HTTP status codes with a matching JSON error body:

```json
{ "error": { "code": "validation_error", "message": "..." } }
```

using the same `ActionErrorCode` vocabulary, so error handling logic on the client doesn't need two different shapes depending on which mechanism served the request.

## 5. Validation

- One `zod` schema per Server Function input, colocated in `modules/<domain>/validation.ts` (or inline in `actions.ts` for very small modules).
- The same schema is used for the client-side form (via `zodResolver` or manual `safeParse` on submit) and the server-side check inside the Server Function — the server-side check is **never skipped** on the assumption the client already validated, since a Server Function can be invoked directly.
- Cross-field/business-rule validation that isn't expressible in the schema alone (e.g., "clock-out must be after clock-in", "due date must be in the future for a newly created corrective action") is explicit code inside the Server Function, after schema validation, with its own `ActionErrorCode` (`'validation_error'` with a `fieldErrors` entry, or `'conflict'` if it's about existing state rather than the input shape).

## 6. Server-Side Authorization

Restating the non-negotiable rule from [ARCHITECTURE.md §2](./ARCHITECTURE.md#2-guiding-principles): **every Server Function and Route Handler re-derives the user's identity, organization, and role from the authenticated session — never from a client-supplied value.** Concretely:

- Never accept `organizationId` as an input parameter to a Server Function for the purpose of scoping a query — derive it from `requireUser()`'s resolved active organization. If a Route Handler must accept an org identifier (e.g., a webhook keyed by an external id), it is resolved to an internal `organization_id` server-side and cross-checked, never trusted directly.
- Never accept a `role`/`roles` or "isAdmin" flag from client input to gate behavior — roles are always resolved server-side from `membership_roles` for the caller's active organization (see [ARCHITECTURE.md §6](./ARCHITECTURE.md#6-authorization-model)), never passed in.
- RLS is the backstop, not the only check — a Server Function's own authorization check should fail *before* a query would even need RLS to reject it, so users get a proper `forbidden()`/error response instead of a confusing empty-result silent failure.
- **Every reference to another row is validated, not just the row being written.** A foreign key to `profiles(id)` (e.g., `assigned_to`, `approved_by`, `project_manager_id`) only proves that *some* person with that id exists — not that they belong to the organization the record is being written into, since `profiles` is a global identity table (see [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-organization-membership-model)). Polymorphic references (`corrective_actions.source_id`, `attachments.entity_id`, `digital_signatures.entity_id`) have no database-level FK at all. Before writing any of these, a Server Function must confirm: (1) the referenced row exists, (2) its effective organization matches this record's organization — or the reference is a legitimate exception, like a system-level `event_categories` row — and (3) the caller is actually permitted to reference it, not merely permitted to write this table in general. This is the [Cross-Reference Validation Rule](./ARCHITECTURE.md#34-cross-reference-validation-rule); implement it once as a shared helper (see [IMPLEMENTATION_PLAN.md — M7](./IMPLEMENTATION_PLAN.md#m7--cross-reference-validation-helper)) and call it from every module that needs it, rather than re-deriving the check per Server Function.

## 7. Reads (Server Components & Query Functions)

- Page-level data fetching happens in Server Components calling `modules/<domain>/queries.ts` functions directly — no client-side `fetch` to an internal API for data that's known at render time.
- Query functions accept an already-authenticated context (or call `requireUser()` themselves if used standalone) and always filter by the caller's `organization_id`, even though RLS would also enforce it — explicit scoping keeps queries fast (index usage) and keeps intent readable in the code, rather than relying on RLS silently doing the filtering.
- Client-side data fetching (`useEffect`/SWR/etc.) is reserved for genuinely dynamic client-only needs (e.g., live notification count) — prefer Server Components + `revalidatePath`/Supabase Realtime over building a parallel client-fetched API for data that could just be rendered server-side.

## 8. Pagination & Filtering

- List queries accept `{ page, pageSize, filters }` with sane defaults (`pageSize` default 25, max 100) and return `{ items, totalCount, page, pageSize }`.
- Filters are typed per-module (e.g., `TimesheetFilters { projectId?, employeeId?, status?, dateFrom?, dateTo? }`), not a generic untyped filter bag, so invalid filter combinations are caught at compile time.

## 9. File Uploads

- Uploads (documents, incident photos, signature images) go directly from the client to Supabase Storage using a short-lived signed upload URL obtained via a Server Function (`getSignedUploadUrl(entityType, entityId)`), rather than proxying file bytes through a Route Handler — avoids unnecessary Vercel function payload/duration limits for larger files.
- After upload, a Server Function (`recordAttachment`/`recordEmployeeDocument`) creates the corresponding database row referencing the storage path — the database row is only created after the upload is confirmed, so orphaned Storage objects (upload succeeded, row never created) are preferred over orphaned database rows pointing at missing files.

## 10. Revalidation & Caching

- After a mutation, call `revalidatePath` for the specific path(s) whose data changed (or `revalidateTag` if a tag-based cache strategy is adopted later) — don't over-invalidate the whole app's cache for a narrow change.
- Given the multi-tenant nature of the app, any use of Next.js `fetch` caching or `unstable_cache`/`use cache` **must** include `organization_id` (and typically the acting user's role, where the result is role-dependent) as part of the cache key — never cache a per-tenant or per-role result under a key that could be shared across tenants/roles.

## 11. Consistency With Other Docs

- Error/result shape and validation approach here must stay consistent with the mobile-first feedback-state requirements in [UI_GUIDELINES.md §6](./UI_GUIDELINES.md#6-feedback-states) — an `ActionResult` error is what a form's error UI renders.
- The authorization steps in [§3](#3-server-function-shape) implement the matrix in [ROLES_AND_PERMISSIONS.md](./ROLES_AND_PERMISSIONS.md); when the matrix changes, the corresponding `permissions.ts` checks referenced from Server Functions change in the same PR.
