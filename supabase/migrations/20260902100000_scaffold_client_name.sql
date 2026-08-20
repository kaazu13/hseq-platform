-- ============================================================================
-- Scaffold Client field (Part 4/36 of the operational UX package)
-- ============================================================================
-- Schema was inspected first: projects.client_name already exists
-- (20260728090000) but is PROJECT-scoped — one value per project, which
-- cannot support "different scaffolds in the same project may have
-- different clients" or a meaningful per-scaffold Client filter on the
-- Scaffold Register (both explicitly required here). So this is a new,
-- separate column, not a duplicate of an already-adequate concept — the
-- wizard still suggests the project's client_name as a starting default
-- (see scaffold-form.tsx), it just isn't the single source of truth.
--
-- Nullable at the DB level deliberately — "Client is mandatory" is an
-- APPLICATION-level rule enforced by the Zod schema for NEW creates/edits
-- going forward only (modules/scaffolds/validation.ts); existing scaffold
-- rows keep whatever they have (null), never fake-backfilled, and remain
-- fully readable/editable per Part 44's explicit forward-only rule.
-- ============================================================================

alter table public.scaffolds add column client_name text;

comment on column public.scaffolds.client_name is
  'The client/customer this scaffold''s work is for. Required by application-level validation on new creates and edits (not a DB constraint — historical rows may be null, shown as "Not set"). Independent of projects.client_name — scaffolds within one project may legitimately serve different clients.';

-- Same column-level UPDATE lockdown convention this table has followed
-- since 20260805090000 — re-issuing the full list with client_name added
-- (see 20260901124000's own comment for why this step is easy to forget).
revoke update on public.scaffolds from authenticated;
grant update (
  tag_number, work_area, structure_reference, scaffold_type, intended_use,
  max_load_class, height_metres, length_metres, width_metres, erected_by,
  responsible_foreman_id, erected_at, notes, updated_by,
  inspection_interval_type, inspection_interval_days, latitude, longitude,
  client_name
) on public.scaffolds to authenticated;
