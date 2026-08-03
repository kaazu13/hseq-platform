import type { Database } from "@/types/database";

/**
 * Types for the Toolbox Meetings domain — see
 * supabase/migrations/20260803160000_toolbox_meetings_and_safety_flash.sql.
 * A toolbox meeting is a document-based evidence record (one uploaded
 * PDF); there is no attendance/acknowledgement/session-delivery state.
 */

export type ToolboxMeeting = Database["public"]["Tables"]["toolbox_meetings"]["Row"];
export type ToolboxMeetingFileReplacement = Database["public"]["Tables"]["toolbox_meeting_file_replacements"]["Row"];
export type ToolboxDocumentStatus = Database["public"]["Enums"]["toolbox_document_status"];

export const TOOLBOX_DOCUMENT_STATUSES: ToolboxDocumentStatus[] = ["active", "archived"];

export const TOOLBOX_DOCUMENT_STATUS_LABELS: Record<ToolboxDocumentStatus, string> = {
  active: "Active",
  archived: "Archived",
};

/** Resolved from get_toolbox_authorized_employee_info() — includes employee_number so the held-by/issued-by person can link to their existing employee profile page. */
export type ToolboxEmployeeRef = Database["public"]["Functions"]["get_toolbox_authorized_employee_info"]["Returns"][number];

export type ToolboxMeetingDetail = ToolboxMeeting & {
  heldBy: ToolboxEmployeeRef | null;
};

/** Formats the required "TOOLBOX MEETING: #<n>" display title, optionally with the descriptive title appended per the module's "TOOLBOX MEETING: #12 — Line of Fire and Material Handling" example. */
export function formatToolboxMeetingDisplayTitle(meetingNumber: number, title: string): string {
  return `TOOLBOX MEETING: #${meetingNumber} — ${title}`;
}

export function formatToolboxMeetingNumberLabel(meetingNumber: number): string {
  return `TOOLBOX MEETING: #${meetingNumber}`;
}
