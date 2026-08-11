-- Product Integration / Daily UX milestone, Phase 11 (Input limit/security
-- audit). A platform-wide sweep found many user-writable text columns with
-- NO length bound anywhere — not in Zod (see the matching modules/*/validation.ts
-- changes in this same commit), and not in the database. Client maxlength
-- is UX only; this migration adds the database-side backstop for the
-- highest-risk, most user-writable free-text columns, mirroring
-- LMRA's already-established convention (20260816090000's
-- lmra_assessments_*_length checks) of the app-layer Zod limit and the
-- DB-layer CHECK limit being the same number, defense-in-depth rather than
-- either alone.
--
-- Every limit here was verified against current live data first (largest
-- existing value found: safety_observations.description at 66 characters,
-- well under every new bound below) — this is a pure backstop, not a
-- truncation of anything that exists today.

alter table public.companies
  add constraint companies_name_length check (char_length(name) <= 200);

alter table public.employees
  add constraint employees_first_name_length check (char_length(first_name) <= 100),
  add constraint employees_last_name_length check (char_length(last_name) <= 100);

alter table public.projects
  add constraint projects_name_length check (char_length(name) <= 200);

alter table public.scaffolds
  add constraint scaffolds_tag_number_length check (char_length(tag_number) <= 50),
  add constraint scaffolds_work_area_length check (char_length(work_area) <= 100),
  add constraint scaffolds_intended_use_length check (char_length(intended_use) <= 200),
  add constraint scaffolds_max_load_class_length check (char_length(max_load_class) <= 100),
  add constraint scaffolds_notes_length check (notes is null or char_length(notes) <= 5000);

alter table public.scaffold_inspection_items
  add constraint scaffold_inspection_items_comment_length check (char_length(comment) <= 1000),
  add constraint scaffold_inspection_items_required_corrective_action_length check (char_length(required_corrective_action) <= 1000);

alter table public.scaffold_defects
  add constraint scaffold_defects_description_length check (char_length(description) <= 2000),
  add constraint scaffold_defects_reopen_reason_length check (reopen_reason is null or char_length(reopen_reason) <= 2000);

alter table public.safety_observations
  add constraint safety_observations_work_area_length check (char_length(work_area) <= 100),
  add constraint safety_observations_description_length check (char_length(description) <= 2000);

alter table public.corrective_actions
  add constraint corrective_actions_description_length check (char_length(description) <= 2000),
  add constraint corrective_actions_reopen_reason_length check (reopen_reason is null or char_length(reopen_reason) <= 2000);

alter table public.daily_teams
  add constraint daily_teams_name_length check (char_length(name) <= 100),
  add constraint daily_teams_unlock_reason_length check (unlock_reason is null or char_length(unlock_reason) <= 2000);

alter table public.teams
  add constraint teams_name_length check (char_length(name) <= 100);

alter table public.toolbox_meetings
  add constraint toolbox_meetings_title_length check (char_length(title) <= 200);

alter table public.toolbox_templates
  add constraint toolbox_templates_title_length check (char_length(title) <= 200),
  add constraint toolbox_templates_language_length check (char_length(language) <= 50);

alter table public.safety_flashes
  add constraint safety_flashes_title_length check (char_length(title) <= 200),
  add constraint safety_flashes_language_length check (char_length(language) <= 50);
