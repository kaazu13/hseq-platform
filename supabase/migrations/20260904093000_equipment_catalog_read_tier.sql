-- Part 24/33 — list_equipment_items_management/count_equipment_items_management
-- (added in 20260904090000) were gated on is_equipment_manage_tier, which
-- excludes `planner`. But planner legitimately needs to READ full item
-- rows (including stock) in order to edit the catalog and adjust stock —
-- is_equipment_catalog_manage_tier already grants planner WRITE access to
-- exactly those same columns via equipment_items_update (established in
-- 20260902120000), so gating the READ path more narrowly than the WRITE
-- path it feeds was inconsistent, not a real security boundary (nothing
-- is protected by blocking a read that a subsequent write already
-- permits). Widened to the catalog tier — a strict superset of the
-- manage tier, so no existing caller loses access.
create or replace function public.list_equipment_items_management(
  target_company_id uuid,
  target_project_id uuid,
  target_item_ids uuid[] default null,
  target_search text default null,
  target_category text default null,
  target_statuses public.equipment_status[] default null,
  target_condition public.equipment_condition default null,
  target_ownership text default 'all',
  target_include_archived boolean default false,
  target_limit integer default null,
  target_offset integer default 0
)
returns setof public.equipment_items
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_equipment_catalog_manage_tier(target_company_id, target_project_id) then
    raise exception 'not authorized to view equipment management detail';
  end if;

  return query
  select ei.*
  from public.equipment_items ei
  where ei.company_id = target_company_id
    and (target_item_ids is null or ei.id = any(target_item_ids))
    and (
      (target_ownership = 'company' and ei.project_id is null)
      or (target_ownership = 'project' and ei.project_id = target_project_id)
      or (target_ownership = 'all' and (ei.project_id = target_project_id or ei.project_id is null))
    )
    and (target_include_archived or ei.archived_at is null)
    and (target_category is null or ei.category = target_category)
    and (target_statuses is null or ei.status = any(target_statuses))
    and (target_condition is null or ei.condition = target_condition)
    and (
      target_search is null or btrim(target_search) = '' or (
        ei.name ilike '%' || target_search || '%'
        or ei.category ilike '%' || target_search || '%'
        or coalesce(ei.reference_number, '') ilike '%' || target_search || '%'
        or coalesce(ei.description, '') ilike '%' || target_search || '%'
      )
    )
  order by ei.name asc
  limit target_limit offset target_offset;
end;
$$;

create or replace function public.count_equipment_items_management(
  target_company_id uuid,
  target_project_id uuid,
  target_search text default null,
  target_category text default null,
  target_statuses public.equipment_status[] default null,
  target_condition public.equipment_condition default null,
  target_ownership text default 'all',
  target_include_archived boolean default false
)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_count bigint;
begin
  if not public.is_equipment_catalog_manage_tier(target_company_id, target_project_id) then
    raise exception 'not authorized to view equipment management detail';
  end if;

  select count(*)
  into v_count
  from public.equipment_items ei
  where ei.company_id = target_company_id
    and (
      (target_ownership = 'company' and ei.project_id is null)
      or (target_ownership = 'project' and ei.project_id = target_project_id)
      or (target_ownership = 'all' and (ei.project_id = target_project_id or ei.project_id is null))
    )
    and (target_include_archived or ei.archived_at is null)
    and (target_category is null or ei.category = target_category)
    and (target_statuses is null or ei.status = any(target_statuses))
    and (target_condition is null or ei.condition = target_condition)
    and (
      target_search is null or btrim(target_search) = '' or (
        ei.name ilike '%' || target_search || '%'
        or ei.category ilike '%' || target_search || '%'
        or coalesce(ei.reference_number, '') ilike '%' || target_search || '%'
        or coalesce(ei.description, '') ilike '%' || target_search || '%'
      )
    );

  return v_count;
end;
$$;
