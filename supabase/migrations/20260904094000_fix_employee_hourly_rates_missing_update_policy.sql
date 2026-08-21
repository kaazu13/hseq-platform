-- Real bug found via live testing (first genuine end-to-end exercise of
-- the close-then-insert rate-change path — the original 3-period rate
-- history fixture inserted all 3 rows directly with effective_to already
-- set, so it never actually exercised this UPDATE).
--
-- 20260902110000_employee_hourly_rates.sql granted a column-level
-- `update (effective_to)` privilege but never created a matching RLS
-- UPDATE policy. RLS defaults to deny-all for a command with no policy,
-- regardless of column grants — the column grant and RLS policy are two
-- independent layers, both required. The result: EVERY attempt to close
-- a prior open rate period (setEmployeeHourlyRate(), and this task's new
-- approve_employee_rate_request()) silently updated ZERO rows (Postgres
-- does not error on a 0-row UPDATE), leaving the old row open, so the
-- immediately-following INSERT of a new current row always collided with
-- employee_hourly_rates_one_current_per_employee. In practice: the FIRST
-- rate ever set for an employee always worked (nothing to close); every
-- SUBSEQUENT rate change has always failed. Confirmed live against the
-- role-validation TEST fixture company.
create policy employee_hourly_rates_update
  on public.employee_hourly_rates
  for update
  to authenticated
  using (
    public.is_company_member(company_id)
    and (public.is_platform_super_admin() or public.has_any_company_role(company_id, array['company_admin', 'planner']))
  )
  with check (
    public.is_company_member(company_id)
    and (public.is_platform_super_admin() or public.has_any_company_role(company_id, array['company_admin', 'planner']))
  );

comment on policy employee_hourly_rates_update on public.employee_hourly_rates is
  'Same authority as employee_hourly_rates_insert (company_admin/planner/platform_super_admin) — the trigger validate_employee_hourly_rate_close() is what actually restricts WHAT may change (effective_to only, from null, never before effective_from), this policy is only the WHO gate, matching pay_rules_update''s equivalent shape.';
