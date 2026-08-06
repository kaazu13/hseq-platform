-- Persistent "active project" preference — mirrors profiles.active_company_id
-- exactly (see 20260725090200_profiles.sql), so the app shell can carry a
-- current company AND current project the same way, with the same
-- UX-preference-only status: this column is never read by any RLS policy
-- or SECURITY DEFINER function, and every server-side access decision
-- keeps re-checking has_project_access()/project_assignments/
-- team_assignments live, exactly as before this migration.

alter table public.profiles
  add column active_project_id uuid references public.projects (id) on delete set null;

comment on column public.profiles.active_project_id is
  'UX preference only (which project to default into within the active company) — NOT a security boundary. Every RLS/authorization decision re-checks has_project_access()/project_assignments/team_assignments regardless of this value. Cleared to null whenever active_company_id changes (see modules/companies/actions.ts''s setActiveCompany) so a project from a previous company is never silently retained.';

create index profiles_active_project_id_idx on public.profiles (active_project_id);
