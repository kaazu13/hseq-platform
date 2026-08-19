-- ============================================================================
-- Scaffold Inspection Dashboard + Scaffold Map: aggregate RPCs
-- ============================================================================
-- Part AE's explicit performance requirement — ONE optimized query for
-- every active scaffold's current inspection-health data (KPIs, chart,
-- priority list, and the Map's marker payload all derive from this SAME
-- result set in TypeScript, never a second independent scan — see
-- modules/scaffolds/queries.ts's getScaffoldInspectionOverview()) instead
-- of one query per KPI or one query per scaffold. Both functions are
-- SECURITY INVOKER — the caller's own session RLS on scaffolds/
-- scaffold_inspections/employees is the real enforcement, exactly as
-- every other query in this app already relies on; the app-layer
-- canViewInspectionDashboard() permission (modules/scaffolds/permissions.ts)
-- narrows WHO reaches this RPC at all, deliberately tighter than RLS
-- alone would allow (RLS's own scaffold_inspections_select policy is
-- broader — "any project member except plain employee" — by design, the
-- same "narrower app gate on top of broader RLS floor" pattern already
-- used for the Scaffold Register/Inspections nav elsewhere in this app).
-- ============================================================================

create or replace function public.get_scaffold_inspection_overview(target_project_id uuid)
returns table (
  scaffold_id uuid,
  scaffold_number integer,
  tag_number text,
  work_area text,
  status public.scaffold_status,
  responsible_foreman_id uuid,
  responsible_foreman_first_name text,
  responsible_foreman_last_name text,
  latitude numeric,
  longitude numeric,
  latest_inspection_id uuid,
  latest_finalized_at timestamptz,
  latest_inspector_id uuid,
  latest_inspector_first_name text,
  latest_inspector_last_name text,
  latest_outcome public.scaffold_inspection_outcome,
  latest_expires_at timestamptz,
  latest_interval_type public.scaffold_inspection_interval_type,
  latest_interval_days integer
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    s.id,
    s.scaffold_number,
    s.tag_number,
    s.work_area,
    s.status,
    s.responsible_foreman_id,
    fe.first_name,
    fe.last_name,
    s.latitude,
    s.longitude,
    latest.id,
    latest.finalized_at,
    latest.inspector_id,
    ie.first_name,
    ie.last_name,
    latest.outcome,
    latest.expires_at,
    latest.interval_type_at_finalization,
    latest.interval_days_at_finalization
  from public.scaffolds s
  left join public.employees fe on fe.id = s.responsible_foreman_id
  left join lateral (
    select si.id, si.finalized_at, si.inspector_id, si.outcome, si.expires_at, si.interval_type_at_finalization, si.interval_days_at_finalization
    from public.scaffold_inspections si
    where si.scaffold_id = s.id and si.status = 'finalized' and si.superseded_by_id is null
    order by si.finalized_at desc
    limit 1
  ) as latest on true
  left join public.employees ie on ie.id = latest.inspector_id
  where s.project_id = target_project_id
  order by s.scaffold_number asc;
$$;

comment on function public.get_scaffold_inspection_overview(uuid) is
  'One row per scaffold in the project (active AND dismantled/closed — callers filter in TypeScript, since the KPI cards need both "active" and "dismantled/archived" totals from the same pass). Bounded by the project''s own scaffold count via scaffolds_project_status_idx + scaffold_inspections_scaffold_latest_idx (partial index on status=finalized/superseded_by_id is null) — NOT an unbounded/whole-table scan. Backs the Inspection Dashboard KPIs/chart/priority list AND the Scaffold Map (same result set, no second query) — see this migration''s header comment.';

revoke all on function public.get_scaffold_inspection_overview(uuid) from public, anon;
grant execute on function public.get_scaffold_inspection_overview(uuid) to authenticated;

-- ── Inspectors Today ─────────────────────────────────────────────────────
create or replace function public.get_inspectors_today(target_project_id uuid, target_work_date date)
returns table (
  employee_id uuid,
  first_name text,
  last_name text,
  attendance_status public.daily_attendance_status,
  finalized_inspections_today integer
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    e.id,
    e.first_name,
    e.last_name,
    coalesce(da.status, 'not_set'::public.daily_attendance_status),
    coalesce((
      select count(*)::integer
      from public.scaffold_inspections si
      join public.projects proj on proj.id = si.project_id
      where si.inspector_id = e.id
        and si.status = 'finalized'
        and (si.finalized_at at time zone coalesce(proj.timezone, 'UTC'))::date = target_work_date
    ), 0)
  from public.employees e
  join public.project_assignments pa on pa.employee_id = e.id and pa.project_id = target_project_id and pa.end_at is null
  join public.company_memberships cm on cm.user_id = e.profile_id and cm.company_id = e.company_id and cm.status = 'active'
  join public.membership_roles mr on mr.membership_id = cm.id
  join public.roles r on r.id = mr.role_id and r.name = 'inspector'
  left join public.daily_attendance da on da.project_id = target_project_id and da.employee_id = e.id and da.work_date = target_work_date
  where e.archived_at is null
  order by e.first_name, e.last_name;
$$;

comment on function public.get_inspectors_today(uuid, date) is
  'Active (not offboarded, active membership, currently assigned) inspector-role personnel on this project for one project-local work_date — Part M. Excludes removed/suspended/invited memberships (company_memberships.status = ''active'' only) and archived employee records. attendance_status defaults to ''not_set'' (never shown as a blank/error state) when no daily_attendance row exists for that date. finalized_inspections_today counts scaffold_inspections finalized on that PROJECT-LOCAL calendar date, not a naive UTC date. No new "inspector attendance" system — reuses the same daily_attendance table every other attendance view reads.';

revoke all on function public.get_inspectors_today(uuid, date) from public, anon;
grant execute on function public.get_inspectors_today(uuid, date) to authenticated;
