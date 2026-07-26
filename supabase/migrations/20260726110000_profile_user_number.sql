-- profiles.user_number — a permanent, globally unique, human-friendly
-- public identifier for a platform account. Implements the "Platform User
-- ID" architecture decision: a person's platform identity must never
-- change even though their per-organization employee_number does — see
-- docs/PRODUCT_REQUIREMENTS.md §11.2 and the implementation report for
-- this milestone.
--
-- Format: USR-XXXXXXXX — an 8-character random code from a Crockford-
-- Base32-style alphabet (0-9, A-Z minus I/L/O/U, avoiding visual
-- ambiguity with 1/1/0 and reducing accidental readable substrings).
-- Deliberately RANDOM, not sequential — unlike employees.employee_number
-- (safely sequential because it's tenant-isolated by RLS plus an
-- organization segment in its own route), user_number is platform-wide
-- and meant to be publicly exposable with no per-tenant boundary
-- narrowing who it identifies, so it must not be trivially enumerable.
--
-- Scope note: this migration is deliberately database-only. There is no
-- application code path that creates or edits a profiles row directly —
-- handle_new_user() (20260725090700_functions_and_triggers.sql) is the
-- sole writer, on signup, and profiles.user_number is immutable
-- thereafter (§6 below) — so nothing in modules/ needs to change. A
-- future Platform Super Admin area reads/searches this column once that
-- area (and its own platform_super_admins/is_platform_super_admin()
-- prerequisite) is actually built; not part of this migration.

-- ── 1) column ─────────────────────────────────────────────────────────
alter table public.profiles
  add column user_number text;

comment on column public.profiles.user_number is
  'Permanent, globally unique, publicly-safe identifier (e.g. USR-7F9D2KLM) — independent of any organization, membership, or employee record, and unrelated to employees.employee_number (per-organization, sequential). Never changes once assigned.';

-- ── 2) generator ──────────────────────────────────────────────────────
-- Bounded retry loop rather than a single attempt: a collision is
-- astronomically unlikely (8 characters from a 32-symbol alphabet ≈ 2^40
-- possibilities) but the UNIQUE constraint added in step 5 is the actual
-- guarantee this relies on — the loop just makes a first-attempt
-- collision vanishingly unlikely, it does not itself guarantee
-- uniqueness. Plain SECURITY DEFINER (not STABLE — this reads randomness
-- and its result must differ across calls), search_path pinned,
-- consistent with every other privileged function in this schema.
create or replace function public.generate_user_number()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; -- Crockford-safe: no I, L, O, U
  v_candidate text;
  v_attempt integer := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    v_candidate := 'USR-';
    for i in 1..8 loop
      v_candidate := v_candidate || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    end loop;

    exit when not exists (select 1 from public.profiles where user_number = v_candidate);

    if v_attempt >= 10 then
      raise exception 'generate_user_number: exhausted % attempts without finding a unique code', v_attempt;
    end if;
  end loop;

  return v_candidate;
end;
$$;

comment on function public.generate_user_number() is
  'Generates a random, currently-unused USR-XXXXXXXX code. Internal building block for handle_new_user() and this migration''s own backfill only — not meant to be called directly, and not granted to authenticated.';

revoke all on function public.generate_user_number() from public, anon, authenticated;

-- ── 3) wire into profile creation ────────────────────────────────────
-- Re-creates handle_new_user() (20260725090700_functions_and_triggers.sql)
-- to also assign a user_number at insert time. This is the only
-- application-reachable path that ever creates a profiles row, so it's
-- the only call site that needs to change; the trigger binding itself
-- (on_auth_user_created) is untouched.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, user_number)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, ''),
    public.generate_user_number()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ── 4) backfill existing profiles ────────────────────────────────────
-- Only rows where user_number IS NULL are touched — every profile that
-- already exists (created before this migration) gets one assigned,
-- once, here. Nothing else about an existing profile changes.
do $$
declare
  r record;
begin
  for r in
    select id from public.profiles where user_number is null order by created_at, id
  loop
    update public.profiles
    set user_number = public.generate_user_number()
    where id = r.id;
  end loop;
end;
$$;

-- ── 5) enforce the invariant ─────────────────────────────────────────
-- Every profile now has a number (existing rows backfilled in step 4;
-- handle_new_user() always assigns one for every new signup going
-- forward) — make that a real, enforced constraint. The UNIQUE
-- constraint's own backing index covers lookups by user_number; no
-- separate index is added.
alter table public.profiles
  alter column user_number set not null;

alter table public.profiles
  add constraint profiles_user_number_format
  check (user_number ~ '^USR-[0-9A-HJKMNP-TV-Z]{8}$');

alter table public.profiles
  add constraint profiles_user_number_unique unique (user_number);

-- ── 6) immutability ───────────────────────────────────────────────────
-- profiles_update_own (20260725090900_rls_policies.sql) still allows a
-- user to UPDATE their own row at the RLS/row level (for full_name/phone)
-- — RLS has no column-level granularity, so this trigger is what actually
-- blocks a change to this one column specifically, unconditionally, for
-- every role including a user updating their own row. Same pattern
-- already proven for employees.employee_number
-- (20260726100100_employee_numbering.sql) and audit_events
-- (20260725090700_functions_and_triggers.sql).
create or replace function public.prevent_user_number_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.user_number is distinct from new.user_number then
    raise exception 'user_number is immutable and cannot be changed once assigned';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_user_number_change
  before update on public.profiles
  for each row execute function public.prevent_user_number_change();
