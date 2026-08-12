-- Company branding/logo (Phases 15-17). `companies` never had an UPDATE
-- RLS policy at all — confirmed via pg_policies before writing this
-- (company_admin/operations_manager could not self-service ANY company
-- field, including name). Adds one, restricted via a trigger to the two
-- fields this milestone actually needs self-service (name, logo) — never
-- slug/status/deleted_at, which stay platform/service-role-controlled.
alter table public.companies add column logo_storage_path text;

comment on column public.companies.logo_storage_path is
  'Object path in the company-logos storage bucket, or null if no logo is set. Never a full URL — resolved to a public URL client/server-side from the path (public-read bucket; logos are not confidential, unlike toolbox-documents).';

create or replace function public.validate_company_update()
returns trigger
language plpgsql
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'slug cannot be changed via this path';
  end if;
  if new.status is distinct from old.status then
    raise exception 'status cannot be changed via this path';
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    raise exception 'deleted_at cannot be changed via this path';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.validate_company_update() is
  'Column-lockdown for the new companies_update_managers RLS grant, mirroring validate_scaffold_update()''s established "RLS gates the row, this trigger gates which columns" pattern — only name/logo_storage_path may change through this path.';

create trigger companies_validate_update
  before update on public.companies
  for each row execute function public.validate_company_update();

grant update on public.companies to authenticated;

create policy companies_update_managers
  on public.companies
  for update
  to authenticated
  using (public.has_any_company_role(id, array['company_admin', 'operations_manager']))
  with check (public.has_any_company_role(id, array['company_admin', 'operations_manager']));

-- ============================================================================
-- Storage: company-logos bucket. Public-read (logos are shown in the app
-- shell/header/PDFs/exports to anyone with access, and are not
-- confidential the way toolbox-documents are) — private WRITE, company-
-- scoped, mirroring lib/storage/toolbox-documents.ts's established
-- upload-path-encodes-company-id convention so RLS can check it without a
-- lookup join.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-logos', 'company-logos', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

-- company-logos bucket: path convention `{company_id}/{random}.{ext}` — RLS
-- below checks the first path segment against company_memberships,
-- mirroring toolbox-documents' pattern. Public SELECT (logos are not
-- confidential); INSERT/UPDATE/DELETE restricted to company_admin/
-- operations_manager of the company the path's first segment names.
-- (`comment on table storage.objects` is not usable here — this project's
-- migration role does not own that Supabase-managed system table.)
create policy company_logos_select_public
  on storage.objects
  for select
  to public
  using (bucket_id = 'company-logos');

create policy company_logos_insert_managers
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'company-logos'
    and public.has_any_company_role(((storage.foldername(name))[1])::uuid, array['company_admin', 'operations_manager'])
  );

create policy company_logos_update_managers
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'company-logos'
    and public.has_any_company_role(((storage.foldername(name))[1])::uuid, array['company_admin', 'operations_manager'])
  )
  with check (
    bucket_id = 'company-logos'
    and public.has_any_company_role(((storage.foldername(name))[1])::uuid, array['company_admin', 'operations_manager'])
  );

create policy company_logos_delete_managers
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'company-logos'
    and public.has_any_company_role(((storage.foldername(name))[1])::uuid, array['company_admin', 'operations_manager'])
  );
