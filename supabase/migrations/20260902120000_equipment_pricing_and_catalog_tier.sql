-- ============================================================================
-- Equipment V3: pricing + planner catalog/pricing authority (Parts 26/29/33)
-- ============================================================================
-- Schema inspected first: equipment_items already separates serialized vs
-- quantity tracking (tracking_mode), already carries quantity/
-- available_quantity as the stock model, and equipment_history is already
-- the stock-movement/audit trail — none of that is rebuilt here. What is
-- genuinely missing per the spec: a price, and a way for `planner` to
-- manage catalog/pricing WITHOUT gaining the full equipment_manage_tier
-- (which also covers issuing/returning/approving requests — deliberately
-- kept OUT of planner's grant per Part 33's "do not silently grant
-- unrelated workforce administration").
-- ============================================================================

alter table public.equipment_items add column unit_price numeric(10, 2);
alter table public.equipment_items add column currency text not null default 'EUR';

alter table public.equipment_items add constraint equipment_items_unit_price_non_negative check (unit_price is null or unit_price >= 0);

comment on column public.equipment_items.unit_price is
  'Nullable — pricing is being introduced after this table already had live data (Part 44: "Equipment pricing: nullable initially"). A null price displays as "no price" in the UI, never €0.';

-- New history event for stock quantity adjustments (Part 27) — additive,
-- existing event values are untouched.
alter type public.equipment_history_event add value if not exists 'stock_adjusted';

-- Narrower authority than is_equipment_manage_tier: everyone that function
-- already covers, PLUS `planner`, but used ONLY for the equipment_items
-- catalog table (name/category/price/stock) — never for
-- equipment_assignments/equipment_requests (issuing, returning, approving),
-- which stay on the unchanged, planner-EXCLUDING is_equipment_manage_tier.
create or replace function public.is_equipment_catalog_manage_tier(target_company_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    public.is_equipment_manage_tier(target_company_id, target_project_id)
    or public.has_company_role(target_company_id, 'planner');
$$;

comment on function public.is_equipment_catalog_manage_tier(uuid, uuid) is
  'Part 33: planner may manage the equipment CATALOG (create/edit items, set pricing, adjust stock) but must never gain issue/return/request-approval authority — those stay on is_equipment_manage_tier alone. Used only by equipment_items_insert/_update.';

drop policy equipment_items_insert on public.equipment_items;
create policy equipment_items_insert
  on public.equipment_items
  for insert
  to authenticated
  with check (public.is_company_member(company_id) and public.is_equipment_catalog_manage_tier(company_id, project_id));

drop policy equipment_items_update on public.equipment_items;
create policy equipment_items_update
  on public.equipment_items
  for update
  to authenticated
  using (public.is_company_member(company_id) and public.is_equipment_catalog_manage_tier(company_id, project_id))
  with check (public.is_company_member(company_id) and public.is_equipment_catalog_manage_tier(company_id, project_id));

-- unit_price/currency need to be reachable by the same column-level grant
-- shape as every other equipment_items column (this table has always used
-- a table-level UPDATE grant, not column-level — confirmed via
-- information_schema — so no grant re-issue is needed here, unlike
-- scaffolds' column-level lockdown).
