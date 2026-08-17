import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDueFixedGreetingTypes } from "@/lib/greetings";

/**
 * Task 3 Part 8's scheduler entry point — runs once daily, no signed-in
 * user context (a real cron invocation, never reachable by a regular user
 * request). Delegates all the actual work to process_company_greetings()
 * (supabase/migrations/20260901112000_company_greetings.sql), which is the
 * real authorization boundary (SECURITY DEFINER, granted to service_role
 * only) — this route's own job is just: verify the request is genuinely
 * the scheduler, compute today's due fixed-calendar greeting types, and
 * call it via the service-role admin client (one of this client's
 * explicitly sanctioned uses — see lib/supabase/admin.ts's header comment).
 *
 * Scheduler: vercel.json declares a daily cron hitting this route — Vercel
 * automatically attaches `Authorization: Bearer $CRON_SECRET` to its own
 * cron requests when the CRON_SECRET env var is set on the project, which
 * is what the check below verifies. If this app is ever deployed somewhere
 * OTHER than Vercel, vercel.json's cron config is simply inert — configure
 * any external scheduler (cron host, GitHub Actions scheduled workflow,
 * etc.) to send a daily GET request to this route with that same
 * `Authorization: Bearer <CRON_SECRET>` header instead. Either way,
 * CRON_SECRET must be set in the environment or every request is rejected.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const targetDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const dueFixedTypes = getDueFixedGreetingTypes(targetDate);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("process_company_greetings", {
    target_date: targetDate.toISOString().slice(0, 10),
    target_due_fixed_types: dueFixedTypes,
  });

  if (error) {
    return NextResponse.json({ error: "failed to process greetings" }, { status: 500 });
  }

  return NextResponse.json({ date: targetDate.toISOString().slice(0, 10), dueFixedTypes, sentCount: data?.length ?? 0 });
}
