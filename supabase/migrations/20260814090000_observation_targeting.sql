-- Safety Observation targeting + type (Phase G) — an observation can
-- optionally relate to an individual employee, a specific Today's Team
-- (daily_teams row — inherently one day's instance, never dynamically
-- re-attached to a future team sharing the same name, since it references
-- the exact daily_teams.id), or nothing specific (general). Independently,
-- an observation now carries an explicit positive/negative/general
-- classification — kept separate from the existing 13-value `category`
-- enum (which stays exactly as-is, unchanged) because the two answer
-- different questions: category is WHAT was observed (housekeeping, PPE,
-- unsafe condition, ...), observation_type is the INTENT/TONE (e.g.
-- "reported unsafe condition" can itself be a POSITIVE observation of the
-- reporter's vigilance, even though its category sounds negative — this
-- milestone's own example). Negative observations may optionally record a
-- disposition (no action / coaching / corrective action / formal warning)
-- as a plain classification label only — this migration does NOT build a
-- disciplinary-warning-tracking system; "formal disciplinary warnings
-- remain a separate future/escalation concept" per this milestone's own
-- scope note.

create type public.observation_target_type as enum ('employee', 'daily_team', 'general');
create type public.observation_type as enum ('positive', 'negative', 'general');
create type public.observation_negative_disposition as enum ('no_action', 'coaching', 'corrective_action', 'formal_warning');

alter table public.safety_observations
  add column target_type public.observation_target_type not null default 'general',
  add column target_employee_id uuid,
  add column target_daily_team_id uuid,
  add column observation_type public.observation_type,
  add column disposition public.observation_negative_disposition;

-- Backfill existing rows' observation_type from their category (the
-- closest available signal for historical data — see this migration's
-- header comment on why the two are independent going forward), then lock
-- the column to NOT NULL with no further default, so every NEW observation
-- must explicitly choose one, matching `category`'s own existing
-- no-default convention.
-- A closed observation is immutable (safety_observations_validate_update()),
-- which would otherwise block backfilling this brand-new column on
-- historical closed rows — disabled for the duration of this single
-- backfill statement only, then immediately re-enabled, same pattern as
-- 20260808090000_scaffold_numbering_and_inspection_reference.sql's
-- sequence_number backfill.
alter table public.safety_observations disable trigger safety_observations_validate_update;

update public.safety_observations
set observation_type = case when category = 'positive_observation' then 'positive'::public.observation_type else 'negative'::public.observation_type end
where observation_type is null;

alter table public.safety_observations enable trigger safety_observations_validate_update;

alter table public.safety_observations alter column observation_type set not null;

alter table public.safety_observations
  add constraint safety_observations_target_employee_fk foreign key (target_employee_id, company_id) references public.employees (id, company_id),
  add constraint safety_observations_target_daily_team_fk foreign key (target_daily_team_id, company_id) references public.daily_teams (id, company_id),
  add constraint safety_observations_target_consistency check (
    (target_type = 'employee' and target_employee_id is not null and target_daily_team_id is null)
    or (target_type = 'daily_team' and target_daily_team_id is not null and target_employee_id is null)
    or (target_type = 'general' and target_employee_id is null and target_daily_team_id is null)
  ),
  add constraint safety_observations_disposition_only_when_negative check (
    disposition is null or observation_type = 'negative'
  );

comment on column public.safety_observations.target_type is
  'What (if anything) this observation specifically relates to. ''employee'' = target_employee_id, ''daily_team'' = target_daily_team_id (a SPECIFIC day''s team, never re-resolved by name — see this migration''s header comment), ''general'' = neither. Enforced by safety_observations_target_consistency below — the three columns can never disagree.';
comment on column public.safety_observations.target_daily_team_id is
  'References one specific daily_teams row (one project, one work_date, one team) — NOT the older, persistent teams table. Because a Today''s Team is already a per-day instance, pinning to its id is sufficient to "preserve which daily team/snapshot the observation referred to" without a separate members-snapshot table: if that daily_teams row is later locked, its roster is frozen exactly as Phase C already guarantees; if not yet locked, the roster may still change before lock, same as viewing any other not-yet-locked day.';
comment on column public.safety_observations.observation_type is
  'positive / negative / general — independent of `category` (see this migration''s header comment for why: category is WHAT was observed, this is the INTENT/TONE, and the two can genuinely disagree, e.g. a `category=unsafe_condition` observation can still be `observation_type=positive` when praising the person who reported it). No default — every observation must explicitly choose one, same convention as `category` itself.';
comment on column public.safety_observations.disposition is
  'For a NEGATIVE observation only (safety_observations_disposition_only_when_negative) — a plain classification label for what, if anything, followed: no_action / coaching / corrective_action / formal_warning. Purely informational; choosing corrective_action here does not itself create a corrective_actions row (that remains the existing, separate, explicit "add corrective action" flow) and choosing formal_warning does not create or track any disciplinary record — both are deliberately out of this migration''s scope, per this milestone''s own "may remain a separate future/escalation concept" note.';

-- Reader set gains one more branch: the specific employee a targeted
-- observation is ABOUT may see it, even if someone else authored it (the
-- existing `created_by = auth.uid()` branch only covers the AUTHOR, not
-- the subject) — this is what makes "My Observations" on the Employee
-- Dashboard actually show observations made ABOUT them, not only ones
-- they made themselves. Every other branch is preserved byte-for-byte
-- from the live policy (20260802120000_safety_observations_and_corrective_actions.sql).
drop policy safety_observations_select on public.safety_observations;

create policy safety_observations_select
  on public.safety_observations
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    and (
      public.has_any_company_role(company_id, array['company_admin', 'operations_manager', 'hseq_manager'])
      or (
        public.has_any_company_role(company_id, array['project_manager', 'hse_officer', 'foreman', 'inspector'])
        and public.has_project_access(project_id)
      )
      or created_by = auth.uid()
      or exists (select 1 from public.employees e where e.id = safety_observations.target_employee_id and e.profile_id = auth.uid())
    )
  );
