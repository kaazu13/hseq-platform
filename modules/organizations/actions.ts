"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

/**
 * Server Function backing the organization switcher (components/app-shell/
 * org-switcher.tsx). Follows the docs/API_CONVENTIONS.md §3 shape.
 *
 * `profiles.active_organization_id` is a UX preference column only — see
 * docs/DATABASE_SCHEMA.md's `profiles` section — never a security
 * boundary. `requireOrganizationMembership()` is still the real
 * authorization check here: it re-verifies against `organization_memberships`
 * via `is_organization_member()` (a live database check, per
 * docs/ARCHITECTURE.md §3.2's "Active organization selection" status
 * note) before this function ever touches `profiles`, so a user can only
 * ever set their active organization to one they actually, currently,
 * belong to.
 */
export async function setActiveOrganization(organizationId: string): Promise<ActionResult<null>> {
  const { user } = await requireOrganizationMembership(organizationId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ active_organization_id: organizationId })
    .eq("id", user.id);

  if (error) {
    return {
      ok: false,
      error: { code: "server_error", message: "Couldn't switch organizations. Try again." },
    };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: null };
}
