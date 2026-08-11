-- Report/PDF export + secure external sharing — a shared architecture
-- reused across LMRA, Scaffold Inspection, Safety Observation, Corrective
-- Action, Toolbox Meeting, and Safety Flash rather than six bespoke
-- systems. Toolbox Meeting/Safety Flash are already document-based
-- evidence records (one uploaded PDF, no structured content) — for those
-- two, "sharing" resolves to the SAME already-uploaded file rather than
-- generating a new PDF; for the other four, sharing resolves to a
-- server-built read-only projection of the record's own data.
--
-- Security model: report_shares is never directly readable by anon — the
-- ONLY anonymous entry point is resolve_public_report(token), a single
-- SECURITY DEFINER function that hashes the presented token, validates it
-- (not revoked, not expired), and returns a narrow, purpose-built JSONB
-- projection. No other anon grant exists anywhere in this migration
-- (docs/ARCHITECTURE.md §7: the service-role key is never used from a
-- request path reachable by a regular/anonymous request — every anon
-- capability here is expressed as ordinary Postgres RLS/grants instead).

-- ============================================================================
-- 1) report_shares
-- ============================================================================
create type public.report_record_type as enum (
  'lmra',
  'scaffold_inspection',
  'safety_observation',
  'corrective_action',
  'toolbox_meeting',
  'safety_flash'
);

create table public.report_shares (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid,
  record_type public.report_record_type not null,
  lmra_assessment_id uuid references public.lmra_assessments (id) on delete cascade,
  scaffold_inspection_id uuid references public.scaffold_inspections (id) on delete cascade,
  safety_observation_id uuid references public.safety_observations (id) on delete cascade,
  corrective_action_id uuid references public.corrective_actions (id) on delete cascade,
  toolbox_meeting_id uuid references public.toolbox_meetings (id) on delete cascade,
  safety_flash_id uuid references public.safety_flashes (id) on delete cascade,
  -- Only the SHA-256 hash is stored — same "print once, never persisted"
  -- discipline this codebase already uses for seeded test-account
  -- passwords (scripts/seed-test-company.ts), applied to a bearer token
  -- that may live for up to 30 days or indefinitely. The plaintext token
  -- is returned to the caller exactly once, at creation, and is
  -- unrecoverable from the database afterward.
  token_hash text not null unique,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  last_viewed_at timestamptz,
  view_count integer not null default 0,
  constraint report_shares_view_count_not_negative check (view_count >= 0),
  constraint report_shares_revoked_fields_paired check ((revoked_at is null) = (revoked_by is null)),
  -- Exactly one of the six per-type FKs is set, and it must match record_type
  -- — a polymorphic reference expressed as real, individually FK-enforced
  -- columns (never a dangling untyped uuid) rather than a single loosely-
  -- typed "record_id" column, matching this codebase's consistent
  -- preference for FK-backed integrity over loosely-typed references.
  constraint report_shares_exactly_one_record check (
    (
      (case when lmra_assessment_id is not null then 1 else 0 end) +
      (case when scaffold_inspection_id is not null then 1 else 0 end) +
      (case when safety_observation_id is not null then 1 else 0 end) +
      (case when corrective_action_id is not null then 1 else 0 end) +
      (case when toolbox_meeting_id is not null then 1 else 0 end) +
      (case when safety_flash_id is not null then 1 else 0 end)
    ) = 1
  ),
  constraint report_shares_record_type_matches check (
    (record_type = 'lmra' and lmra_assessment_id is not null)
    or (record_type = 'scaffold_inspection' and scaffold_inspection_id is not null)
    or (record_type = 'safety_observation' and safety_observation_id is not null)
    or (record_type = 'corrective_action' and corrective_action_id is not null)
    or (record_type = 'toolbox_meeting' and toolbox_meeting_id is not null)
    or (record_type = 'safety_flash' and safety_flash_id is not null)
  )
);

comment on table public.report_shares is
  'A secure, read-only external share link for one specific record (LMRA/Scaffold Inspection/Safety Observation/Corrective Action/Toolbox Meeting/Safety Flash). The token itself — never company/project membership — grants access to the ONE record it was created for; see resolve_public_report(text) for the only way it is ever resolved.';
comment on column public.report_shares.token_hash is
  'sha256(token), hex-encoded. The plaintext token is generated by create_report_share() and returned to the caller exactly once — it is never stored anywhere, including here.';

create index report_shares_company_id_idx on public.report_shares (company_id);
create index report_shares_lmra_idx on public.report_shares (lmra_assessment_id) where lmra_assessment_id is not null;
create index report_shares_scaffold_inspection_idx on public.report_shares (scaffold_inspection_id) where scaffold_inspection_id is not null;
create index report_shares_safety_observation_idx on public.report_shares (safety_observation_id) where safety_observation_id is not null;
create index report_shares_corrective_action_idx on public.report_shares (corrective_action_id) where corrective_action_id is not null;
create index report_shares_toolbox_meeting_idx on public.report_shares (toolbox_meeting_id) where toolbox_meeting_id is not null;
create index report_shares_safety_flash_idx on public.report_shares (safety_flash_id) where safety_flash_id is not null;

-- Only revoked_at/revoked_by/last_viewed_at/view_count may ever change post-
-- creation — every other column is a permanent identity/creation fact.
-- last_viewed_at/view_count are written exclusively by
-- resolve_public_report() below (SECURITY DEFINER, bypasses this table's
-- normal RLS but NOT this trigger — the trigger is identity protection,
-- not an access-control gate).
create or replace function public.validate_report_share_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.project_id is distinct from old.project_id
    or new.record_type is distinct from old.record_type
    or new.lmra_assessment_id is distinct from old.lmra_assessment_id
    or new.scaffold_inspection_id is distinct from old.scaffold_inspection_id
    or new.safety_observation_id is distinct from old.safety_observation_id
    or new.corrective_action_id is distinct from old.corrective_action_id
    or new.toolbox_meeting_id is distinct from old.toolbox_meeting_id
    or new.safety_flash_id is distinct from old.safety_flash_id
    or new.token_hash is distinct from old.token_hash
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.expires_at is distinct from old.expires_at then
    raise exception 'report share identity/creation fields cannot be changed';
  end if;

  if new.revoked_at is distinct from old.revoked_at and old.revoked_at is not null then
    raise exception 'this report share has already been revoked';
  end if;

  return new;
end;
$$;

create trigger report_shares_validate_update
  before update on public.report_shares
  for each row execute function public.validate_report_share_update();

alter table public.report_shares enable row level security;
alter table public.report_shares force row level security;

-- No DELETE grant — a share is revoked in place, never removed (same
-- "HSEQ evidence, never hard-deleted" convention as every other table in
-- this schema; the audit trail of who could once access what is itself
-- worth keeping).
grant select, insert, update on public.report_shares to authenticated;

-- One combined condition, reused identically by SELECT/INSERT/UPDATE below:
-- the caller must be able to MANAGE the specific underlying record — the
-- exact same condition each record table's own UPDATE policy already uses
-- (confirmed directly against the live policies before writing this), so
-- "who can share" always tracks "who can edit," never drifts from it.
create or replace function public.can_manage_report_share_target(
  target_record_type public.report_record_type,
  target_lmra_assessment_id uuid,
  target_scaffold_inspection_id uuid,
  target_safety_observation_id uuid,
  target_corrective_action_id uuid,
  target_toolbox_meeting_id uuid,
  target_safety_flash_id uuid
)
returns boolean
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if target_record_type = 'lmra' then
    return exists (
      select 1 from public.lmra_assessments a
      where a.id = target_lmra_assessment_id
        and (
          public.has_company_role(a.company_id, 'hseq_manager')
          or public.is_project_foreman(a.project_id)
          or public.is_own_lmra_assessment(a.id)
        )
    );
  elsif target_record_type = 'scaffold_inspection' then
    return exists (
      select 1 from public.scaffold_inspections si
      where si.id = target_scaffold_inspection_id
        and public.is_scaffold_manage_tier(si.company_id, si.project_id)
    );
  elsif target_record_type = 'safety_observation' then
    return exists (
      select 1 from public.safety_observations o
      where o.id = target_safety_observation_id
        and (
          public.has_company_role(o.company_id, 'hseq_manager')
          or (
            public.has_any_company_role(o.company_id, array['hse_officer', 'foreman', 'inspector', 'employee'])
            and public.has_project_access(o.project_id)
            and o.created_by = auth.uid()
          )
        )
    );
  elsif target_record_type = 'corrective_action' then
    return exists (
      select 1 from public.corrective_actions ca
      where ca.id = target_corrective_action_id
        and (
          public.has_company_role(ca.company_id, 'hseq_manager')
          or public.is_project_manager(ca.project_id)
          or (public.has_any_company_role(ca.company_id, array['hse_officer', 'foreman', 'inspector']) and public.has_project_access(ca.project_id))
          or exists (select 1 from public.employees e where e.id = ca.responsible_person_id and e.profile_id = auth.uid())
        )
    );
  elsif target_record_type = 'toolbox_meeting' then
    return exists (
      select 1 from public.toolbox_meetings tm
      where tm.id = target_toolbox_meeting_id
        and public.is_toolbox_manage_tier(tm.company_id, tm.project_id)
    );
  elsif target_record_type = 'safety_flash' then
    return exists (
      select 1 from public.safety_flashes sf
      where sf.id = target_safety_flash_id
        and public.is_safety_flash_manage_tier(sf.company_id, sf.project_id)
    );
  end if;
  return false;
end;
$$;

comment on function public.can_manage_report_share_target(public.report_record_type, uuid, uuid, uuid, uuid, uuid, uuid) is
  'True if the calling user can manage (and therefore share) the one record identified by whichever target_*_id matches target_record_type. Mirrors each record table''s own UPDATE policy exactly — sharing never grants broader reach than editing already does.';

create policy report_shares_select
  on public.report_shares
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and public.can_manage_report_share_target(record_type, lmra_assessment_id, scaffold_inspection_id, safety_observation_id, corrective_action_id, toolbox_meeting_id, safety_flash_id)
  );

create policy report_shares_insert
  on public.report_shares
  for insert
  to authenticated
  with check (
    public.is_company_member(company_id)
    and created_by = auth.uid()
    and public.can_manage_report_share_target(record_type, lmra_assessment_id, scaffold_inspection_id, safety_observation_id, corrective_action_id, toolbox_meeting_id, safety_flash_id)
  );

create policy report_shares_update
  on public.report_shares
  for update
  to authenticated
  using (
    public.is_company_member(company_id)
    and public.can_manage_report_share_target(record_type, lmra_assessment_id, scaffold_inspection_id, safety_observation_id, corrective_action_id, toolbox_meeting_id, safety_flash_id)
  )
  with check (
    public.is_company_member(company_id)
    and public.can_manage_report_share_target(record_type, lmra_assessment_id, scaffold_inspection_id, safety_observation_id, corrective_action_id, toolbox_meeting_id, safety_flash_id)
  );

-- ============================================================================
-- 2) create_report_share / revoke_report_share — the internal, authenticated
--    lifecycle. SECURITY INVOKER: RLS above is the real gate.
-- ============================================================================
create or replace function public.create_report_share(
  target_company_id uuid,
  target_project_id uuid,
  target_record_type public.report_record_type,
  target_record_id uuid,
  target_expires_at timestamptz default null
)
returns table (id uuid, token text, expires_at timestamptz, created_at timestamptz)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_token text;
  v_token_hash text;
  v_share_id uuid;
  v_created_at timestamptz;
begin
  if target_expires_at is not null and target_expires_at <= now() then
    raise exception 'expires_at must be in the future';
  end if;

  -- 32 random bytes (256 bits), URL-safe base64 — cryptographically strong
  -- and never derived from or exposing the record's own sequential id.
  v_token := replace(replace(replace(encode(gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'), '=', '');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  insert into public.report_shares (
    company_id, project_id, record_type,
    lmra_assessment_id, scaffold_inspection_id, safety_observation_id, corrective_action_id, toolbox_meeting_id, safety_flash_id,
    token_hash, created_by, expires_at
  ) values (
    target_company_id, target_project_id, target_record_type,
    case when target_record_type = 'lmra' then target_record_id end,
    case when target_record_type = 'scaffold_inspection' then target_record_id end,
    case when target_record_type = 'safety_observation' then target_record_id end,
    case when target_record_type = 'corrective_action' then target_record_id end,
    case when target_record_type = 'toolbox_meeting' then target_record_id end,
    case when target_record_type = 'safety_flash' then target_record_id end,
    v_token_hash, auth.uid(), target_expires_at
  )
  returning report_shares.id, report_shares.created_at into v_share_id, v_created_at;

  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, changes)
  values (target_company_id, auth.uid(), 'create', 'report_share', v_share_id, jsonb_build_object('record_type', target_record_type, 'record_id', target_record_id, 'expires_at', target_expires_at));

  return query select v_share_id, v_token, target_expires_at, v_created_at;
end;
$$;

comment on function public.create_report_share(uuid, uuid, public.report_record_type, uuid, timestamptz) is
  'Creates a new external share link and returns its plaintext token EXACTLY ONCE (modules/reports/actions.ts) — the token is never stored, only its sha256 hash. RLS''s report_shares_insert policy is the real gate.';

revoke all on function public.create_report_share(uuid, uuid, public.report_record_type, uuid, timestamptz) from public, anon;
grant execute on function public.create_report_share(uuid, uuid, public.report_record_type, uuid, timestamptz) to authenticated;

create or replace function public.revoke_report_share(target_share_id uuid)
returns public.report_shares
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_result public.report_shares;
  v_company_id uuid;
begin
  update public.report_shares
  set revoked_at = now(), revoked_by = auth.uid()
  where id = target_share_id and revoked_at is null
  returning * into v_result;

  if v_result.id is null then
    raise exception 'report share % not found, or already revoked', target_share_id;
  end if;

  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, changes)
  values (v_result.company_id, auth.uid(), 'update', 'report_share', v_result.id, jsonb_build_object('action', 'revoked'));

  v_company_id := v_result.company_id;
  return v_result;
end;
$$;

comment on function public.revoke_report_share(uuid) is
  'Revokes an active share link (modules/reports/actions.ts). RLS''s report_shares_update policy is the real gate — same manage-tier condition as creating one.';

revoke all on function public.revoke_report_share(uuid) from public, anon;
grant execute on function public.revoke_report_share(uuid) to authenticated;

-- ============================================================================
-- 3) resolve_public_report — the ONLY anonymous entry point
-- ============================================================================
-- SECURITY DEFINER, granted to BOTH anon and authenticated (a share link
-- may be opened by a browser that happens to have an unrelated logged-in
-- session too — the token's validity is the sole authorization test,
-- independent of who, if anyone, is signed in). Returns null for any
-- invalid/revoked/expired/malformed token — deliberately indistinguishable
-- from "token not found" in every case, so a public caller can never learn
-- WHY a token failed (still active but wrong record? revoked? expired?
-- never existed?) — see modules/reports/public-queries.ts's caller, which
-- renders one single generic "unavailable" state for every null result.
create or replace function public.resolve_public_report(target_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token_hash text;
  v_share public.report_shares;
  v_company jsonb;
  v_project jsonb;
  v_record jsonb;
begin
  if target_token is null or btrim(target_token) = '' or length(target_token) > 200 then
    return null;
  end if;

  v_token_hash := encode(digest(target_token, 'sha256'), 'hex');

  select * into v_share from public.report_shares where token_hash = v_token_hash;
  if v_share.id is null then
    return null;
  end if;
  if v_share.revoked_at is not null then
    return null;
  end if;
  if v_share.expires_at is not null and v_share.expires_at <= now() then
    return null;
  end if;

  update public.report_shares
  set last_viewed_at = now(), view_count = view_count + 1
  where id = v_share.id;

  select jsonb_build_object('id', c.id, 'name', c.name) into v_company from public.companies c where c.id = v_share.company_id;
  if v_share.project_id is not null then
    select jsonb_build_object('id', p.id, 'name', p.name) into v_project from public.projects p where p.id = v_share.project_id;
  end if;

  if v_share.record_type = 'lmra' then
    select jsonb_build_object(
      'id', a.id,
      'work_area', a.work_area,
      'work_activity', a.work_activity,
      'work_date', a.work_date,
      'shift', a.shift,
      'status', a.status,
      'result', a.result,
      'stop_work_reason', a.stop_work_reason,
      'notes', a.notes,
      'created_at', a.created_at,
      'updated_at', a.updated_at,
      'submitted_at', a.submitted_at,
      'reviewed_at', a.reviewed_at,
      'completed_by', jsonb_build_object('first_name', ce.first_name, 'last_name', ce.last_name),
      'responsible_person', case when re.id is not null then jsonb_build_object('first_name', re.first_name, 'last_name', re.last_name) else null end,
      'participants', coalesce((
        select jsonb_agg(jsonb_build_object('first_name', pe.first_name, 'last_name', pe.last_name) order by pe.last_name, pe.first_name)
        from public.lmra_participants p join public.employees pe on pe.id = p.employee_id where p.lmra_assessment_id = a.id
      ), '[]'::jsonb),
      'hazards', coalesce((
        select jsonb_agg(jsonb_build_object(
          'hazard_type', h.hazard_type,
          'is_applicable', h.is_applicable,
          'selected_controls', h.selected_controls,
          'controls', h.controls,
          'controls_confirmed', h.controls_confirmed,
          'other_description', h.other_description,
          'responsible_person', case when hre.id is not null then jsonb_build_object('first_name', hre.first_name, 'last_name', hre.last_name) else null end
        ) order by h.hazard_type)
        from public.lmra_hazards h left join public.employees hre on hre.id = h.responsible_person_id where h.lmra_assessment_id = a.id
      ), '[]'::jsonb)
    ) into v_record
    from public.lmra_assessments a
    join public.employees ce on ce.id = a.completed_by_employee_id
    left join public.employees re on re.id = a.responsible_person_id
    where a.id = v_share.lmra_assessment_id;

  elsif v_share.record_type = 'scaffold_inspection' then
    select jsonb_build_object(
      'id', si.id,
      'scaffold_number', s.scaffold_number,
      'sequence_number', si.sequence_number,
      'tag_number', s.tag_number,
      'work_area', s.work_area,
      'scaffold_type', s.scaffold_type,
      'inspected_at', si.inspected_at,
      'reason', si.inspection_reason,
      'status', si.status,
      'outcome', si.outcome,
      'expires_at', si.expires_at,
      'notes', si.notes,
      'voided_at', si.voided_at,
      'void_reason', si.void_reason,
      'inspector', case when ie.id is not null then jsonb_build_object('first_name', ie.first_name, 'last_name', ie.last_name) else null end,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'item_type', it.item_type,
          'result', it.result,
          'comment', it.comment,
          'required_corrective_action', it.required_corrective_action,
          'severity', it.severity
        ) order by it.item_type)
        from public.scaffold_inspection_items it where it.scaffold_inspection_id = si.id
      ), '[]'::jsonb)
    ) into v_record
    from public.scaffold_inspections si
    join public.scaffolds s on s.id = si.scaffold_id
    left join public.employees ie on ie.id = si.inspector_id
    where si.id = v_share.scaffold_inspection_id;

  elsif v_share.record_type = 'safety_observation' then
    select jsonb_build_object(
      'id', o.id,
      'work_area', o.work_area,
      'observed_at', o.observed_at,
      'category', o.category,
      'observation_type', o.observation_type,
      'description', o.description,
      'immediate_action_taken', o.immediate_action_taken,
      'risk_level', o.risk_level,
      'is_stop_work', o.is_stop_work,
      'status', o.status,
      'disposition', o.disposition,
      'observer', case when oe.id is not null then jsonb_build_object('first_name', oe.first_name, 'last_name', oe.last_name) else null end,
      'participants', coalesce((
        select jsonb_agg(jsonb_build_object('first_name', pe.first_name, 'last_name', pe.last_name) order by pe.last_name, pe.first_name)
        from public.safety_observation_participants p join public.employees pe on pe.id = p.employee_id where p.observation_id = o.id
      ), '[]'::jsonb),
      'corrective_actions', coalesce((
        select jsonb_agg(jsonb_build_object('description', ca.description, 'status', ca.status, 'priority', ca.priority, 'due_date', ca.due_date) order by ca.created_at)
        from public.corrective_actions ca where ca.observation_id = o.id
      ), '[]'::jsonb)
    ) into v_record
    from public.safety_observations o
    left join public.employees oe on oe.id = o.observer_id
    where o.id = v_share.safety_observation_id;

  elsif v_share.record_type = 'corrective_action' then
    select jsonb_build_object(
      'id', ca.id,
      'description', ca.description,
      'priority', ca.priority,
      'due_date', ca.due_date,
      'status', ca.status,
      'reviewed_at', ca.reviewed_at,
      'completion_notes', ca.completion_notes,
      'closure_evidence', ca.closure_evidence,
      'created_at', ca.created_at,
      'responsible_person', case when re.id is not null then jsonb_build_object('first_name', re.first_name, 'last_name', re.last_name) else null end,
      'observation', jsonb_build_object('work_area', o.work_area, 'description', o.description, 'observed_at', o.observed_at)
    ) into v_record
    from public.corrective_actions ca
    left join public.employees re on re.id = ca.responsible_person_id
    join public.safety_observations o on o.id = ca.observation_id
    where ca.id = v_share.corrective_action_id;

  elsif v_share.record_type = 'toolbox_meeting' then
    select jsonb_build_object(
      'id', tm.id,
      'meeting_number', tm.meeting_number,
      'title', tm.title,
      'meeting_date', tm.meeting_date,
      'work_area', tm.work_area,
      'status', tm.status,
      'notes', tm.notes,
      'held_by', case when he.id is not null then jsonb_build_object('first_name', he.first_name, 'last_name', he.last_name) else null end,
      'storage_bucket', tm.storage_bucket,
      'storage_object_path', tm.storage_object_path,
      'original_filename', tm.original_filename
    ) into v_record
    from public.toolbox_meetings tm
    left join public.employees he on he.id = tm.held_by_employee_id
    where tm.id = v_share.toolbox_meeting_id;

  elsif v_share.record_type = 'safety_flash' then
    select jsonb_build_object(
      'id', sf.id,
      'flash_number', sf.flash_number,
      'title', sf.title,
      'date_issued', sf.date_issued,
      'category', sf.category,
      'summary', sf.summary,
      'status', sf.status,
      'issued_by', case when ie.id is not null then jsonb_build_object('first_name', ie.first_name, 'last_name', ie.last_name) else null end,
      'storage_bucket', sf.storage_bucket,
      'storage_object_path', sf.storage_object_path,
      'original_filename', sf.original_filename
    ) into v_record
    from public.safety_flashes sf
    left join public.employees ie on ie.id = sf.issued_by_employee_id
    where sf.id = v_share.safety_flash_id;
  end if;

  if v_record is null then
    return null;
  end if;

  return jsonb_build_object(
    'share', jsonb_build_object('id', v_share.id, 'record_type', v_share.record_type, 'created_at', v_share.created_at, 'expires_at', v_share.expires_at),
    'company', v_company,
    'project', v_project,
    'record', v_record
  );
end;
$$;

comment on function public.resolve_public_report(text) is
  'The ONLY public/anonymous entry point into shared report data (app/share/[token]/page.tsx). Validates the token (hash match, not revoked, not expired), records the view, and returns a narrow, purpose-built JSONB projection for the ONE record the token grants access to — never a broader query surface. Returns null uniformly for every failure mode (unknown/malformed/revoked/expired token) so a public caller can never distinguish why access failed.';

revoke all on function public.resolve_public_report(text) from public;
grant execute on function public.resolve_public_report(text) to anon, authenticated;

-- ============================================================================
-- 4) Storage passthrough for the two document-based record types —
--    narrow anon SELECT on the existing toolbox-documents bucket, gated by
--    a valid, non-revoked, non-expired report_shares row for that exact
--    object path. SECURITY DEFINER because it's evaluated FROM WITHIN a
--    storage.objects RLS policy — a SECURITY INVOKER version would need
--    anon to already have SELECT on report_shares directly, which is
--    exactly what this avoids.
-- ============================================================================
create or replace function public.has_valid_toolbox_document_share(target_object_path text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.report_shares rs
    left join public.toolbox_meetings tm on tm.id = rs.toolbox_meeting_id
    left join public.safety_flashes sf on sf.id = rs.safety_flash_id
    where rs.revoked_at is null
      and (rs.expires_at is null or rs.expires_at > now())
      and (
        (rs.record_type = 'toolbox_meeting' and tm.storage_object_path = target_object_path)
        or (rs.record_type = 'safety_flash' and sf.storage_object_path = target_object_path)
      )
  );
$$;

comment on function public.has_valid_toolbox_document_share(text) is
  'True if target_object_path (a storage.objects.name in the toolbox-documents bucket) belongs to a toolbox_meetings/safety_flashes row currently covered by an active (non-revoked, non-expired) report_shares row — backs the anon storage SELECT policy below, the ONLY way an anonymous share visitor can read the underlying PDF.';

revoke all on function public.has_valid_toolbox_document_share(text) from public;
grant execute on function public.has_valid_toolbox_document_share(text) to anon, authenticated;

create policy toolbox_documents_select_via_share
  on storage.objects
  for select
  to anon
  using (bucket_id = 'toolbox-documents' and public.has_valid_toolbox_document_share(name));
