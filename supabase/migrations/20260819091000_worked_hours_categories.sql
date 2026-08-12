-- Operational Quality milestone, Phases 1-2 (Worked Hours V2: categories).
--
-- Implements exactly the extension point 20260813090000_worked_hours.sql's
-- own header comment anticipated: "regular/overtime/night/travel
-- categories can be added later as a child table ... keyed off this row's
-- id, without altering this column or any existing row." worked_hours
-- stays the "one row per employee+project+work_date" DAY record (status,
-- submission, notes, corrections, discrepancies — all UNCHANGED, still
-- keyed by worked_hours_id exactly as before); worked_hours.hours becomes
-- a DERIVED total, recomputed by a trigger from the new child table
-- whenever a category row changes. Every existing query/RPC/UI reading
-- worked_hours.hours keeps working unchanged, showing the correct total.

-- ============================================================================
-- 1) worked_hours_categories enum + worked_hours_breakdown child table
-- ============================================================================
create type public.worked_hours_category as enum ('regular', 'overtime', 'night', 'travel', 'other');

create table public.worked_hours_breakdown (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  worked_hours_id uuid not null,
  category public.worked_hours_category not null,
  hours numeric(4, 1) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint worked_hours_breakdown_worked_hours_fk foreign key (worked_hours_id, company_id) references public.worked_hours (id, company_id) on delete cascade,
  constraint worked_hours_breakdown_project_fk foreign key (project_id, company_id) references public.projects (id, company_id) on delete cascade,
  constraint worked_hours_breakdown_one_per_category unique (worked_hours_id, category),
  -- Per-category bound mirrors worked_hours_bounds on the parent — the
  -- cross-category <=24 TOTAL cannot be expressed as a plain CHECK
  -- (Postgres CHECK constraints are single-row only); see
  -- sync_worked_hours_total() below for the real, always-enforced,
  -- database-level total check.
  constraint worked_hours_breakdown_bounds check (hours >= 0 and hours <= 24)
);

comment on table public.worked_hours_breakdown is
  'Category-level hours for one worked_hours (day) row — Regular/Overtime/Night/Travel/Other, one row per category per day. worked_hours.hours is kept as the derived SUM of these rows by sync_worked_hours_total() below, so every pre-existing reader of worked_hours.hours continues to see the correct total with no changes. The <=24 total-across-categories invariant is enforced here (trigger), not on this table alone.';

create index worked_hours_breakdown_worked_hours_idx on public.worked_hours_breakdown (worked_hours_id);
create index worked_hours_breakdown_project_idx on public.worked_hours_breakdown (project_id);

create trigger worked_hours_breakdown_set_updated_at
  before update on public.worked_hours_breakdown
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 2) The cross-row <=24 invariant + derived total sync
-- ============================================================================
-- Locks the PARENT worked_hours row first (select ... for update) before
-- summing — this is what actually closes the race a plain aggregate check
-- would miss: two concurrent transactions each inserting a DIFFERENT
-- category for the SAME employee+project+date, each independently seeing
-- a total under 24 before the other commits. Locking the one parent row
-- serializes every category write for that day through this trigger.
create or replace function public.sync_worked_hours_total()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_worked_hours_id uuid;
  v_total numeric;
begin
  v_worked_hours_id := coalesce(new.worked_hours_id, old.worked_hours_id);

  perform 1 from public.worked_hours where id = v_worked_hours_id for update;

  select coalesce(sum(hours), 0) into v_total
  from public.worked_hours_breakdown
  where worked_hours_id = v_worked_hours_id;

  if v_total > 24 then
    raise exception 'total hours across all categories for this day cannot exceed 24.0 (attempted total: %)', v_total;
  end if;

  update public.worked_hours set hours = v_total, updated_at = now() where id = v_worked_hours_id;

  return coalesce(new, old);
end;
$$;

comment on function public.sync_worked_hours_total() is
  'Recomputes worked_hours.hours as the sum of its worked_hours_breakdown rows, and is the actual, always-enforced database-level backstop for "total hours across all categories for one employee+project+work_date must never exceed 24.0" (Phase 1) — fires on every category insert/update/delete, regardless of write path (RPC or, if ever reached, a raw authenticated table write).';

create trigger worked_hours_breakdown_sync_total
  after insert or update or delete on public.worked_hours_breakdown
  for each row execute function public.sync_worked_hours_total();

alter table public.worked_hours_breakdown enable row level security;
alter table public.worked_hours_breakdown force row level security;

grant select, insert, update on public.worked_hours_breakdown to authenticated;

-- Same reader/writer sets as worked_hours itself (company-wide managers,
-- the project's own PM, or the owning employee reading their own rows) —
-- resolved via a join back to the parent since project-level manage-tier
-- checks need project_id, which is denormalized here for exactly that.
create policy worked_hours_breakdown_select
  on public.worked_hours_breakdown
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
      or exists (
        select 1 from public.worked_hours wh
        join public.employees e on e.id = wh.employee_id
        where wh.id = worked_hours_breakdown.worked_hours_id and e.profile_id = auth.uid()
      )
    )
  );

create policy worked_hours_breakdown_insert
  on public.worked_hours_breakdown
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  );

create policy worked_hours_breakdown_update
  on public.worked_hours_breakdown
  for update
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  )
  with check (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  );

-- No DELETE policy/grant — same "correct, never remove" evidentiary
-- convention as worked_hours itself (set hours to 0 with a note/reason,
-- never delete the row).

-- ============================================================================
-- 3) worked_hours_corrections gains a nullable category column
-- ============================================================================
-- Nullable: pre-existing correction rows (written before this migration,
-- when there was only ever one undifferentiated total) stay valid with
-- category = null; every NEW correction written by
-- upsert_worked_hours_categories() below always populates it, so "which
-- category changed" is preserved going forward without rewriting history.
alter table public.worked_hours_corrections add column category public.worked_hours_category;

comment on column public.worked_hours_corrections.category is
  'Which hour category this correction applied to — null only for correction rows written before Phase 1 (Worked Hours V2 categories), when a day had a single undifferentiated total.';

-- ============================================================================
-- 4) Data migration — existing generic hours become Regular Hours
-- ============================================================================
-- Every existing worked_hours row (regardless of its current hours value,
-- including 0) gets exactly one Regular-category breakdown row matching
-- its current total — never reinterpreted as overtime/night/etc. The
-- trigger above will recompute worked_hours.hours from this single row,
-- which is a no-op (sum of one row = that row's own value) — no historical
-- total changes.
insert into public.worked_hours_breakdown (company_id, project_id, worked_hours_id, category, hours, created_by, updated_by, created_at, updated_at)
select company_id, project_id, id, 'regular', hours, created_by, updated_by, created_at, updated_at
from public.worked_hours;

-- ============================================================================
-- 5) The categorized write path — upsert_worked_hours_categories()
-- ============================================================================
-- The new sole write path for a day's category breakdown (Phases 1-2).
-- Ensures the parent day-row exists, then for each {category, hours} pair
-- in target_categories that actually differs from the current value:
-- applies it directly if the day is still draft, or (if already submitted)
-- requires target_reason and records a worked_hours_corrections row
-- (with category populated) plus the existing worked_hours_corrected
-- notification, exactly mirroring upsert_worked_hours()'s own reasoned-
-- correction rule, just at per-category granularity. The <=24 total check
-- happens automatically via sync_worked_hours_total() above on each
-- breakdown write — this function does not duplicate that logic, it just
-- lets the trigger's exception propagate (rolling back the whole call)
-- with a useful message.
create or replace function public.upsert_worked_hours_categories(
  target_project_id uuid,
  target_employee_id uuid,
  target_work_date date,
  target_categories jsonb,
  target_note text default null,
  target_reason text default null
)
returns public.worked_hours
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_worked_hours public.worked_hours;
  v_old_total numeric;
  v_entry record;
  v_existing_hours numeric;
  v_any_correction boolean := false;
  v_recipient_user_id uuid;
  v_new_total numeric;
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  select * into v_worked_hours
  from public.worked_hours
  where project_id = target_project_id and employee_id = target_employee_id and work_date = target_work_date
  for update;

  if not found then
    insert into public.worked_hours (company_id, project_id, employee_id, work_date, hours, note, created_by, updated_by)
    values (v_company_id, target_project_id, target_employee_id, target_work_date, 0, target_note, auth.uid(), auth.uid())
    returning * into v_worked_hours;
  end if;

  v_old_total := v_worked_hours.hours;

  for v_entry in select * from jsonb_to_recordset(target_categories) as x(category public.worked_hours_category, hours numeric)
  loop
    select hours into v_existing_hours from public.worked_hours_breakdown where worked_hours_id = v_worked_hours.id and category = v_entry.category;

    if v_existing_hours is distinct from v_entry.hours then
      if v_worked_hours.status = 'submitted' then
        if target_reason is null or btrim(target_reason) = '' then
          raise exception 'a reason is required to correct already-submitted worked hours';
        end if;

        insert into public.worked_hours_corrections (company_id, worked_hours_id, project_id, employee_id, category, previous_hours, new_hours, reason, changed_by)
        values (v_company_id, v_worked_hours.id, target_project_id, target_employee_id, v_entry.category, coalesce(v_existing_hours, 0), v_entry.hours, target_reason, auth.uid());
        v_any_correction := true;
      end if;

      insert into public.worked_hours_breakdown (company_id, project_id, worked_hours_id, category, hours, created_by, updated_by)
      values (v_company_id, target_project_id, v_worked_hours.id, v_entry.category, v_entry.hours, auth.uid(), auth.uid())
      on conflict (worked_hours_id, category) do update set hours = excluded.hours, updated_by = auth.uid(), updated_at = now();
    end if;
  end loop;

  if target_note is not null then
    update public.worked_hours set note = target_note, updated_by = auth.uid() where id = v_worked_hours.id;
  end if;

  if v_any_correction then
    select coalesce(sum(hours), 0) into v_new_total from public.worked_hours_breakdown where worked_hours_id = v_worked_hours.id;
    select e.profile_id into v_recipient_user_id from public.employees e where e.id = target_employee_id;
    if v_recipient_user_id is not null then
      insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
      values (
        v_company_id,
        v_recipient_user_id,
        'worked_hours_corrected',
        'Worked hours updated',
        format('%s: total %s h -> %s h. Reason: %s', to_char(target_work_date, 'DD Mon YYYY'), v_old_total, v_new_total, target_reason),
        '/my-hours'
      );
    end if;
  end if;

  select * into v_worked_hours from public.worked_hours where id = v_worked_hours.id;
  return v_worked_hours;
end;
$$;

comment on function public.upsert_worked_hours_categories(uuid, uuid, date, jsonb, text, text) is
  'The categorized write path for a day''s worked hours (Phase 1-2 of the Operational Quality milestone) — target_categories is a jsonb array of {"category":"regular"|"overtime"|"night"|"travel"|"other","hours":numeric}. Only categories whose value actually changed are written/corrected. RLS on worked_hours/worked_hours_breakdown/worked_hours_corrections/notifications is the real gate (SECURITY INVOKER); sync_worked_hours_total()''s trigger is the real <=24 gate. modules/worked-hours/actions.ts is the sole caller.';

revoke all on function public.upsert_worked_hours_categories(uuid, uuid, date, jsonb, text, text) from public, anon;
grant execute on function public.upsert_worked_hours_categories(uuid, uuid, date, jsonb, text, text) to authenticated;

-- ============================================================================
-- 6) bulk_apply_worked_hours gains a target_category parameter
-- ============================================================================
-- Same "already-submitted rows are silently skipped, never overwritten"
-- rule as before, now ALSO silently skipping (not failing the whole
-- batch) any single employee for whom applying this category would push
-- their day over the 24h cap — one employee's cap being hit shouldn't
-- block "apply 8 Regular Hours" from succeeding for everyone else.
create or replace function public.bulk_apply_worked_hours(
  target_project_id uuid,
  target_work_date date,
  target_category public.worked_hours_category,
  target_hours numeric,
  target_employee_ids uuid[]
)
returns setof public.worked_hours
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_employee_id uuid;
  v_worked_hours_id uuid;
  v_status public.worked_hours_status;
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  foreach v_employee_id in array target_employee_ids loop
    begin
      insert into public.worked_hours (company_id, project_id, employee_id, work_date, hours, created_by, updated_by)
      values (v_company_id, target_project_id, v_employee_id, target_work_date, 0, auth.uid(), auth.uid())
      on conflict (project_id, employee_id, work_date) do nothing;

      select id, status into v_worked_hours_id, v_status
      from public.worked_hours
      where project_id = target_project_id and employee_id = v_employee_id and work_date = target_work_date;

      if v_status = 'draft' then
        insert into public.worked_hours_breakdown (company_id, project_id, worked_hours_id, category, hours, created_by, updated_by)
        values (v_company_id, target_project_id, v_worked_hours_id, target_category, target_hours, auth.uid(), auth.uid())
        on conflict (worked_hours_id, category) do update
          set hours = excluded.hours, updated_by = auth.uid(), updated_at = now();
      end if;
    exception when raise_exception then
      -- 24h cap exceeded for this one employee (sync_worked_hours_total())
      -- — skip them, continue applying to the rest of the batch.
      continue;
    end;
  end loop;

  return query
  select * from public.worked_hours
  where project_id = target_project_id and work_date = target_work_date and employee_id = any (target_employee_ids);
end;
$$;

comment on function public.bulk_apply_worked_hours(uuid, date, public.worked_hours_category, numeric, uuid[]) is
  'Phase 2''s "Apply [X] [Category] to all" bulk action (modules/worked-hours/actions.ts) — upserts ONE category''s hours as a DRAFT value for every listed employee; an employee who already has SUBMITTED hours for that date, or for whom this would exceed the 24h/day cap, is left untouched rather than failing the whole batch.';

revoke all on function public.bulk_apply_worked_hours(uuid, date, public.worked_hours_category, numeric, uuid[]) from public, anon;
grant execute on function public.bulk_apply_worked_hours(uuid, date, public.worked_hours_category, numeric, uuid[]) to authenticated;

drop function if exists public.bulk_apply_worked_hours(uuid, date, numeric, uuid[]);

-- ============================================================================
-- 7) resolve_worked_hours_discrepancy's correction path becomes category-aware
-- ============================================================================
-- Accepting a discrepancy with a resulting-hours value now applies that
-- value to the Regular category specifically (the same "historical/
-- undifferentiated hours map to Regular" convention this migration's data
-- backfill uses) via the new categorized path, rather than the old flat
-- upsert_worked_hours(). The old function is left in place, unused by any
-- new code, rather than dropped outright (no other caller depends on it,
-- but removing working code the app no longer calls carries no benefit
-- proportional to the risk of missing a reference).
create or replace function public.resolve_worked_hours_discrepancy(
  target_discrepancy_id uuid,
  target_status public.worked_hours_discrepancy_status,
  target_resolution_note text,
  target_resulting_hours numeric default null
)
returns public.worked_hours_discrepancies
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_discrepancy public.worked_hours_discrepancies;
  v_result public.worked_hours_discrepancies;
  v_recipient_user_id uuid;
begin
  if target_status not in ('accepted', 'rejected') then
    raise exception 'a discrepancy can only be resolved as accepted or rejected';
  end if;
  if target_resolution_note is null or btrim(target_resolution_note) = '' then
    raise exception 'a resolution note is required';
  end if;

  select * into v_discrepancy from public.worked_hours_discrepancies where id = target_discrepancy_id and status = 'open';
  if v_discrepancy.id is null then
    raise exception 'open worked hours discrepancy % not found', target_discrepancy_id;
  end if;

  if target_status = 'accepted' and target_resulting_hours is not null then
    perform public.upsert_worked_hours_categories(
      v_discrepancy.project_id,
      v_discrepancy.employee_id,
      (select work_date from public.worked_hours where id = v_discrepancy.worked_hours_id),
      jsonb_build_array(jsonb_build_object('category', 'regular', 'hours', target_resulting_hours)),
      null,
      format('Accepted discrepancy report: %s', target_resolution_note)
    );
  end if;

  update public.worked_hours_discrepancies
  set status = target_status, resolved_by = auth.uid(), resolved_at = now(), resolution_note = target_resolution_note,
      resulting_hours = case when target_status = 'accepted' then target_resulting_hours else null end
  where id = target_discrepancy_id
  returning * into v_result;

  select e.profile_id into v_recipient_user_id from public.employees e where e.id = v_discrepancy.employee_id;
  if v_recipient_user_id is not null then
    insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
    values (
      v_discrepancy.company_id,
      v_recipient_user_id,
      'worked_hours_discrepancy_resolved',
      case when target_status = 'accepted' then 'Discrepancy report accepted' else 'Discrepancy report rejected' end,
      target_resolution_note,
      '/my-hours'
    );
  end if;

  return v_result;
end;
$$;

comment on function public.resolve_worked_hours_discrepancy(uuid, public.worked_hours_discrepancy_status, text, numeric) is
  'PM/Admin "[ accept / reject ]" review of an employee-reported discrepancy. Accepting with a target_resulting_hours value applies it to the Regular category via upsert_worked_hours_categories() (same audit trail/notification any other correction gets), then resolves the discrepancy row and ALWAYS notifies the reporting employee (worked_hours_discrepancy_resolved) regardless of accept/reject or whether hours changed. RLS on worked_hours_discrepancies is the real write gate.';

revoke all on function public.resolve_worked_hours_discrepancy(uuid, public.worked_hours_discrepancy_status, text, numeric) from public, anon;
grant execute on function public.resolve_worked_hours_discrepancy(uuid, public.worked_hours_discrepancy_status, text, numeric) to authenticated;
