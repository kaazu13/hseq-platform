-- Employee search, filtering, and server-side pagination — see the
-- Employee Management Polish milestone's implementation report, and the
-- follow-up correction report for the wildcard-escaping and pagination
-- additions below (this migration is still unapplied, so it was corrected
-- in place rather than patched with a second migration).
--
-- Root cause of the original "john doe" bug: the previous client-side
-- search built a single PostgREST `.or()` filter across first_name/
-- last_name/employee_number/work_email with ONE search term — so a query
-- like "john doe" was tested as a single literal substring against each
-- column, and no single column contains the literal text "john doe"
-- (first_name holds "John", last_name holds "Doe", never both together).
-- Fixing this requires per-word matching, which isn't expressible as a
-- single PostgREST filter string without stacking multiple `or=` query
-- parameters in a way this project doesn't want to depend on undocumented
-- behavior for — so the search predicate moves into SQL instead.

-- ── escape_ilike_pattern ──────────────────────────────────────────────
-- User-supplied search tokens must be treated as LITERAL substrings, not
-- ILIKE wildcard syntax — searching for "%" or "_" must match a literal
-- percent/underscore character, not "almost everything"/"any single
-- character". Escapes the three characters ILIKE treats specially when an
-- explicit ESCAPE '\' clause is in effect: the escape character itself
-- first (so the % / _ escapes added next aren't themselves re-escaped),
-- then % and _.
create or replace function public.escape_ilike_pattern(input text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select replace(replace(replace(input, '\', '\\'), '%', '\%'), '_', '\_');
$$;

comment on function public.escape_ilike_pattern(text) is
  'Escapes \, %, and _ so a value can be safely embedded in an ILIKE ... ESCAPE ''\'' pattern as literal text. Order matters: backslash must be escaped first.';

revoke all on function public.escape_ilike_pattern(text) from public, anon;
grant execute on function public.escape_ilike_pattern(text) to authenticated;

-- ── employee_matches_filters ──────────────────────────────────────────
-- The shared filter predicate used by both search_employees() (paged
-- rows) and count_employees() (total count for the same filters) below,
-- so the two can never silently disagree about which rows match — the
-- classic bug where a list's "page 3 of 7" doesn't actually agree with
-- what page 3 shows. Takes a whole employees row (`e`) rather than
-- individual columns so it can be called directly against the `e` alias
-- in each caller's FROM clause.
--
-- Record-archive vs. account lifecycle (see the correction report): this
-- predicate's "is the record archived" check is `e.archived_at is null`,
-- never `e.account_status = 'archived'` — archived_at is what represents
-- whether the EMPLOYEE RECORD is archived; account_status is a separate,
-- independent account/access lifecycle value (draft / invited /
-- pending_activation / active / suspended / archived) that must stay
-- decoupled from record-archival for future invitations, linked accounts,
-- suspended access, employment history, and multi-company access.
create or replace function public.employee_matches_filters(
  e public.employees,
  search_term text,
  p_employment_status public.employment_status,
  p_account_status public.employee_account_status,
  include_archived boolean
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    (include_archived or e.archived_at is null)
    and (p_employment_status is null or e.employment_status = p_employment_status)
    and (p_account_status is null or e.account_status = p_account_status)
    and (
      search_term is null
      or btrim(search_term) = ''
      or not exists (
        -- Every whitespace-separated word in the (trimmed, whitespace-
        -- collapsed) search term must match SOMEWHERE on this row — an
        -- AND-of-ORs, so "john doe" (or "doe john" — word order doesn't
        -- matter) requires both "john" and "doe" to each match one of the
        -- four searchable columns, while a single-word search ("john",
        -- "doe", an employee number, or an email) only needs that one
        -- word to match.
        select 1
        from unnest(regexp_split_to_array(btrim(search_term), '\s+')) as tok
        where not (
          e.first_name ilike '%' || public.escape_ilike_pattern(tok) || '%' escape '\'
          or e.last_name ilike '%' || public.escape_ilike_pattern(tok) || '%' escape '\'
          or e.employee_number ilike '%' || public.escape_ilike_pattern(tok) || '%' escape '\'
          or coalesce(e.work_email, '') ilike '%' || public.escape_ilike_pattern(tok) || '%' escape '\'
        )
      )
    );
$$;

comment on function public.employee_matches_filters(public.employees, text, public.employment_status, public.employee_account_status, boolean) is
  'Shared WHERE predicate for search_employees()/count_employees() — record-archive uses archived_at, never account_status; search tokens are escaped via escape_ilike_pattern() so %/_ match literally.';

revoke all on function public.employee_matches_filters(public.employees, text, public.employment_status, public.employee_account_status, boolean) from public, anon;
grant execute on function public.employee_matches_filters(public.employees, text, public.employment_status, public.employee_account_status, boolean) to authenticated;

-- ── search_employees (paged rows) ────────────────────────────────────
-- SECURITY INVOKER (deliberately, unlike the SECURITY DEFINER RLS helper
-- functions elsewhere in this schema): this performs a plain `select`
-- against `employees`, so `employees`' own RLS policies (org isolation,
-- "own record only" for a caller with no manager/read role) apply exactly
-- as they would to any other query through this function — it only
-- encapsulates the filter/pagination logic, not a privilege change.
--
-- Returns a NARROW column set — exactly what the employee list UI renders
-- (modules/employees/components/employee-table.tsx) — rather than
-- `setof employees`, per the correction report's "don't fetch full
-- records when the list only needs selected columns" requirement.
-- Ordered deterministically by (last_name, first_name, id) — id is a
-- final stable tie-breaker so two employees who happen to share a name
-- never produce unstable/duplicated paging.
--
-- page_limit is clamped server-side to [1, 100] regardless of what's
-- passed in — defense in depth alongside the application-layer clamp in
-- lib/pagination.ts, so a caller can never request an unbounded page size
-- even by calling this RPC directly.
create or replace function public.search_employees(
  target_org_id uuid,
  search_term text default null,
  p_employment_status public.employment_status default null,
  p_account_status public.employee_account_status default null,
  include_archived boolean default false,
  page_limit integer default 25,
  page_offset integer default 0
)
returns table (
  id uuid,
  employee_number text,
  first_name text,
  last_name text,
  work_email text,
  position_title text,
  employment_status public.employment_status,
  account_status public.employee_account_status,
  profile_id uuid,
  archived_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    e.id, e.employee_number, e.first_name, e.last_name, e.work_email, e.position_title,
    e.employment_status, e.account_status, e.profile_id, e.archived_at
  from public.employees e
  where e.organization_id = target_org_id
    and public.employee_matches_filters(e, search_term, p_employment_status, p_account_status, include_archived)
  order by e.last_name, e.first_name, e.id
  limit least(greatest(coalesce(page_limit, 25), 1), 100)
  offset greatest(coalesce(page_offset, 0), 0);
$$;

comment on function public.search_employees(uuid, text, public.employment_status, public.employee_account_status, boolean, integer, integer) is
  'Server-side, RLS-scoped, paginated employee search returning only the columns the list UI needs. See count_employees() for the matching total-count query. page_limit is clamped to [1,100] regardless of caller input.';

revoke all on function public.search_employees(uuid, text, public.employment_status, public.employee_account_status, boolean, integer, integer) from public, anon;
grant execute on function public.search_employees(uuid, text, public.employment_status, public.employee_account_status, boolean, integer, integer) to authenticated;

-- ── count_employees (total for the same filters) ─────────────────────
-- Same SECURITY INVOKER/RLS reasoning as search_employees() above — a
-- plain `count(*)` over an RLS-scoped select never exposes rows the
-- caller couldn't otherwise see; it just aggregates them. Deliberately a
-- SEPARATE function/query rather than a `count(*) over()` window column
-- appended to search_employees()'s result: a windowed count only appears
-- on rows that are actually returned, so it silently disappears exactly
-- when it's needed most — an out-of-range page (e.g. requesting page 9 of
-- 3) returns zero rows, and with it, zero information about how many
-- pages actually exist. Calling this first lets the caller clamp the
-- requested page to a valid one BEFORE fetching rows, rather than fetching
-- rows for a page that doesn't exist.
create or replace function public.count_employees(
  target_org_id uuid,
  search_term text default null,
  p_employment_status public.employment_status default null,
  p_account_status public.employee_account_status default null,
  include_archived boolean default false
)
returns bigint
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select count(*)
  from public.employees e
  where e.organization_id = target_org_id
    and public.employee_matches_filters(e, search_term, p_employment_status, p_account_status, include_archived);
$$;

comment on function public.count_employees(uuid, text, public.employment_status, public.employee_account_status, boolean) is
  'Total employee count for the same filters search_employees() accepts (minus pagination) — used to compute total pages and clamp an out-of-range requested page before querying rows.';

revoke all on function public.count_employees(uuid, text, public.employment_status, public.employee_account_status, boolean) from public, anon;
grant execute on function public.count_employees(uuid, text, public.employment_status, public.employee_account_status, boolean) to authenticated;

-- ── supporting index ──────────────────────────────────────────────────
-- The default (and most common) list view filters on
-- "organization_id = X AND archived_at IS NULL" — archived_at replaces
-- account_status as the record-visibility signal (see
-- employee_matches_filters() above), and no existing index covers it
-- (employees_org_account_status_idx and employees_org_employment_status_idx,
-- from the already-applied 20260725091000_employees.sql, cover their own
-- columns but not archived_at). This index serves exactly that predicate.
create index employees_org_archived_at_idx
  on public.employees (organization_id, archived_at);
