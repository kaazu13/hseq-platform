import { createClient } from "@/lib/supabase/server";
import type { Organization, OrganizationMembership } from "./types";

/**
 * Server-only data access for the organizations/memberships domain — see
 * docs/API_CONVENTIONS.md §7. Two queries instead of a single PostgREST
 * embed (`organizations(...)` nested select) deliberately: this project's
 * hand-written types/database.ts (see that file's header) doesn't model
 * foreign-table relationships, so an embedded select can't be typed
 * without an unsafe cast. Two plain, fully-typed queries avoid that
 * entirely — replace with a single embedded query once real generated
 * types (with relationship metadata) are available.
 */

export type OrganizationMembershipSummary = {
  membership: Pick<OrganizationMembership, "id" | "status" | "joined_at">;
  organization: Pick<Organization, "id" | "name" | "slug" | "status">;
};

/**
 * The signed-in user's ACTIVE organization memberships, each paired with
 * its organization. Used by the dashboard (docs/PRODUCT_REQUIREMENTS.md —
 * this milestone's minimal org-aware view). Relies on RLS
 * (organization_memberships_select_own_or_active_member /
 * organizations_select_active_member) as the real enforcement — the
 * explicit `.eq('user_id', ...)` / `.eq('status', 'active')` filters here
 * are for query correctness and index usage, not security; see
 * docs/API_CONVENTIONS.md §7.
 */
export async function listActiveOrganizationsForUser(
  userId: string,
): Promise<OrganizationMembershipSummary[]> {
  const supabase = await createClient();

  const { data: memberships, error: membershipsError } = await supabase
    .from("organization_memberships")
    .select("id, status, joined_at, organization_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true });

  if (membershipsError) throw membershipsError;
  if (!memberships || memberships.length === 0) return [];

  const organizationIds = memberships.map((membership) => membership.organization_id);

  const { data: organizations, error: organizationsError } = await supabase
    .from("organizations")
    .select("id, name, slug, status")
    .in("id", organizationIds);

  if (organizationsError) throw organizationsError;

  const organizationsById = new Map(
    (organizations ?? []).map((organization) => [organization.id, organization]),
  );

  return memberships.reduce<OrganizationMembershipSummary[]>((summaries, membership) => {
    const organization = organizationsById.get(membership.organization_id);
    if (organization) {
      summaries.push({ membership, organization });
    }
    return summaries;
  }, []);
}
