"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
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
 * (step 4/5).
 *
 * Security/login history (Phase 14): login/logout now write to
 * security_events via the log_login_success()/log_login_failed()/
 * log_logout() RPCs (supabase/migrations/20260819095000_platform_admin.sql)
 * — IP/user-agent are read from request headers (x-forwarded-for behind
 * this deployment's proxy; the direct socket address isn't available to a
 * Server Function). Never logs the password/credentials themselves. A
 * best-effort signal, not a guaranteed-complete one — a failure to write
 * the log entry never blocks the actual login/logout.
 */

async function clientSignal(): Promise<{ ip: string | undefined; userAgent: string | undefined }> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : undefined;
  return { ip, userAgent: headerList.get("user-agent") ?? undefined };
}

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

  const { ip, userAgent } = await clientSignal();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    await supabase.rpc("log_login_failed", { attempted_email: parsed.data.email, target_ip: ip, target_user_agent: userAgent }).then(
      () => {},
      () => {},
    );
    // Deliberately generic — do not reveal whether the email exists.
    return {
      ok: false,
      error: { code: "unauthorized", message: "Invalid email or password." },
    };
  }

  // A banned/suspended account must never see a "successful" login, even
  // momentarily — checked here, in addition to getCurrentUser()'s own
  // per-request re-check, so this exact case never sets a session cookie
  // and redirects to /dashboard first (Phase 12).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("account_status").eq("id", user?.id ?? "").maybeSingle();
  if (profile && profile.account_status !== "active") {
    await supabase.auth.signOut();
    return { ok: false, error: { code: "unauthorized", message: "This account is not active. Contact your administrator." } };
  }

  await supabase.rpc("log_login_success", { target_ip: ip, target_user_agent: userAgent }).then(
    () => {},
    () => {},
  );

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
  const { ip, userAgent } = await clientSignal();
  const supabase = await createClient();
  await supabase.rpc("log_logout", { target_ip: ip, target_user_agent: userAgent }).then(
    () => {},
    () => {},
  );

  const { error } = await supabase.auth.signOut();

  if (error) {
    return { ok: false, error: { code: "server_error", message: "Couldn't sign you out. Try again." } };
  }

  revalidatePath("/", "layout");
  redirect("/login");
}
