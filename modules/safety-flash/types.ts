import type { Database } from "@/types/database";
import type { HseqDocumentCategory } from "@/modules/toolbox-templates/types";

/**
 * Types for the Safety Flash domain — see
 * supabase/migrations/20260803160000_toolbox_meetings_and_safety_flash.sql.
 * `project_id` is optional; numbering is ORGANIZATION-scoped (not
 * project-scoped) for that reason — see the migration's header comment.
 */

export type SafetyFlash = Database["public"]["Tables"]["safety_flashes"]["Row"];
export type SafetyFlashFileReplacement = Database["public"]["Tables"]["safety_flash_file_replacements"]["Row"];
export type ToolboxDocumentStatus = Database["public"]["Enums"]["toolbox_document_status"];
export type { HseqDocumentCategory };

export const TOOLBOX_DOCUMENT_STATUSES: ToolboxDocumentStatus[] = ["active", "archived"];
export const TOOLBOX_DOCUMENT_STATUS_LABELS: Record<ToolboxDocumentStatus, string> = {
  active: "Active",
  archived: "Archived",
};

export type ToolboxEmployeeRef = Database["public"]["Functions"]["get_toolbox_authorized_employee_info"]["Returns"][number];

export type SafetyFlashDetail = SafetyFlash & {
  issuedBy: ToolboxEmployeeRef | null;
};

/** Formats the required "SAFETY FLASH: #<n>" display title, optionally with a descriptive title appended per the module's "SAFETY FLASH: #4 — Dropped Object Prevention" example. */
export function formatSafetyFlashDisplayTitle(flashNumber: number, title: string): string {
  return `SAFETY FLASH: #${flashNumber} — ${title}`;
}

export function formatSafetyFlashNumberLabel(flashNumber: number): string {
  return `SAFETY FLASH: #${flashNumber}`;
}
