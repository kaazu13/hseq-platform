"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { requireOrganizationMembership, requireAnyRole, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRaisedException, isRlsViolation } from "@/lib/supabase/errors";
import { updateOwnProfileFormSchema } from "./validation";
import type { Database } from "@/types/database";

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

/**
 * A user editing their OWN `profiles.full_name`/`phone` — the /account
 * page's edit form. `profiles_update_own` RLS (`id = auth.uid()`) is the
 * real backstop; scoping the `.eq("id", user.id)` below is what keeps
 * this from ever touching a row that isn't the caller's own. Deliberately
 * cannot change `active_organization_id` (use `setActiveOrganization`
 * above), `user_number` (immutable), or anything about role/organization/
 * status — those are read-only everywhere in the UI by design, this
 * function has no field for them at all.
 */
export async function updateOwnProfile(input: unknown): Promise<ActionResult<null>> {
  const parsed = updateOwnProfileFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone ?? null })
    .eq("id", user.id);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    return { ok: false, error: { code: "server_error", message: "Couldn't save changes. Try again." } };
  }

  revalidatePath("/account");
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

type MembershipStatus = Database["public"]["Enums"]["membership_status"];

/**
 * Activates/suspends/removes an organization member's access —
 * /admin/members' status action. `organization_memberships_update_managers`
 * RLS (company_admin/operations_manager only) is the real gate;
 * `validate_organization_membership_update()`
 * (20260804091000_organization_membership_status_management.sql) is what
 * actually blocks self-status-changes and removing an organization's last
 * active company_admin — both surface here as a validation error/conflict
 * rather than a raw database exception.
 */
export async function setMembershipStatus(organizationId: string, membershipId: string, status: MembershipStatus): Promise<ActionResult<null>> {
  const { user } = await requireAnyRole(organizationId, ["company_admin", "operations_manager"]);
  const supabase = await createClient();

  const { error, count } = await supabase.from("organization_memberships").update({ status, updated_by: user.id }, { count: "exact" }).eq("organization_id", organizationId).eq("id", membershipId);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "conflict", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't update that member's status. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Member not found." } };
  }

  await supabase.from("audit_events").insert({
    organization_id: organizationId,
    actor_user_id: user.id,
    action: "update",
    entity_type: "organization_membership",
    entity_id: membershipId,
    changes: { status_set: status },
  });

  revalidatePath("/admin/members");
  return { ok: true, data: null };
}
