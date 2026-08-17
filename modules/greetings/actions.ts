"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { requireCompanyMembership, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import { canManageGreetingSettings } from "./permissions";
import { updateGreetingSettingSchema, type UpdateGreetingSettingInput } from "./validation";
import type { CompanyGreetingSetting } from "./types";
import type { GreetingType } from "@/lib/greetings";

/** Server Functions for the company-greetings settings domain — same fixed recipe as every other module (docs/API_CONVENTIONS.md §3). RLS (company_greeting_settings_manage) is the real, authoritative gate; this is a fast pre-filter for a clear error. */
export async function updateGreetingSetting(companyId: string, greetingType: GreetingType, input: UpdateGreetingSettingInput): Promise<ActionResult<CompanyGreetingSetting>> {
  const parsed = updateGreetingSettingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireCompanyMembership(companyId);
  const roleNames = await getUserRoleNames(companyId);
  if (!canManageGreetingSettings(roleNames)) {
    forbidden();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_greeting_settings")
    .update({ enabled: parsed.data.enabled, message_template: parsed.data.messageTemplate, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("greeting_type", greetingType)
    .select()
    .single();

  if (error || !data) {
    if (isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't update the greeting setting. Try again." } };
  }

  revalidatePath("/admin/greetings");
  return { ok: true, data };
}
