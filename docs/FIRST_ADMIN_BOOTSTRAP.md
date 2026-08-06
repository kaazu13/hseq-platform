# First Admin / Owner Bootstrap

This document explains the one legitimate way a brand new company gets
its first `company_admin`, why the normal role-management path can't do it,
and the safeguards that keep this from ever becoming a backdoor.

## The problem this solves

Every write path that grants an company role
(`membership_roles_insert_managers`, see
[`supabase/migrations/20260725091200_membership_roles_management.sql`](../supabase/migrations/20260725091200_membership_roles_management.sql))
requires the **caller** to already hold `company_admin` or
`operations_manager` in that company. That's correct for ongoing role
management — but it means a **brand new** company, with zero role
holders, has no self-service way for anyone to become its first
`company_admin`. Someone has to be the exception that breaks the
chicken-and-egg loop, exactly once, per company.

## The mechanism: `bootstrap_first_owner()`

[`supabase/migrations/20260804090000_first_owner_bootstrap.sql`](../supabase/migrations/20260804090000_first_owner_bootstrap.sql)
adds one Postgres function:

```sql
bootstrap_first_owner(target_company_id uuid, target_user_id uuid, notes text default null)
  returns company_memberships
```

What it does, in order:

1. Verifies both the company and the target user (`profiles` row) exist.
2. **Refuses to run at all if the company already has an active
   `company_admin` membership.** This is the core safety property — it is
   not a general-purpose "grant admin" tool, only a cold-start one. Once an
   company has its first admin, every subsequent role change goes
   through the normal, already-audited `membership_roles` path (a real
   `company_admin` assigning it to someone else, via
   `assignEmployeeRole()`/the Roles tab).
3. Creates (or reactivates) an `company_memberships` row for the
   target user, `status = 'active'`.
4. Assigns the `company_admin` role via `membership_roles`.
5. Writes a row to `bootstrap_audit_log` — company, user, the role
   assigned, a server-generated timestamp, and the `notes` text you pass in.

## Why this can't become a public-signup backdoor

- **Not exposed to `authenticated` or `anon` at all.** The function is
  `SECURITY DEFINER` but its `GRANT EXECUTE` is scoped to `service_role`
  only (`revoke all ... from public, anon, authenticated; grant execute ...
  to service_role;`). No logged-in application user — not even an existing
  `company_admin` — can call it through the app. It is only reachable with
  the service-role key, i.e. by whoever operates the platform, outside the
  normal request path.
- **No email address anywhere in this migration, or in any authorization
  check, ever.** The function takes a `target_user_id uuid`. Whoever invokes
  it resolves an email to a user id themselves (e.g. via
  `supabase.auth.admin.listUsers()`), **before** calling the function — that
  lookup lives in a one-off invocation script, never inside
  `bootstrap_first_owner()` or any RLS policy. Grep the migrations directory
  for an email string if you want to confirm this.
- **Self-limiting.** Once an company has an active `company_admin`,
  every future call for that same company raises an exception. There
  is no version of this function that can be used to add a second admin,
  demote someone, or touch a different company's existing admin — that
  is deliberate.
- **Always audited.** Every successful call leaves a permanent
  `bootstrap_audit_log` row, readable by that company's
  `company_admin`/`operations_manager` (same reader set as `audit_events`),
  never writable by anyone except the function itself.

## How to actually run it

There is no UI for this — by design, it's an operator action, not a
product feature. Example invocation (Node, using the service-role key):

```js
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

const { data: users } = await admin.auth.admin.listUsers();
const target = users.users.find((u) => u.email === "the-real-owner@example.com");

const { data, error } = await admin.rpc("bootstrap_first_owner", {
  target_company_id: "...",
  target_user_id: target.id,
  notes: "Platform operator, one-off onboarding, 2026-08-04, requested via support ticket #123",
});
```

If the company already has a `company_admin`, this raises a Postgres
exception (`P0001`) instead of silently doing nothing — treat that as "this
company is already bootstrapped, use the normal Roles tab instead,"
not as a bug to work around.

## What this is *not* for

- Adding a second admin to an already-bootstrapped company — use the
  existing employee Roles tab (`assignEmployeeRole()`), which any current
  `company_admin` can already do for anyone in their company.
- Fixing a locked-out account that still has *some* role — see the normal
  Roles tab, or (if genuinely nobody has access) treat it as an incident,
  not a routine bootstrap.
- Anything a `platform_super_admin` role/table would eventually own once
  that's built (see
  [`ROLES_AND_PERMISSIONS.md`](./ROLES_AND_PERMISSIONS.md) — `platform_super_admins`
  is documented but not implemented as of this milestone). This bootstrap
  function is a narrower, company-scoped stopgap for that specific gap, not a
  replacement for a future platform-admin system.
