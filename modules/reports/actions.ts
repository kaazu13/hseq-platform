"use server";

import { forbidden } from "next/navigation";
import { requireCompanyMembership, requireProjectAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import { createReportShareFormSchema, type CreateReportShareFormInput } from "./validation";
import type { ReportRecordType } from "./types";

/**
 * Server Functions for report sharing — same fixed recipe as every other
 * module (docs/API_CONVENTIONS.md §3). Authorization is genuinely enforced
 * by RLS's can_manage_report_share_target() (mirrors each record table's
 * own UPDATE policy) — the requireCompanyMembership/requireProjectAccess
 * calls here are the same defense-in-depth "confirm the URL's own
 * company/project before ever touching the database" pattern every other
 * module's Server Functions already use, not the actual authority.
 */

export async function createReportShare(
  companyId: string,
  projectId: string | null,
  input: CreateReportShareFormInput,
): Promise<ActionResult<{ shareId: string; token: string; expiresAt: string | null }>> {
  const parsed = createReportShareFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the share options.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireCompanyMembership(companyId);
  if (projectId) {
    await requireProjectAccess(projectId);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_report_share", {
      target_company_id: companyId,
      target_project_id: projectId as string,
      target_record_type: parsed.data.recordType as ReportRecordType,
      target_record_id: parsed.data.recordId,
      target_expires_at: (parsed.data.expiresAt ?? null) as string,
    })
    .single();

  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't create the share link. Try again." } };
  }

  return { ok: true, data: { shareId: data.id, token: data.token, expiresAt: data.expires_at } };
}

/** No `recordType`/`recordId`-scoped revalidatePath here — every record type's own nested URL shape differs too much to derive from an id alone (some are project-scoped, some are not). The calling client component (modules/reports/components/share-panel.tsx) calls router.refresh() itself instead, the same pattern every other action-triggering component in this codebase already uses when it can't cheaply express its own exact server-side revalidation path. */
export async function revokeReportShare(companyId: string, shareId: string): Promise<ActionResult<null>> {
  await requireCompanyMembership(companyId);

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_report_share", { target_share_id: shareId });

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't revoke the share link. Try again." } };
  }

  return { ok: true, data: null };
}
