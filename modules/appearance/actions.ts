"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRlsViolation } from "@/lib/supabase/errors";
import { updateAppearanceSchema, type UpdateAppearanceInput } from "./validation";
import type { Database } from "@/types/database";

type AppearanceUpdate = Partial<Pick<Database["public"]["Tables"]["profiles"]["Update"], "theme_mode" | "accent_theme">>;

/** "[ Save appearance ]" (Phase 18) — self-only (profiles_update_own RLS), a UI preference, never a security boundary. */
export async function updateAppearance(input: UpdateAppearanceInput): Promise<ActionResult<null>> {
  const parsed = updateAppearanceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Invalid appearance selection.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireUser();
  const supabase = await createClient();

  const update: AppearanceUpdate = {};
  if (parsed.data.themeMode) update.theme_mode = parsed.data.themeMode as Database["public"]["Enums"]["theme_mode"];
  if (parsed.data.accentTheme) update.accent_theme = parsed.data.accentTheme as Database["public"]["Enums"]["accent_theme"];

  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) {
    if (isRlsViolation(error)) forbidden();
    return { ok: false, error: { code: "server_error", message: "Couldn't save your appearance preference. Try again." } };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: null };
}
