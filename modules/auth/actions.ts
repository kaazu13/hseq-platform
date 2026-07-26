"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { loginSchema, type LoginInput } from "@/modules/auth/validation";

/**
 * Server Functions for the auth foundation. Colocated in modules/auth/
 * rather than lib/auth/ — per docs/ARCHITECTURE.md §4, lib/ holds
 * cross-cutting infrastructure (Supabase clients, session guards) while
 * mutations live in modules/<domain>/actions.ts. Auth isn't one of the
 * example domains listed in that section, but "login/logout are a mutation
 * a user performs" fits the same rationale as any other domain action.
 *
 * These follow the fixed Server Function shape from docs/API_CONVENTIONS.md
 * §3, with two steps intentionally skipped and called out below: `login`
 * is the act of authenticating, so there is no existing session to check
 * (steps 1–2 of the usual recipe don't apply); neither action touches a
 * tenant-owned record, so there's nothing to scope/cross-reference-validate
 * (step 4/5). Audit logging (step 7) is deferred — `audit_logs` doesn't
 * exist yet (see the implementation report for why), and the docs don't
 * list authentication events among the audit-required actions in
 * docs/ARCHITECTURE.md §8 (approvals, sign-offs, HSEQ mutations).
 */

export async function login(input: LoginInput): Promise<ActionResult<null>> {
  const parsed = loginSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const [field, messages] of Object.entries(parsed.error.flatten().fieldErrors)) {
      if (messages?.[0]) fieldErrors[field] = messages[0];
    }
    return {
      ok: false,
      error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Deliberately generic — do not reveal whether the email exists.
    return {
      ok: false,
      error: { code: "unauthorized", message: "Invalid email or password." },
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/**
 * Signs the current user out and redirects to /login. Returns `ActionResult`
 * (rather than throwing) specifically so the caller can show a safe,
 * generic error and let the user retry if `signOut()` itself fails (e.g. a
 * transient network error talking to the auth server) — the real internal
 * error is never forwarded to the client. On success this never actually
 * returns: `redirect()` throws internally (the standard Next.js pattern
 * used by every other Server Function in this codebase), which both ends
 * the request and clears any protected page from being rendered further.
 * `revalidatePath("/", "layout")` invalidates the whole cached layout tree
 * so a subsequent navigation — including the client's own post-redirect
 * render — can never serve a stale, still-"authenticated" shell.
 */
export async function logout(): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return { ok: false, error: { code: "server_error", message: "Couldn't sign you out. Try again." } };
  }

  revalidatePath("/", "layout");
  redirect("/login");
}
