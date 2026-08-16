-- Post-audit implementation package, Part 7: the LMRA list ("All LMRAs"
-- mode) now always filters by (project_id, work_date range) instead of
-- fetching a project's unbounded history — the existing
-- lmra_assessments_work_date_idx is (company_id, work_date), which still
-- requires a filter step for project_id on top of the index scan. Add the
-- composite index this exact query shape actually wants.
create index lmra_assessments_project_work_date_idx on public.lmra_assessments (project_id, work_date desc);
