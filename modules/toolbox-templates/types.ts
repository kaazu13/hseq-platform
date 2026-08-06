import type { Database } from "@/types/database";

/**
 * Types for the Toolbox Templates domain — an company-wide reusable
 * PDF library, no project dimension, no sequential number. See
 * supabase/migrations/20260803160000_toolbox_meetings_and_safety_flash.sql.
 */

export type ToolboxTemplate = Database["public"]["Tables"]["toolbox_templates"]["Row"];
export type ToolboxTemplateFileReplacement = Database["public"]["Tables"]["toolbox_template_file_replacements"]["Row"];
export type ToolboxDocumentStatus = Database["public"]["Enums"]["toolbox_document_status"];
export type HseqDocumentCategory = Database["public"]["Enums"]["hseq_document_category"];

export const TOOLBOX_DOCUMENT_STATUSES: ToolboxDocumentStatus[] = ["active", "archived"];
export const TOOLBOX_DOCUMENT_STATUS_LABELS: Record<ToolboxDocumentStatus, string> = {
  active: "Active",
  archived: "Archived",
};

export const HSEQ_DOCUMENT_CATEGORIES: HseqDocumentCategory[] = [
  "working_at_height",
  "line_of_fire",
  "material_handling",
  "falling_objects",
  "scaffold_erection_dismantling",
  "scaffold_inspection",
  "ppe",
  "access_egress",
  "housekeeping",
  "lifting_operations",
  "mewp_mobile_equipment",
  "tools_equipment",
  "weather_conditions",
  "emergency_response",
  "alcohol_drugs",
  "fit_for_work",
  "incident_lessons_learned",
  "other",
];

export const HSEQ_DOCUMENT_CATEGORY_LABELS: Record<HseqDocumentCategory, string> = {
  working_at_height: "Working at height",
  line_of_fire: "Line of fire",
  material_handling: "Material handling",
  falling_objects: "Falling objects",
  scaffold_erection_dismantling: "Scaffold erection and dismantling",
  scaffold_inspection: "Scaffold inspection",
  ppe: "PPE",
  access_egress: "Access and egress",
  housekeeping: "Housekeeping",
  lifting_operations: "Lifting operations",
  mewp_mobile_equipment: "MEWP and mobile equipment",
  tools_equipment: "Tools and equipment",
  weather_conditions: "Weather conditions",
  emergency_response: "Emergency response",
  alcohol_drugs: "Alcohol and drugs",
  fit_for_work: "Fit for work",
  incident_lessons_learned: "Incident lessons learned",
  other: "Other",
};

/** Curated suggestions for the language field/filter — not DB-enforced (see the migration's comment on why language is plain text, not an enum). */
export const SUGGESTED_DOCUMENT_LANGUAGES = ["English", "Dutch", "German", "French", "Spanish", "Polish", "Romanian", "Portuguese", "Turkish", "Arabic"];
