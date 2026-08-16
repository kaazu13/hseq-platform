-- Post-audit implementation package, Part 4F — Scaffold completion
-- photos. Private bucket + table, same discipline as
-- lib/storage/toolbox-documents.ts's path-builder/RLS pattern: every
-- object path is server-generated (a random UUID, never a client-supplied
-- filename segment used for addressing), RLS trusts only the parsed path
-- segments, and there is no public/anon access at all — internal,
-- authenticated viewing only (unlike Toolbox Meetings/Safety Flash, this
-- has no external public-share requirement, so it never needs the
-- signed-URL-minting route those use for anonymous visitors).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scaffold-photos', 'scaffold-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table public.scaffold_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- Denormalized from the scaffold, never client-trusted — set by
  -- validate_scaffold_photo_insert() below, same convention as every
  -- other denormalized project_id in this schema.
  project_id uuid not null,
  scaffold_id uuid not null,
  storage_bucket text not null default 'scaffold-photos',
  storage_object_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  order_index integer not null default 0,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  constraint scaffold_photos_id_company_id_key unique (id, company_id),
  constraint scaffold_photos_scaffold_fk foreign key (scaffold_id, company_id) references public.scaffolds (id, company_id) on delete cascade,
  constraint scaffold_photos_storage_object_path_unique unique (storage_object_path),
  constraint scaffold_photos_original_filename_length check (char_length(original_filename) <= 255),
  constraint scaffold_photos_mime_type_allowed check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint scaffold_photos_file_size_positive check (file_size_bytes > 0 and file_size_bytes <= 10485760),
  constraint scaffold_photos_order_index_range check (order_index >= 0 and order_index < 30)
);

comment on table public.scaffold_photos is
  'Photos of the finished scaffold after erection (Part 4F) — max 30 per scaffold, enforced by validate_scaffold_photo_insert() below (a COUNT check inside a BEFORE INSERT trigger, not a CHECK constraint, since a CHECK cannot see sibling rows). No UPDATE grant — a photo is either present or removed, never edited in place, matching this schema''s "evidentiary row" convention. Deletion is allowed (unlike most HSEQ evidence tables) because these are simply photos of a physical structure, not a record of a decision/finding — removing a duplicate/blurry photo is a normal, harmless housekeeping action for whoever can edit the scaffold, not something that needs an immutable audit trail of its own.';

create index scaffold_photos_scaffold_id_idx on public.scaffold_photos (scaffold_id, order_index);
create index scaffold_photos_project_id_idx on public.scaffold_photos (project_id);

create or replace function public.validate_scaffold_photo_insert()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_scaffold public.scaffolds;
  v_existing_count integer;
begin
  select * into v_scaffold from public.scaffolds where id = new.scaffold_id;
  if v_scaffold.id is null then
    raise exception 'scaffold % not found', new.scaffold_id;
  end if;
  new.company_id := v_scaffold.company_id;
  new.project_id := v_scaffold.project_id;

  select count(*) into v_existing_count from public.scaffold_photos where scaffold_id = new.scaffold_id;
  if v_existing_count >= 30 then
    raise exception 'this scaffold already has the maximum of 30 completion photos';
  end if;

  return new;
end;
$$;

create trigger scaffold_photos_validate_insert
  before insert on public.scaffold_photos
  for each row execute function public.validate_scaffold_photo_insert();

alter table public.scaffold_photos enable row level security;
alter table public.scaffold_photos force row level security;

grant select, insert, delete on public.scaffold_photos to authenticated;

-- Same visibility tier as the scaffold itself.
create policy scaffold_photos_select
  on public.scaffold_photos
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or (public.has_project_access(project_id) and public.has_any_company_role(company_id, array['project_manager', 'hse_officer', 'foreman', 'inspector']))
    )
  );

-- Upload/delete: whoever could create/edit this scaffold, OR the
-- Foreman who is its own Responsible Foreman (so a Foreman who registered
-- a scaffold can add photos to it afterward, even though general scaffold
-- UPDATE stays with the unchanged manage tier — uploading a photo is not
-- "editing the scaffold record," it is a narrower, additive, safe action).
create or replace function public.can_manage_scaffold_photos(target_scaffold_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.scaffolds s
    where s.id = target_scaffold_id
      and (
        public.is_scaffold_manage_tier(s.company_id, s.project_id)
        or exists (select 1 from public.employees e where e.id = s.responsible_foreman_id and e.profile_id = auth.uid())
      )
  );
$$;

comment on function public.can_manage_scaffold_photos(uuid) is
  'Who may upload/remove completion photos for a scaffold: the existing scaffold manage tier (HSEQ Manager org-wide, HSE Officer/Inspector with project access), OR the scaffold''s own Responsible Foreman specifically — narrower than general scaffold edit rights, since adding photographic evidence of the finished job is a normal part of a Foreman''s own registration, not a record edit.';

revoke all on function public.can_manage_scaffold_photos(uuid) from public, anon;
grant execute on function public.can_manage_scaffold_photos(uuid) to authenticated;

create policy scaffold_photos_insert
  on public.scaffold_photos
  for insert
  to authenticated
  with check (public.is_company_member(company_id) and public.can_manage_scaffold_photos(scaffold_id));

create policy scaffold_photos_delete
  on public.scaffold_photos
  for delete
  to authenticated
  using (public.is_company_member(company_id) and public.can_manage_scaffold_photos(scaffold_id));

-- ============================================================================
-- Storage RLS — path structure {company_id}/{project_id}/{scaffold_id}/{uuid}.{ext},
-- every segment parsed and re-checked against the SAME row-level
-- authorization above (never trusting the path alone) via a lookup
-- against scaffold_photos.storage_object_path itself (the row must
-- already exist AND the caller must satisfy the same read/write
-- authorization the table's own RLS enforces) — mirrors
-- 20260803161000_toolbox_documents_storage.sql's "narrow, purpose-built
-- anon/authenticated grant, never a blanket bucket policy" discipline,
-- adapted for an authenticated-only (no anon share) bucket.
-- ============================================================================
create policy scaffold_photos_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'scaffold-photos'
    and exists (
      select 1 from public.scaffold_photos sp
      where sp.storage_object_path = storage.objects.name
        and public.is_company_member(sp.company_id)
        and (
          public.has_any_company_role(sp.company_id, array['company_admin', 'operations_manager', 'hseq_manager'])
          or (public.has_project_access(sp.project_id) and public.has_any_company_role(sp.company_id, array['project_manager', 'hse_officer', 'foreman', 'inspector']))
        )
    )
  );

create policy scaffold_photos_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'scaffold-photos'
    and public.is_company_member(nullif((storage.foldername(name))[1], '')::uuid)
  );

comment on policy scaffold_photos_storage_insert on storage.objects is
  'Upload-time check: only confirms the caller is a member of the company named in the path''s first segment (the object does not exist as a scaffold_photos row yet at upload time, so the finer-grained "can this caller manage THIS scaffold''s photos" check happens in application code before it ever calls storage.upload(), and again when the scaffold_photos row is inserted — RLS on that table is the real, narrow gate; this policy exists only so the upload call itself does not fail with a permission error for an otherwise-legitimate company member).';

create policy scaffold_photos_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'scaffold-photos'
    and exists (
      select 1 from public.scaffold_photos sp
      where sp.storage_object_path = storage.objects.name
        and public.can_manage_scaffold_photos(sp.scaffold_id)
    )
  );
