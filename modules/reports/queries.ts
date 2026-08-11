import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { ReportShare, ReportRecordType, PublicReportPayload } from "./types";

/**
 * Server-only data access for report sharing — see docs/API_CONVENTIONS.md
 * §7. RLS (report_shares_select) does the real scoping for the
 * authenticated listing below — the same manage-tier condition that gates
 * creating/revoking a share also gates seeing that it exists.
 */

const RECORD_ID_COLUMN: Record<ReportRecordType, string> = {
  lmra: "lmra_assessment_id",
  scaffold_inspection: "scaffold_inspection_id",
  safety_observation: "safety_observation_id",
  corrective_action: "corrective_action_id",
  toolbox_meeting: "toolbox_meeting_id",
  safety_flash: "safety_flash_id",
};

/** Every share ever created for one specific record, newest first — "See whether link is active/expired/revoked." */
export async function listReportSharesForRecord(companyId: string, recordType: ReportRecordType, recordId: string): Promise<ReportShare[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_shares")
    .select("*")
    .eq("company_id", companyId)
    .eq(RECORD_ID_COLUMN[recordType], recordId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Resolves a public share token to its full report payload — the ONLY
 * data-access path used by app/share/[token]/**, via the anon-role client
 * (lib/supabase/public.ts) calling the SECURITY DEFINER
 * resolve_public_report() RPC. Returns null uniformly for every failure
 * (unknown/malformed/revoked/expired token) — see that RPC's own comment
 * for why callers must never try to distinguish the reason.
 */
export async function getPublicReport(token: string): Promise<PublicReportPayload | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("resolve_public_report", { target_token: token });
  if (error) return null;
  return (data as PublicReportPayload | null) ?? null;
}
