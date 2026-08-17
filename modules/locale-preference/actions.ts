"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRlsViolation } from "@/lib/supabase/errors";
import { updateLocaleSchema, type UpdateLocaleInput } from "./validation";
import type { Database } from "@/types/database";

/**
 * Task 3 Part 21/22 — "[ Save language ]". Self-only (profiles_update_own
 * RLS is the real backstop), exactly mirroring modules/appearance/actions.ts's
 * updateAppearance() — a UI preference, never a security boundary, never
 * company-scoped. revalidatePath("/", "layout") re-runs the root layout's
 * getLocale()/getMessages() on the next render, so the switch takes effect
 * immediately without a manual page reload.
 */
export async function updateLocale(input: UpdateLocaleInput): Promise<ActionResult<null>> {
  const parsed = updateLocaleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Invalid language selection.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("profiles").update({ locale: parsed.data.locale as Database["public"]["Enums"]["app_locale"] }).eq("id", user.id);
  if (error) {
    if (isRlsViolation(error)) forbidden();
    return { ok: false, error: { code: "server_error", message: "Couldn't save your language preference. Try again." } };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: null };
}
