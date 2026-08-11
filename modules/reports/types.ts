import type { Database, Enums } from "@/types/database";

/**
 * Shared report/PDF/export/sharing domain — see
 * supabase/migrations/20260817090000_report_pdf_export_and_sharing.sql.
 * One `report_shares` table + one resolver RPC back external sharing for
 * all six supported record types (LMRA, Scaffold Inspection, Safety
 * Observation, Corrective Action, Toolbox Meeting, Safety Flash) —
 * deliberately not six separate systems.
 */
export type ReportShare = Database["public"]["Tables"]["report_shares"]["Row"];
export type ReportRecordType = Enums<"report_record_type">;

export const REPORT_RECORD_TYPES: ReportRecordType[] = [
  "lmra",
  "scaffold_inspection",
  "safety_observation",
  "corrective_action",
  "toolbox_meeting",
  "safety_flash",
];

export const REPORT_RECORD_TYPE_LABELS: Record<ReportRecordType, string> = {
  lmra: "LMRA",
  scaffold_inspection: "Scaffold Inspection",
  safety_observation: "Safety Observation",
  corrective_action: "Corrective Action",
  toolbox_meeting: "Toolbox Meeting",
  safety_flash: "Safety Flash",
};

/** The two record types whose "document" is an already-uploaded PDF — sharing/downloading resolves to that SAME file, never a newly generated one. */
export const DOCUMENT_PASSTHROUGH_RECORD_TYPES: ReportRecordType[] = ["toolbox_meeting", "safety_flash"];

export function isDocumentPassthroughRecordType(recordType: ReportRecordType): boolean {
  return DOCUMENT_PASSTHROUGH_RECORD_TYPES.includes(recordType);
}

/** Share lifecycle state, derived — never a stored column (mirrors modules/corrective-actions/types.ts's isCorrectiveActionOverdue()'s "derive, don't duplicate" convention). */
export type ReportShareStatus = "active" | "expired" | "revoked";

export function getReportShareStatus(share: Pick<ReportShare, "revoked_at" | "expires_at">, now: Date = new Date()): ReportShareStatus {
  if (share.revoked_at) return "revoked";
  if (share.expires_at && new Date(share.expires_at).getTime() <= now.getTime()) return "expired";
  return "active";
}

export const REPORT_SHARE_STATUS_LABELS: Record<ReportShareStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
};

/** Optional expiry presets offered when creating a share — "No expiry" maps to `null`. */
export type ShareExpiryPreset = "24h" | "7d" | "30d" | "none";

export const SHARE_EXPIRY_PRESET_LABELS: Record<ShareExpiryPreset, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  none: "No expiry",
};

/** Resolves a preset to an absolute ISO timestamp (or null for "no expiry") — computed client-side for display only; the server independently re-validates whatever timestamp is actually submitted (modules/reports/validation.ts). */
export function resolveShareExpiryPreset(preset: ShareExpiryPreset, from: Date = new Date()): string | null {
  const ms = { "24h": 24 * 60 * 60 * 1000, "7d": 7 * 24 * 60 * 60 * 1000, "30d": 30 * 24 * 60 * 60 * 1000, none: null }[preset];
  return ms === null ? null : new Date(from.getTime() + ms).toISOString();
}

// ── Public (anonymous) report payload — the exact JSONB shape
// resolve_public_report() returns. Every field is optional/nullable
// defensively since it crosses a JSON boundary with no compile-time
// guarantee, even though the RPC always populates it consistently.

export type PublicReportEmployeeRef = { first_name: string; last_name: string } | null;

export type PublicLmraReport = {
  id: string;
  work_area: string;
  work_activity: string;
  work_date: string;
  shift: string;
  status: string;
  result: string;
  stop_work_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  completed_by: PublicReportEmployeeRef;
  responsible_person: PublicReportEmployeeRef;
  participants: { first_name: string; last_name: string }[];
  hazards: {
    hazard_type: string;
    is_applicable: boolean;
    selected_controls: string[];
    controls: string | null;
    controls_confirmed: boolean;
    other_description: string | null;
    responsible_person: PublicReportEmployeeRef;
  }[];
};

export type PublicScaffoldInspectionReport = {
  id: string;
  scaffold_number: number;
  sequence_number: number;
  tag_number: string;
  work_area: string;
  scaffold_type: string;
  inspected_at: string;
  reason: string;
  status: string;
  outcome: string | null;
  expires_at: string | null;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
  inspector: PublicReportEmployeeRef;
  items: {
    item_type: string;
    result: string;
    comment: string | null;
    required_corrective_action: string | null;
    severity: string | null;
  }[];
  defects: {
    description: string;
    severity: string;
    status: string;
    due_date: string;
    immediate_control: string | null;
  }[];
};

export type PublicSafetyObservationReport = {
  id: string;
  work_area: string;
  observed_at: string;
  category: string;
  observation_type: string;
  description: string;
  immediate_action_taken: string | null;
  risk_level: string;
  is_stop_work: boolean;
  status: string;
  disposition: string | null;
  observer: PublicReportEmployeeRef;
  participants: { first_name: string; last_name: string }[];
  corrective_actions: { description: string; status: string; priority: string; due_date: string }[];
};

export type PublicCorrectiveActionReport = {
  id: string;
  description: string;
  priority: string;
  due_date: string;
  status: string;
  reviewed_at: string | null;
  completion_notes: string | null;
  closure_evidence: string | null;
  created_at: string;
  responsible_person: PublicReportEmployeeRef;
  observation: { work_area: string; description: string; observed_at: string };
};

export type PublicDocumentReport = {
  id: string;
  storage_bucket: string;
  storage_object_path: string;
  original_filename: string;
  status: string;
} & Record<string, unknown>;

export type PublicReportPayload = {
  share: { id: string; record_type: ReportRecordType; created_at: string; expires_at: string | null };
  company: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  record:
    | PublicLmraReport
    | PublicScaffoldInspectionReport
    | PublicSafetyObservationReport
    | PublicCorrectiveActionReport
    | PublicDocumentReport;
};
