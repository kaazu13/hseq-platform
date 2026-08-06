"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { requireCompanyMembership, requireAnyRole, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRaisedException, isRlsViolation } from "@/lib/supabase/errors";
import { updateOwnProfileFormSchema } from "./validation";
import type { Database } from "@/types/database";

/**
 * Server Function backing the company switcher (components/app-shell/
 * company-switcher.tsx). Follows the docs/API_CONVENTIONS.md §3 shape.
 *
 * `profiles.active_company_id` is a UX preference column only — see
 * docs/DATABASE_SCHEMA.md's `profiles` section — never a security
 * boundary. `requireCompanyMembership()` is still the real
 * authorization check here: it re-verifies against `company_memberships`
 * via `is_company_member()` (a live database check, per
 * docs/ARCHITECTURE.md §3.2's "Active company selection" status
 * note) before this function ever touches `profiles`, so a user can only
 * ever set their active company to one they actually, currently,
 * belong to.
 */
export async function setActiveCompany(companyId: string): Promise<ActionResult<null>> {
  const { user } = await requireCompanyMembership(companyId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ active_company_id: companyId })
    .eq("id", user.id);

  if (error) {
    return {
      ok: false,
      error: { code: "server_error", message: "Couldn't switch companies. Try again." },
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
 * cannot change `active_company_id` (use `setActiveCompany`
 * above), `user_number` (immutable), or anything about role/company/
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
 * Activates/suspends/removes an company member's access —
 * /admin/members' status action. `company_memberships_update_managers`
 * RLS (company_admin/operations_manager only) is the real gate;
 * `validate_company_membership_update()`
 * (20260804091000_company_membership_status_management.sql) is what
 * actually blocks self-status-changes and removing an company's last
 * active company_admin — both surface here as a validation error/conflict
 * rather than a raw database exception.
 */
export async function setMembershipStatus(companyId: string, membershipId: string, status: MembershipStatus): Promise<ActionResult<null>> {
  const { user } = await requireAnyRole(companyId, ["company_admin", "operations_manager"]);
  const supabase = await createClient();

  const { error, count } = await supabase.from("company_memberships").update({ status, updated_by: user.id }, { count: "exact" }).eq("company_id", companyId).eq("id", membershipId);

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
    company_id: companyId,
    actor_user_id: user.id,
    action: "update",
    entity_type: "company_membership",
    entity_id: membershipId,
    changes: { status_set: status },
  });

  revalidatePath("/admin/members");
  return { ok: true, data: null };
}
