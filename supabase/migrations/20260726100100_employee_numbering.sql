-- Automatic, immutable, per-organization employee numbering — see the
-- Employee Management Polish milestone's implementation report, and the
-- follow-up correction report for the counter-initialization fix below
-- (this migration is still unapplied, so it was corrected in place rather
-- than patched with a second migration).
--
-- Format: <employee_number_prefix>-00001 (5-digit, zero-padded, no upper
-- bound enforced — a 6th digit is allowed once an org passes 99999
-- employees rather than erroring).
--
-- ALGORITHM (must run in this order — each step depends on the one before
-- it being complete for every organization first, not interleaved
-- per-organization):
--   1. Assign every organization a permanent, validated employee_number_prefix.
--   2. Create the counter storage table.
--   3+4. For every organization, inspect its EXISTING employees for numbers
--      that already match "<that org's prefix>-<digits>", and initialize
--      that organization's counter to (highest matching suffix found) + 1
--      — or 1 if none match. This is what actually fixes the collision
--      bug: without it, a counter naively starting at 1 would re-issue a
--      number that already exists on a legacy/manually-entered row.
--   5. Backfill only employees.employee_number IS NULL rows, via the now-
--      correctly-initialized counters.
--   6. Re-synchronize counters once more after backfill (defensive no-op
--      in the normal case; costs nothing to double-check).
--   7. Enforce NOT NULL and immutability, now that every row has a number
--      that is guaranteed unique and above every pre-existing one.

-- ── 1) organizations.employee_number_prefix ──────────────────────────
alter table public.organizations
  add column employee_number_prefix text;

comment on column public.organizations.employee_number_prefix is
  'Permanent, URL-safe (A-Z0-9 only) prefix for this organization''s generated employee numbers (e.g. VALUTRIS-00001). Set once at backfill/creation time; changing an organization''s display name never changes this. Not itself unique across organizations — employee_number uniqueness is scoped per organization_id (see employees_org_employee_number_key), so two orgs sharing a prefix is harmless.';

-- Deterministic backfill for every existing organization: uppercase the
-- slug (already URL-safe by convention — see organizations.slug) and
-- strip anything outside A-Z0-9. Falls back to a stable, still-
-- deterministic ORG<8-hex-chars-of-id> when a slug strips down to nothing
-- (e.g. a slug that was entirely punctuation) so no organization is ever
-- left without a usable prefix.
--
-- NOTE on Valutris specifically: this deterministic rule already produces
-- prefix = 'VALUTRIS' for any organization whose slug is exactly
-- 'valutris' (the expected case) — no special-cased UPDATE is applied
-- here. A prior version of this migration additionally ran
-- `update organizations set employee_number_prefix = 'VALUTRIS' where
-- lower(name) like 'valutris%'`, which was removed: a partial name match
-- could silently repoint more than one organization (e.g. "Valutris
-- Holding", "Valutris Test") onto the same prefix, which is exactly the
-- kind of silent multi-row mutation this correction pass was asked to
-- eliminate. If the real Valutris organization's slug is NOT exactly
-- 'valutris', see the implementation report for the exact, safe,
-- single-row manual SQL to run after confirming its real id/slug —
-- nothing here guesses at it.
update public.organizations
set employee_number_prefix = coalesce(
  nullif(regexp_replace(upper(slug), '[^A-Z0-9]', '', 'g'), ''),
  'ORG' || upper(left(replace(id::text, '-', ''), 8))
)
where employee_number_prefix is null;

alter table public.organizations
  alter column employee_number_prefix set not null;

alter table public.organizations
  add constraint organizations_employee_number_prefix_format
  check (employee_number_prefix ~ '^[A-Z0-9]+$');

-- ── 2) per-organization counter ──────────────────────────────────────
-- A dedicated row-per-organization counter table, rather than deriving
-- the next number from `count(*)` or `max(...)` over `employees` on every
-- allocation — both of those are unsafe under concurrent inserts (two
-- concurrent reads can observe the same value before either insert
-- commits, producing a duplicate number). A dedicated counter row,
-- incremented via a single atomic `UPDATE ... RETURNING`, is safe under
-- concurrency because Postgres row-level locking serializes concurrent
-- updates to the same row — the second transaction blocks until the first
-- commits, then reads the already-incremented value. `max(...)` IS,
-- however, used once below (step 3/4) to correctly INITIALIZE that
-- counter from pre-existing data — a one-time migration-time computation,
-- not the steady-state allocation path.
create table public.organization_employee_number_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  next_number integer not null default 1,
  updated_at timestamptz not null default now()
);

comment on table public.organization_employee_number_counters is
  'One row per organization; next_number is the next employee number to hand out, incremented atomically by allocate_employee_number(). Never exposed to PostgREST directly (no RLS policy, no grant to authenticated) — only reachable through the SECURITY DEFINER functions below.';

alter table public.organization_employee_number_counters enable row level security;
alter table public.organization_employee_number_counters force row level security;
-- No policies, no grants: this table has zero direct API surface. It is
-- only ever touched from inside allocate_employee_number(), which runs as
-- the function owner (SECURITY DEFINER) regardless of the calling role.
revoke all on public.organization_employee_number_counters from public, anon, authenticated;

-- ── 3) allocation functions ──────────────────────────────────────────
-- allocate_employee_number() is the unauthenticated-safe core: it just
-- allocates the next number for target_org_id, with no caller-role check.
-- It is NOT granted to `authenticated` or `anon` or `PUBLIC` — the only
-- callers are (a) next_employee_number() below, which adds the real
-- authorization check, and (b) this same migration's own backfill step
-- further down, which runs as the migration owner and has no
-- `auth.uid()`/session to check against in the first place.
create or replace function public.allocate_employee_number(target_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefix text;
  v_next integer;
begin
  select employee_number_prefix into v_prefix
  from public.organizations
  where id = target_org_id;

  if v_prefix is null then
    raise exception 'organization % has no employee_number_prefix configured', target_org_id;
  end if;

  insert into public.organization_employee_number_counters (organization_id, next_number)
  values (target_org_id, 1)
  on conflict (organization_id) do nothing;

  update public.organization_employee_number_counters
  set next_number = next_number + 1, updated_at = now()
  where organization_id = target_org_id
  returning next_number - 1 into v_next;

  return v_prefix || '-' || lpad(v_next::text, 5, '0');
end;
$$;

revoke all on function public.allocate_employee_number(uuid) from public, anon, authenticated;

-- next_employee_number() is the RPC-exposed wrapper: same allocation,
-- gated to callers who could actually create an employee in target_org_id
-- (mirrors employees_insert_managers' condition exactly, so the number
-- generator and the insert it feeds can never disagree about who's
-- allowed to create an employee).
--
-- Membership-status verification: has_any_organization_role() (see
-- 20260725091100_role_helper_and_employees_rls.sql) requires
-- `m.status = 'active'` on the caller's organization_memberships row as
-- part of its own EXISTS check — confirmed by re-reading that function's
-- definition as part of this correction pass. An `invited`, `suspended`,
-- or `removed` membership therefore already fails this check on its own;
-- a stale role assignment attached to a non-active membership can never
-- authorize a number allocation. No additional membership-status check is
-- added here — it would be redundant with (and could only ever agree
-- with) the one has_any_organization_role() already performs.
create or replace function public.next_employee_number(target_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_any_organization_role(target_org_id, array['company_admin', 'operations_manager']) then
    raise exception 'insufficient_privilege: cannot allocate an employee number for this organization';
  end if;

  return public.allocate_employee_number(target_org_id);
end;
$$;

comment on function public.next_employee_number(uuid) is
  'Allocates and returns the next employee number for target_org_id (e.g. VALUTRIS-00042). Caller must hold company_admin or operations_manager via an ACTIVE membership in that organization — mirrors employees_insert_managers and delegates the active-membership check entirely to has_any_organization_role(). Concurrency-safe: backed by an atomic UPDATE...RETURNING on organization_employee_number_counters.';

revoke all on function public.next_employee_number(uuid) from public, anon;
revoke execute on function public.next_employee_number(uuid) from authenticated;
grant execute on function public.next_employee_number(uuid) to authenticated;

-- ── 4) initialize every organization's counter above its existing numbers ──
-- For each organization, find the highest numeric suffix among its
-- EXISTING employee_number values that actually match "<that org's
-- current prefix>-<digits>" (case-sensitive — numbers are always stored
-- uppercase). Anything that doesn't match that shape — a malformed value,
-- a legacy number issued under a different prefix, free text someone
-- typed in before this milestone existed — is silently excluded from the
-- max() computation and left completely untouched; it is never a
-- candidate for "the highest number in use" and never rewritten. This is
-- what actually prevents the collision described in the correction
-- report: without it, VALUTRIS-00001 already existing as a manually-
-- entered value would be silently reissued to a new employee, since a
-- counter naively starting at 1 has no way to know that number is taken.
--
-- The prefix is safe to splice directly into the regex (no escaping
-- needed): organizations_employee_number_prefix_format, added in step 1
-- above, already guarantees it matches ^[A-Z0-9]+$ — none of those
-- characters are regex metacharacters.
insert into public.organization_employee_number_counters (organization_id, next_number)
select
  o.id,
  coalesce(
    (
      select max((regexp_match(e.employee_number, '^' || o.employee_number_prefix || '-(\d+)$'))[1]::integer)
      from public.employees e
      where e.organization_id = o.id
        and e.employee_number ~ ('^' || o.employee_number_prefix || '-\d+$')
    ),
    0
  ) + 1
from public.organizations o
on conflict (organization_id) do nothing;

-- ── 5) backfill existing employees with no number ────────────────────
-- Only rows where employee_number IS NULL are touched — every employee
-- that already has a number (assigned manually before this milestone, or
-- matching a legacy format) keeps it exactly as-is. Ordered by
-- (organization_id, created_at, id) so the assignment is deterministic
-- and reproducible. Uses allocate_employee_number() directly (not
-- next_employee_number()) since a migration runs with no authenticated
-- session for the role check to evaluate against. Safe against the
-- collision this correction pass fixes: step 4 already moved every
-- organization's counter past its highest existing matching number
-- before this loop ever runs.
do $$
declare
  r record;
begin
  for r in
    select id, organization_id
    from public.employees
    where employee_number is null
    order by organization_id, created_at, id
  loop
    update public.employees
    set employee_number = public.allocate_employee_number(r.organization_id)
    where id = r.id;
  end loop;
end;
$$;

-- ── 6) re-synchronize counters after backfill ────────────────────────
-- Defensive re-check: recompute "highest matching number in use" one more
-- time per organization and bump next_number forward if it's somehow
-- still behind. In the normal case (step 4 already ran before any
-- backfill/allocation touched the table) this updates zero rows — it
-- exists as a safety net, not because the algorithm above is expected to
-- leave anything unsynchronized.
update public.organization_employee_number_counters c
set next_number = sub.min_next, updated_at = now()
from (
  select
    o.id as organization_id,
    coalesce(
      (
        select max((regexp_match(e.employee_number, '^' || o.employee_number_prefix || '-(\d+)$'))[1]::integer)
        from public.employees e
        where e.organization_id = o.id
          and e.employee_number ~ ('^' || o.employee_number_prefix || '-\d+$')
      ),
      0
    ) + 1 as min_next
  from public.organizations o
) sub
where c.organization_id = sub.organization_id
  and c.next_number < sub.min_next;

-- ── 7) NOT NULL + immutability ────────────────────────────────────────
-- Every employee now has a number (every pre-existing non-null value was
-- preserved untouched; every previously-null row was backfilled in step 5
-- using counters correctly initialized in step 4) — make that a real,
-- enforced invariant.
alter table public.employees
  alter column employee_number set not null;

-- Application code no longer sends employee_number on UPDATE at all (see
-- modules/employees/actions.ts), but this is enforced at the database
-- level too, unconditionally, for every role including company_admin —
-- the same "don't rely on the application layer alone" pattern as
-- audit_events' hard immutability trigger
-- (20260725090700_functions_and_triggers.sql). Only guards a CHANGE to an
-- already-set value — the backfill above and the create flow's initial
-- INSERT are both unaffected (this is a BEFORE UPDATE trigger; it never
-- fires on INSERT, and old.employee_number is never null by the time this
-- trigger exists since the backfill above already ran).
create or replace function public.prevent_employee_number_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.employee_number is distinct from new.employee_number then
    raise exception 'employee_number is immutable and cannot be changed once assigned';
  end if;
  return new;
end;
$$;

create trigger employees_prevent_number_change
  before update on public.employees
  for each row execute function public.prevent_employee_number_change();
