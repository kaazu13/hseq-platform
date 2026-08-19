-- ============================================================================
-- Fix: scaffolds column-level UPDATE grant never included the new
-- inspection-frequency/location columns
-- ============================================================================
-- scaffolds.status is locked via a column-level GRANT (not a table-level
-- one) — see 20260805090000_scaffold_team_and_dimensions.sql's own
-- "column-level lockdown" comment. Because that grant explicitly lists
-- allowed columns, ADDING new columns in 20260901120000 (inspection_
-- interval_type/inspection_interval_days/latitude/longitude) did NOT
-- automatically make them writable — discovered live when the role-
-- validation fixture seed failed with "permission denied for table
-- scaffolds" while self-healing these exact columns. Re-issuing the grant
-- with the new columns added restores writability without touching the
-- status lockdown.
-- ============================================================================
revoke update on public.scaffolds from authenticated;
grant update (
  tag_number, work_area, structure_reference, scaffold_type, intended_use,
  max_load_class, height_metres, length_metres, width_metres, erected_by,
  responsible_foreman_id, erected_at, notes, updated_by,
  inspection_interval_type, inspection_interval_days, latitude, longitude
) on public.scaffolds to authenticated;
