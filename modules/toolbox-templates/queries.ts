import { createClient } from "@/lib/supabase/server";
import { createToolboxDocumentSignedUrl } from "@/lib/storage/toolbox-documents";
import type { ToolboxTemplate, ToolboxTemplateFileReplacement } from "./types";

/** Server-only data access for Toolbox Templates — see docs/API_CONVENTIONS.md §7. */

export type ToolboxTemplateListFilters = {
  category?: string;
  language?: string;
  search?: string;
  status?: string;
};

export async function listToolboxTemplates(companyId: string, filters: ToolboxTemplateListFilters = {}): Promise<ToolboxTemplate[]> {
  const supabase = await createClient();
  let query = supabase.from("toolbox_templates").select("*").eq("company_id", companyId);

  if (filters.category) query = query.eq("category", filters.category as ToolboxTemplate["category"]);
  if (filters.language) query = query.eq("language", filters.language);
  if (filters.search) query = query.ilike("title", `%${filters.search}%`);
  if (filters.status) query = query.eq("status", filters.status as ToolboxTemplate["status"]);

  const { data, error } = await query.order("title", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getToolboxTemplate(companyId: string, templateId: string): Promise<ToolboxTemplate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("toolbox_templates").select("*").eq("company_id", companyId).eq("id", templateId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function listToolboxTemplateFileReplacements(templateId: string): Promise<ToolboxTemplateFileReplacement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("toolbox_template_file_replacements").select("*").eq("toolbox_template_id", templateId).order("replaced_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getToolboxTemplatePreviewUrl(objectPath: string): Promise<string | null> {
  const supabase = await createClient();
  return createToolboxDocumentSignedUrl(supabase, objectPath);
}

export type ToolboxTemplateOverviewCounts = {
  activeCount: number;
};

export async function getToolboxTemplateOverviewCounts(companyId: string): Promise<ToolboxTemplateOverviewCounts> {
  const supabase = await createClient();
  const { count, error } = await supabase.from("toolbox_templates").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "active");
  if (error) throw error;
  return { activeCount: count ?? 0 };
}
