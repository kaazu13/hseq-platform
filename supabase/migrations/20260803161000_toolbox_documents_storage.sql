-- Storage bucket + storage.objects RLS for the Toolbox Meetings / Toolbox
-- Templates / Safety Flash milestone — see
-- 20260803160000_toolbox_meetings_and_safety_flash.sql's header comment
-- for the full design rationale (bucket/path convention, why INSERT+SELECT
-- only, why replacements never overwrite). Separated into its own
-- migration only because `storage.buckets`/`storage.objects` live in a
-- different schema than the rest of this migration's DDL — same content,
-- same milestone, applied together.
--
-- Path convention (parsed via storage.foldername(name), which splits an
-- object key into its folder segments):
--   segment[1] = organization_id
--   segment[2] = 'meetings' | 'templates' | 'safety-flash'
--   segment[3] = project_id (meetings, always) | record_id (templates) |
--                project_id or literal 'org' (safety-flash)
--   segment[4] = record_id (meetings, safety-flash only)
--   filename    = <uuid>.pdf — a FRESH uuid every upload, including
--                 replacements, so no object is ever overwritten.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('toolbox-documents', 'toolbox-documents', false, 26214400, array['application/pdf'])
on conflict (id) do nothing;

-- SELECT (download/preview/signed URL generation). Scoped by
-- organization + role + project from the path alone — the primary,
-- storage-level tenant/role isolation gate. An Employee's additional
-- "active records only" restriction is enforced one layer up, at the
-- database-row/signed-URL-issuance layer (see the companion migration's
-- header comment) — Storage RLS here does not and cannot see
-- toolbox_meetings.status.
create policy toolbox_documents_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'toolbox-documents'
    and public.is_organization_member(nullif((storage.foldername(name))[1], '')::uuid)
    and (
      (
        (storage.foldername(name))[2] = 'meetings'
        and (
          public.has_any_organization_role(((storage.foldername(name))[1])::uuid, array['company_admin', 'operations_manager', 'hseq_manager'])
          or public.has_project_access(((storage.foldername(name))[3])::uuid)
        )
      )
      or (
        (storage.foldername(name))[2] = 'templates'
        and public.has_any_organization_role(((storage.foldername(name))[1])::uuid, array['company_admin', 'operations_manager', 'hseq_manager', 'hse_officer', 'project_manager', 'foreman', 'inspector'])
      )
      or (
        (storage.foldername(name))[2] = 'safety-flash'
        and (
          public.has_any_organization_role(((storage.foldername(name))[1])::uuid, array['company_admin', 'operations_manager', 'hseq_manager'])
          or (storage.foldername(name))[3] = 'org'
          or public.has_project_access(((storage.foldername(name))[3])::uuid)
        )
      )
    )
  );

-- INSERT (upload — both a fresh record's file and a controlled
-- replacement's new object). Requires the SAME manage-tier check the
-- companion migration's table-level RLS/RPCs use, applied here against
-- the path's org/project segments.
create policy toolbox_documents_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'toolbox-documents'
    and (
      (
        (storage.foldername(name))[2] = 'meetings'
        and public.is_toolbox_manage_tier(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[3])::uuid)
      )
      or (
        (storage.foldername(name))[2] = 'templates'
        and public.is_toolbox_template_manage_tier(((storage.foldername(name))[1])::uuid)
      )
      or (
        (storage.foldername(name))[2] = 'safety-flash'
        and public.is_safety_flash_manage_tier(
          ((storage.foldername(name))[1])::uuid,
          case when (storage.foldername(name))[3] = 'org' then null else ((storage.foldername(name))[3])::uuid end
        )
      )
    )
  );

-- No UPDATE, no DELETE policy for `authenticated` on this bucket —
-- deliberate. Every upload (including replacements) is a brand-new object
-- at a brand-new path; nothing ever needs to overwrite or remove an
-- existing one, which is exactly "do not silently overwrite historical
-- evidence" / "do not allow destructive deletion" enforced structurally
-- rather than by convention alone.
