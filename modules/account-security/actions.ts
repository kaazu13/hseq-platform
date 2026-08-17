"use server";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors } from "@/lib/supabase/errors";
import { changeMyPasswordSchema, type ChangeMyPasswordInput } from "./validation";

/**
 * Task 3 Part 31 — real reauthenticated self-service password change.
 * "Reauthenticated" here means: re-verify the caller actually knows their
 * CURRENT password (via a fresh signInWithPassword call, the standard
 * Supabase-recommended step-up pattern — Supabase Auth has no separate
 * reauthentication API for password changes) before calling
 * `auth.updateUser()`. Structurally self-only: `auth.updateUser()` only
 * ever mutates the password of the currently-signed-in session — there is
 * no parameter anywhere in this flow that could target a different
 * account, so this can never become the kind of "helper script touches the
 * wrong person's password" incident this codebase has hit before.
 *
 * signInWithPassword() is called on the SAME cookie-bound server client
 * (not a throwaway client) — since it's the caller re-entering their own
 * already-correct current password, this simply refreshes their existing
 * session rather than creating a conflicting one. A wrong current password
 * fails here with no state changed.
 */
export async function changeMyPassword(input: ChangeMyPasswordInput): Promise<ActionResult<null>> {
  const parsed = changeMyPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireUser();
  if (!user.email) {
    return { ok: false, error: { code: "server_error", message: "Your account has no email on file — password change isn't available." } };
  }

  const supabase = await createClient();

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (reauthError) {
    return { ok: false, error: { code: "validation_error", message: "Current password is incorrect.", fieldErrors: { currentPassword: "Current password is incorrect." } } };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (updateError) {
    return { ok: false, error: { code: "server_error", message: "Couldn't update your password. Try again." } };
  }

  return { ok: true, data: null };
}
