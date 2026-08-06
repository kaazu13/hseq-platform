import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CompanyMembership, CompanySummary, Profile } from "./types";

/**
 * Server-only data access for the companies/memberships domain — see
 * docs/API_CONVENTIONS.md §7. Two queries instead of a single PostgREST
 * embed (`companies(...)` nested select) deliberately: this project's
 * hand-written types/database.ts (see that file's header) doesn't model
 * foreign-table relationships, so an embedded select can't be typed
 * without an unsafe cast. Two plain, fully-typed queries avoid that
 * entirely — replace with a single embedded query once real generated
 * types (with relationship metadata) are available.
 */

export type CompanyMembershipSummary = {
  membership: Pick<CompanyMembership, "id" | "status" | "joined_at">;
  company: CompanySummary;
};

/**
 * The signed-in user's ACTIVE company memberships, each paired with
 * its company. Used by the dashboard (docs/PRODUCT_REQUIREMENTS.md —
 * this milestone's minimal company-aware view). Relies on RLS
 * (company_memberships_select_own_or_active_member /
 * companies_select_active_member) as the real enforcement — the
 * explicit `.eq('user_id', ...)` / `.eq('status', 'active')` filters here
 * are for query correctness and index usage, not security; see
 * docs/API_CONVENTIONS.md §7.
 */
export async function listActiveCompaniesForUser(
  userId: string,
): Promise<CompanyMembershipSummary[]> {
  const supabase = await createClient();

  const { data: memberships, error: membershipsError } = await supabase
    .from("company_memberships")
    .select("id, status, joined_at, company_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true });

  if (membershipsError) throw membershipsError;
  if (!memberships || memberships.length === 0) return [];

  const companyIds = memberships.map((membership) => membership.company_id);

  const { data: companies, error: companiesError } = await supabase
    .from("companies")
    .select("id, name, slug, status")
    .in("id", companyIds);

  if (companiesError) throw companiesError;

  const companiesById = new Map(
    (companies ?? []).map((company) => [company.id, company]),
  );

  return memberships.reduce<CompanyMembershipSummary[]>((summaries, membership) => {
    const company = companiesById.get(membership.company_id);
    if (company) {
      summaries.push({ membership, company });
    }
    return summaries;
  }, []);
}

/**
 * The signed-in user's own profile row (full_name, active_company_id
 * preference, etc.) — used by the app shell for the welcome header and to
 * resolve which company to show as "current." Every authenticated
 * user has exactly one profile row, created automatically by the
 * `handle_new_user` trigger on signup (see
 * supabase/migrations/20260725090700_functions_and_triggers.sql), so this
 * should never return null in practice; it's typed as nullable anyway
 * because a database read is never truly guaranteed, and callers must
 * handle it rather than assume.
 *
 * Wrapped in React's `cache()` (per-request memoization only — see
 * `getCurrentUser()` in lib/auth/session.ts for the same pattern). Both the
 * app shell layout and every page it wraps call this (via
 * `resolveCurrentCompany()` below) independently; without this, each
 * authenticated page load re-ran this query twice.
 */
export const getCurrentUserProfile = cache(async (userId: string): Promise<Profile | null> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, active_company_id, user_number, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
});

export type CurrentCompanyResolution = {
  companies: CompanySummary[];
  currentCompanyId: string | null;
};

/**
 * Resolves the signed-in user's company list AND which one to treat
 * as "current" for display purposes — the same logic `app/(app)/layout.tsx`
 * used to compute inline, extracted so every page that needs "which company am
 * I looking at" (the employees pages, in addition to the layout) shares one
 * definition instead of four slightly-different copies.
 *
 * Resolution order: `profile.active_company_id` if it points at one of
 * the user's ACTIVE memberships, otherwise the first membership (by join
 * date), otherwise `null` (the zero-membership case). Purely a display/UX
 * concern — no authorization decision anywhere reads this; see
 * docs/ARCHITECTURE.md §3.2.
 *
 * Wrapped in React's `cache()` (per-request memoization only). Both
 * `app/(app)/layout.tsx` and every page it wraps call this independently —
 * without this, each authenticated page load ran its 3-query chain
 * (`listActiveCompaniesForUser`'s 2 queries + `getCurrentUserProfile`'s
 * 1) twice.
 */
export const resolveCurrentCompany = cache(async (userId: string): Promise<CurrentCompanyResolution> => {
  const [memberships, profile] = await Promise.all([
    listActiveCompaniesForUser(userId),
    getCurrentUserProfile(userId),
  ]);

  const companies = memberships.map((membership) => membership.company);
  const currentCompanyId =
    (profile?.active_company_id &&
      companies.some((company) => company.id === profile.active_company_id) &&
      profile.active_company_id) ||
    companies[0]?.id ||
    null;

  return { companies, currentCompanyId };
});

/**
 * Count of ACTIVE members in an company — real, live data (unlike
 * most of the dashboard's other stat cards, which are placeholders for
 * modules that don't exist yet). Relies on the same
 * `company_memberships_select_own_or_active_member` RLS policy as
 * `listActiveCompaniesForUser`: only callable meaningfully for an
 * company the caller is themselves an active member of, which is the
 * only case the dashboard ever calls it for.
 */
export async function countActiveMembers(companyId: string): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("company_memberships")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "active");

  if (error) throw error;
  return count ?? 0;
}
