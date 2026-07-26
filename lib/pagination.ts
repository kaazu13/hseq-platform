/**
 * Shared server-side pagination primitives — see docs/API_CONVENTIONS.md
 * §8. Built for the employees list (Employee Management Polish milestone's
 * correction pass) but deliberately domain-agnostic: any future list that
 * needs URL-backed page/pageSize state (the recruiter/Talent Pool lists
 * documented in docs/PRODUCT_REQUIREMENTS.md §11.6, once actually built)
 * should reuse this rather than reimplementing page/pageSize parsing and
 * clamping per module. See components/shared/pagination-bar.tsx for the
 * matching UI half.
 *
 * Everything here is a pure function — no Supabase/Next.js imports — so it
 * has no server-only/client-only constraint and can be called from either.
 */

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 25;

/**
 * Never trust a URL-provided page number. Anything that isn't a positive
 * integer (missing, non-numeric, zero, negative, fractional) safely
 * defaults to 1 rather than producing a negative OFFSET or a NaN that
 * would reach the database.
 */
export function parsePageParam(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Never trust a URL-provided page size either — this is a resource-limit
 * control, not just a UX preference (see docs/DATABASE_SCHEMA.md — Employee
 * search & pagination for the matching database-side clamp in
 * search_employees()). Anything outside the fixed {25, 50, 100} allow-list
 * defaults to 25.
 */
export function parsePageSizeParam(value: string | undefined): PageSize {
  const parsed = Number(value);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed) ? (parsed as PageSize) : DEFAULT_PAGE_SIZE;
}

export function totalPagesFor(totalCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}

/** Clamps a requested page into [1, totalPages] — the server-side half of "an invalid/out-of-range page safely returns to page 1 or the last valid page." */
export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(page, 1), totalPages);
}

export function offsetFor(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}
