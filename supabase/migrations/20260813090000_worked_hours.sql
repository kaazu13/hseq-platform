-- Worked Hours (Phases D, E) — project/date-scoped credited hours, kept
-- deliberately separate from Today's Teams' lock lifecycle: Today's Teams
-- answers "where and with whom was the employee working," Worked Hours
-- answers "how many hours was the employee credited." A day's teams can be
-- locked without its hours ever being submitted, and hours can be
-- submitted independently of whether the day's teams were ever locked at
-- all — the two lifecycles never gate each other.

-- ============================================================================
-- 1) worked_hours
-- ============================================================================
create type public.worked_hours_status as enum ('draft', 'submitted');

create table public.worked_hours (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  employee_id uuid not null,
  work_date date not null,
  -- A single numeric total for now (this milestone's explicit "do not
  -- overbuild payroll functionality now") — regular/overtime/night/travel
  -- categories can be added later as a child table (e.g.
  -- worked_hours_breakdown(worked_hours_id, category, hours)) keyed off
  -- this row's id, without altering this column or any existing row.
  hours numeric(4, 1) not null,
  note text,
  status public.worked_hours_status not null default 'draft',
  submitted_at timestamptz,
  submitted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint worked_hours_project_fk foreign key (project_id, company_id) references public.projects (id, company_id) on delete cascade,
  constraint worked_hours_employee_fk foreign key (employee_id, company_id) references public.employees (id, company_id) on delete cascade,
  constraint worked_hours_one_per_employee_project_date unique (project_id, employee_id, work_date),
  constraint worked_hours_bounds check (hours >= 0 and hours <= 24),
  constraint worked_hours_submitted_fields_paired check ((submitted_at is null) = (submitted_by is null)),
  -- Enables the composite FK from worked_hours_corrections/_discrepancies below.
  constraint worked_hours_id_company_key unique (id, company_id)
);

comment on table public.worked_hours is
  'Credited hours for one employee on one project on one calendar date — deliberately separate from daily_teams'' lock lifecycle (see this migration''s header comment). status=draft is freely editable by an authorized manager; status=submitted requires a reason to change (see upsert_worked_hours() below) and every such change is recorded in worked_hours_corrections. Employees never write this table directly (no INSERT/UPDATE grant) — they may only report a discrepancy against it (worked_hours_discrepancies).';

create index worked_hours_project_date_idx on public.worked_hours (project_id, work_date);
create index worked_hours_employee_date_idx on public.worked_hours (employee_id, work_date);
create index worked_hours_company_id_idx on public.worked_hours (company_id);

create trigger worked_hours_set_updated_at
  before update on public.worked_hours
  for each row execute function public.set_updated_at();

create or replace function public.validate_worked_hours_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_project_not_archived(new.project_id);
  perform public.assert_employee_eligible_for_assignment(new.employee_id);
  new.status := 'draft';
  new.submitted_at := null;
  new.submitted_by := null;
  return new;
end;
$$;

create trigger worked_hours_validate_insert
  before insert on public.worked_hours
  for each row execute function public.validate_worked_hours_insert();

-- Identity fields are immutable. Any change to hours/note/status/
-- submitted_* only ever happens through upsert_worked_hours()/
-- submit_worked_hours()/resolve_worked_hours_discrepancy() below — this
-- trigger does not itself enforce the "submitted hours need a reason"
-- rule (that lives in upsert_worked_hours(), the sole intended write
-- path), it only protects identity.
create or replace function public.validate_worked_hours_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.project_id is distinct from old.project_id
    or new.employee_id is distinct from old.employee_id
    or new.work_date is distinct from old.work_date
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'worked hours identity/creation fields cannot be changed';
  end if;
  return new;
end;
$$;

create trigger worked_hours_validate_update
  before update on public.worked_hours
  for each row execute function public.validate_worked_hours_update();

alter table public.worked_hours enable row level security;
alter table public.worked_hours force row level security;

grant select, insert, update on public.worked_hours to authenticated;

-- Reader set matches this milestone's explicit direction: company-wide
-- managers, the project's own PM, or the owning employee (their own hours
-- only) — deliberately NOT Foreman/HSE Officer/Inspector, who have no
-- documented worked-hours permission in this milestone's "Expected
-- direction" list.
create policy worked_hours_select
  on public.worked_hours
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
      or exists (select 1 from public.employees e where e.id = worked_hours.employee_id and e.profile_id = auth.uid())
    )
  );

-- Only company-wide managers or the project's own PM may write worked
-- hours at all — an employee has no INSERT/UPDATE path onto this table,
-- matching "Employees should NOT directly overwrite approved/submitted
-- hours" taken to its logical database-level conclusion: they cannot
-- overwrite DRAFT hours either, only report a discrepancy.
create policy worked_hours_insert
  on public.worked_hours
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  );

create policy worked_hours_update
  on public.worked_hours
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

-- No DELETE policy, no DELETE grant — a mistaken row is corrected (hours
-- set to 0 with a note, if genuinely nothing was worked), never removed.

-- ============================================================================
-- 2) worked_hours_corrections — audit trail for changes to SUBMITTED hours
-- ============================================================================
create table public.worked_hours_corrections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  worked_hours_id uuid not null,
  -- Denormalized from the parent worked_hours row at insert time — same
  -- reasoning as team_assignments.project_id: lets RLS scope by project
  -- without a join back through worked_hours on every read.
  project_id uuid not null,
  employee_id uuid not null,
  previous_hours numeric(4, 1) not null,
  new_hours numeric(4, 1) not null,
  reason text not null,
  changed_by uuid not null references public.profiles (id),
  changed_at timestamptz not null default now(),
  constraint worked_hours_corrections_worked_hours_fk foreign key (worked_hours_id, company_id) references public.worked_hours (id, company_id) on delete cascade,
  constraint worked_hours_corrections_reason_required check (btrim(reason) <> '')
);

comment on table public.worked_hours_corrections is
  'Append-only audit trail: one row per change made to an already-SUBMITTED worked_hours row (draft edits are not recorded here — see upsert_worked_hours()). "10.0h -> 8.0h, reason: ..." — this milestone''s explicit "preserve previous value, new value, changed by, changed at, reason" requirement.';

create index worked_hours_corrections_worked_hours_idx on public.worked_hours_corrections (worked_hours_id, changed_at);
create index worked_hours_corrections_project_idx on public.worked_hours_corrections (project_id);

alter table public.worked_hours_corrections enable row level security;
alter table public.worked_hours_corrections force row level security;

grant select, insert on public.worked_hours_corrections to authenticated;

create policy worked_hours_corrections_select
  on public.worked_hours_corrections
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
      or exists (select 1 from public.employees e where e.id = worked_hours_corrections.employee_id and e.profile_id = auth.uid())
    )
  );

-- Same write-actor set as worked_hours itself — a correction row is only
-- ever inserted alongside the worked_hours UPDATE it documents, by
-- upsert_worked_hours() (SECURITY INVOKER — this policy is the real gate).
create policy worked_hours_corrections_insert
  on public.worked_hours_corrections
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
    )
  );

-- No UPDATE/DELETE policy or grant at all — append-only, matching audit_events.

-- ============================================================================
-- 3) worked_hours_discrepancies — employee-reported, PM/Admin-resolved
-- ============================================================================
create type public.worked_hours_discrepancy_status as enum ('open', 'accepted', 'rejected');

create table public.worked_hours_discrepancies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  worked_hours_id uuid not null,
  project_id uuid not null,
  employee_id uuid not null,
  reported_by uuid not null references public.profiles (id),
  comment text not null,
  status public.worked_hours_discrepancy_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  -- If accepted with a correction, the hours value actually applied — kept
  -- here for a self-contained record of what the discrepancy resulted in,
  -- alongside (not instead of) the worked_hours_corrections row that same
  -- correction also creates.
  resulting_hours numeric(4, 1),
  created_at timestamptz not null default now(),
  constraint worked_hours_discrepancies_worked_hours_fk foreign key (worked_hours_id, company_id) references public.worked_hours (id, company_id) on delete cascade,
  constraint worked_hours_discrepancies_comment_required check (btrim(comment) <> ''),
  constraint worked_hours_discrepancies_resolved_fields_paired check ((resolved_at is null) = (resolved_by is null)),
  constraint worked_hours_discrepancies_open_has_no_resolution check (status <> 'open' or (resolved_at is null and resolution_note is null))
);

comment on table public.worked_hours_discrepancies is
  'An employee''s "[ Report discrepancy ]" against their own worked_hours row. status=open until a PM/Admin accepts or rejects it (resolve_worked_hours_discrepancy() below); accepting may optionally apply a corrected hours value, which also writes a worked_hours_corrections row — the discrepancy history itself is never overwritten, only resolved.';

create index worked_hours_discrepancies_worked_hours_idx on public.worked_hours_discrepancies (worked_hours_id);
create index worked_hours_discrepancies_project_status_idx on public.worked_hours_discrepancies (project_id, status);

alter table public.worked_hours_discrepancies enable row level security;
alter table public.worked_hours_discrepancies force row level security;

grant select, insert, update on public.worked_hours_discrepancies to authenticated;

create policy worked_hours_discrepancies_select
  on public.worked_hours_discrepancies
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager'])
      or public.is_project_manager(project_id)
      or exists (select 1 from public.employees e where e.id = worked_hours_discrepancies.employee_id and e.profile_id = auth.uid())
    )
  );

-- Only the OWNING employee may report a discrepancy against their own
-- worked_hours row — reported_by is pinned to auth.uid() in the with check
-- (never client-trusted), and employee_id/worked_hours_id must actually
-- belong to that same signed-in employee.
create policy worked_hours_discrepancies_insert
  on public.worked_hours_discrepancies
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and reported_by = auth.uid()
    and exists (
      select 1 from public.employees e
      where e.id = worked_hours_discrepancies.employee_id and e.profile_id = auth.uid()
    )
  );

-- Only company-wide managers or the project's own PM may resolve one —
-- never the reporting employee, and never a different employee.
create policy worked_hours_discrepancies_update
  on public.worked_hours_discrepancies
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

create or replace function public.validate_worked_hours_discrepancy_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.worked_hours_id is distinct from old.worked_hours_id
    or new.project_id is distinct from old.project_id
    or new.employee_id is distinct from old.employee_id
    or new.reported_by is distinct from old.reported_by
    or new.comment is distinct from old.comment
    or new.created_at is distinct from old.created_at then
    raise exception 'worked hours discrepancy identity/report fields cannot be changed';
  end if;

  if old.status <> 'open' then
    raise exception 'this discrepancy has already been resolved and cannot be modified again';
  end if;

  if new.status = 'open' then
    raise exception 'resolving a discrepancy must set status to accepted or rejected';
  end if;

  return new;
end;
$$;

create trigger worked_hours_discrepancies_validate_update
  before update on public.worked_hours_discrepancies
  for each row execute function public.validate_worked_hours_discrepancy_update();

-- No DELETE policy, no DELETE grant — the discrepancy history is preserved
-- exactly as required.

-- ============================================================================
-- 4) notifications — minimal, for "Worked hours updated" and similar
--    employee-facing notices
-- ============================================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  recipient_user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link_path text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_not_blank check (btrim(type) <> ''),
  constraint notifications_title_not_blank check (btrim(title) <> '')
);

comment on table public.notifications is
  'Minimal in-app notification — currently only written by upsert_worked_hours() when it corrects an already-submitted row (type = ''worked_hours_corrected''). Surfaced on the Employee Dashboard''s "Notifications / actions required" section (app/(app)/dashboard/... — the top bar''s bell icon remains the existing disabled placeholder, out of this milestone''s scope). Hard-deletable (no DELETE grant is still withheld here deliberately, but this table carries no evidentiary weight the way audit_events/worked_hours_corrections do) — kept simple per this milestone''s "keep this dashboard simple" direction.';

create index notifications_recipient_idx on public.notifications (recipient_user_id, read_at, created_at desc);
create index notifications_company_id_idx on public.notifications (company_id);

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

grant select, insert, update on public.notifications to authenticated;

-- A user only ever sees their own notifications.
create policy notifications_select
  on public.notifications
  for select
  to authenticated
  using (recipient_user_id = auth.uid());

-- Any company-scoped manager tier may create a notification for someone in
-- the same company — not narrowed to a specific project match (these are
-- low-sensitivity informational messages, not an access-control-bearing
-- resource); the recipient's own membership is checked, not client-trusted.
create policy notifications_insert
  on public.notifications
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and public.has_any_company_role(company_id, array['company_admin', 'operations_manager', 'project_manager'])
    and exists (
      select 1 from public.company_memberships cm
      where cm.company_id = notifications.company_id and cm.user_id = notifications.recipient_user_id and cm.status = 'active'
    )
  );

-- A recipient may only mark their own notification read — nothing else is editable.
create policy notifications_update
  on public.notifications
  for update
  to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

create or replace function public.validate_notification_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.recipient_user_id is distinct from old.recipient_user_id
    or new.type is distinct from old.type
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.link_path is distinct from old.link_path
    or new.created_at is distinct from old.created_at then
    raise exception 'only marking a notification read (read_at) is allowed';
  end if;
  return new;
end;
$$;

create trigger notifications_validate_update
  before update on public.notifications
  for each row execute function public.validate_notification_update();

-- ============================================================================
-- 5) RPCs
-- ============================================================================

-- Phase D + E combined: the ONE write path for worked_hours' hours/note.
-- Create (no existing row), free draft edit (existing row, still draft),
-- or a REASONED CORRECTION (existing row, already submitted — target_reason
-- is then mandatory, and a worked_hours_corrections row plus an employee
-- notification are written in the same transaction). "Do not silently
-- overwrite submitted hours" enforced here, not merely by UI convention.
create or replace function public.upsert_worked_hours(
  target_project_id uuid,
  target_employee_id uuid,
  target_work_date date,
  target_hours numeric,
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
  v_existing public.worked_hours;
  v_result public.worked_hours;
  v_recipient_user_id uuid;
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  select * into v_existing
  from public.worked_hours
  where project_id = target_project_id and employee_id = target_employee_id and work_date = target_work_date
  for update;

  if not found then
    insert into public.worked_hours (company_id, project_id, employee_id, work_date, hours, note, created_by, updated_by)
    values (v_company_id, target_project_id, target_employee_id, target_work_date, target_hours, target_note, auth.uid(), auth.uid())
    returning * into v_result;
    return v_result;
  end if;

  if v_existing.status = 'submitted' then
    if target_reason is null or btrim(target_reason) = '' then
      raise exception 'a reason is required to correct already-submitted worked hours';
    end if;

    insert into public.worked_hours_corrections (company_id, worked_hours_id, project_id, employee_id, previous_hours, new_hours, reason, changed_by)
    values (v_company_id, v_existing.id, target_project_id, target_employee_id, v_existing.hours, target_hours, target_reason, auth.uid());

    select e.profile_id into v_recipient_user_id from public.employees e where e.id = target_employee_id;
    if v_recipient_user_id is not null then
      insert into public.notifications (company_id, recipient_user_id, type, title, body, link_path)
      values (
        v_company_id,
        v_recipient_user_id,
        'worked_hours_corrected',
        'Worked hours updated',
        format('%s: %s h -> %s h. Reason: %s', to_char(target_work_date, 'DD Mon YYYY'), v_existing.hours, target_hours, target_reason),
        '/dashboard'
      );
    end if;
  end if;

  update public.worked_hours
  set hours = target_hours, note = target_note, updated_by = auth.uid()
  where id = v_existing.id
  returning * into v_result;

  return v_result;
end;
$$;

comment on function public.upsert_worked_hours(uuid, uuid, date, numeric, text, text) is
  'The sole write path for worked_hours'' hours/note (modules/worked-hours/actions.ts). Create or free draft-edit needs no reason; correcting an already-submitted row requires one and atomically records a worked_hours_corrections row plus a "Worked hours updated" notification to the employee. RLS on worked_hours/worked_hours_corrections/notifications is the real gate (SECURITY INVOKER) — this function adds atomicity, not elevation.';

revoke all on function public.upsert_worked_hours(uuid, uuid, date, numeric, text, text) from public, anon;
grant execute on function public.upsert_worked_hours(uuid, uuid, date, numeric, text, text) to authenticated;

-- Phase D: "Apply [10.0] hours to all" — creates or updates DRAFT rows for
-- every listed employee in one call; an employee who ALREADY has
-- SUBMITTED hours for that date is silently skipped (never overwritten by
-- a bulk action — a submitted row can only be changed through
-- upsert_worked_hours()'s own reasoned-correction path, one at a time).
create or replace function public.bulk_apply_worked_hours(
  target_project_id uuid,
  target_work_date date,
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
begin
  select company_id into v_company_id from public.projects where id = target_project_id;
  if v_company_id is null then
    raise exception 'project % not found', target_project_id;
  end if;

  foreach v_employee_id in array target_employee_ids loop
    insert into public.worked_hours (company_id, project_id, employee_id, work_date, hours, created_by, updated_by)
    values (v_company_id, target_project_id, v_employee_id, target_work_date, target_hours, auth.uid(), auth.uid())
    on conflict (project_id, employee_id, work_date) do update
      set hours = excluded.hours, updated_by = auth.uid()
      where public.worked_hours.status = 'draft';
  end loop;

  return query
  select * from public.worked_hours
  where project_id = target_project_id and work_date = target_work_date and employee_id = any (target_employee_ids);
end;
$$;

comment on function public.bulk_apply_worked_hours(uuid, date, numeric, uuid[]) is
  'Phase D''s "Apply [X] hours to all" bulk action (modules/worked-hours/actions.ts) — upserts the same hours value as a DRAFT row for every listed employee; an employee who already has SUBMITTED hours for that date is left untouched (the ON CONFLICT ... WHERE status=''draft'' guard). Individual exceptions are then a normal upsert_worked_hours() call per employee.';

revoke all on function public.bulk_apply_worked_hours(uuid, date, numeric, uuid[]) from public, anon;
grant execute on function public.bulk_apply_worked_hours(uuid, date, numeric, uuid[]) to authenticated;

-- Bulk-submit every DRAFT row for a date to SUBMITTED — a deliberate,
-- separate PM action (this milestone's explicit "do not require hours to
-- be submitted at the exact moment teams are locked").
create or replace function public.submit_worked_hours(target_project_id uuid, target_work_date date)
returns setof public.worked_hours
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  return query
  update public.worked_hours
  set status = 'submitted', submitted_at = now(), submitted_by = auth.uid()
  where project_id = target_project_id and work_date = target_work_date and status = 'draft'
  returning *;
end;
$$;

comment on function public.submit_worked_hours(uuid, date) is
  'Submits every currently-draft worked_hours row for (project_id, work_date) — a deliberate, separate PM/Admin action, never automatic and never tied to Today''s Teams locking (modules/worked-hours/actions.ts).';

revoke all on function public.submit_worked_hours(uuid, date) from public, anon;
grant execute on function public.submit_worked_hours(uuid, date) to authenticated;

-- Phase E: employee-initiated report — a thin, explicit wrapper (rather
-- than a raw insert from the app) purely so the RAISED_EXCEPTION-shaped
-- error ("not found") is friendlier than a bare RLS violation when the
-- employee doesn't actually own the referenced worked_hours row.
create or replace function public.report_worked_hours_discrepancy(target_worked_hours_id uuid, target_comment text)
returns public.worked_hours_discrepancies
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_worked_hours public.worked_hours;
  v_result public.worked_hours_discrepancies;
begin
  if target_comment is null or btrim(target_comment) = '' then
    raise exception 'a comment is required to report a worked hours discrepancy';
  end if;

  select * into v_worked_hours from public.worked_hours where id = target_worked_hours_id;
  if v_worked_hours.id is null then
    raise exception 'worked hours record % not found', target_worked_hours_id;
  end if;

  insert into public.worked_hours_discrepancies (company_id, worked_hours_id, project_id, employee_id, reported_by, comment)
  values (v_worked_hours.company_id, v_worked_hours.id, v_worked_hours.project_id, v_worked_hours.employee_id, auth.uid(), target_comment)
  returning * into v_result;

  return v_result;
end;
$$;

comment on function public.report_worked_hours_discrepancy(uuid, text) is
  'Employee "[ Report discrepancy ]" action (modules/worked-hours/actions.ts). RLS''s worked_hours_discrepancies_insert policy is the real gate (reported_by must be auth.uid() and the caller must own the employee record) — SECURITY INVOKER, no elevation.';

revoke all on function public.report_worked_hours_discrepancy(uuid, text) from public, anon;
grant execute on function public.report_worked_hours_discrepancy(uuid, text) to authenticated;

-- Phase E: PM/Admin review — accept (optionally applying a corrected
-- hours value, which reuses upsert_worked_hours()'s own reasoned-
-- correction path so the resulting worked_hours_corrections row and
-- notification are identical to any other correction) or reject.
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
    perform public.upsert_worked_hours(
      v_discrepancy.project_id,
      v_discrepancy.employee_id,
      (select work_date from public.worked_hours where id = v_discrepancy.worked_hours_id),
      target_resulting_hours,
      null,
      format('Accepted discrepancy report: %s', target_resolution_note)
    );
  end if;

  update public.worked_hours_discrepancies
  set status = target_status, resolved_by = auth.uid(), resolved_at = now(), resolution_note = target_resolution_note,
      resulting_hours = case when target_status = 'accepted' then target_resulting_hours else null end
  where id = target_discrepancy_id
  returning * into v_result;

  return v_result;
end;
$$;

comment on function public.resolve_worked_hours_discrepancy(uuid, public.worked_hours_discrepancy_status, text, numeric) is
  'PM/Admin "[ accept / reject ]" review of an employee-reported discrepancy (modules/worked-hours/actions.ts). Accepting with a target_resulting_hours value applies the correction via upsert_worked_hours() itself (same audit trail/notification any other correction gets), then resolves the discrepancy row. RLS on worked_hours_discrepancies is the real write gate.';

revoke all on function public.resolve_worked_hours_discrepancy(uuid, public.worked_hours_discrepancy_status, text, numeric) from public, anon;
grant execute on function public.resolve_worked_hours_discrepancy(uuid, public.worked_hours_discrepancy_status, text, numeric) to authenticated;
