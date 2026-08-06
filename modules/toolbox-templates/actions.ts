"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import { requireCompanyMembership, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import { validatePdfFile, computeSha256Checksum, buildToolboxTemplateObjectPath, uploadPdfToToolboxBucket } from "@/lib/storage/toolbox-documents";
import { canManageToolboxTemplate } from "./permissions";
import { toolboxTemplateMetadataSchema, toolboxTemplateEditFormSchema, replaceFileReasonSchema } from "./validation";

async function requireToolboxTemplateManageAccess(companyId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const roleNames = await getUserRoleNames(companyId);

  if (!canManageToolboxTemplate(roleNames)) {
    forbidden();
  }

  return { user, roleNames };
}

export async function createToolboxTemplate(companyId: string, formData: FormData): Promise<ActionResult<{ templateId: string }>> {
  const metadata = {
    title: String(formData.get("title") ?? ""),
    category: String(formData.get("category") ?? ""),
    language: String(formData.get("language") ?? ""),
    description: String(formData.get("description") ?? ""),
  };
  const parsed = toolboxTemplateMetadataSchema.safeParse(metadata);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: { code: "validation_error", message: "Attach the template PDF.", fieldErrors: { file: "A PDF file is required" } } };
  }
  const pdfCheck = await validatePdfFile(file);
  if (!pdfCheck.ok) {
    return { ok: false, error: { code: "validation_error", message: pdfCheck.message, fieldErrors: { file: pdfCheck.message } } };
  }

  const { user } = await requireToolboxTemplateManageAccess(companyId);
  const supabase = await createClient();

  const templateId = randomUUID();
  const objectPath = buildToolboxTemplateObjectPath(companyId, templateId, file.name);
  const uploadResult = await uploadPdfToToolboxBucket(supabase, objectPath, file);
  if (!uploadResult.ok) {
    return { ok: false, error: { code: "server_error", message: uploadResult.message } };
  }
  const checksum = await computeSha256Checksum(file);

  const { data, error } = await supabase
    .from("toolbox_templates")
    .insert({
      id: templateId,
      company_id: companyId,
      title: parsed.data.title,
      category: parsed.data.category,
      language: parsed.data.language,
      description: parsed.data.description ?? null,
      uploaded_by: user.id,
      storage_bucket: "toolbox-documents",
      storage_object_path: objectPath,
      original_filename: file.name,
      mime_type: "application/pdf",
      file_size_bytes: file.size,
      file_checksum_sha256: checksum,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save the template. Try again." } };
  }

  revalidatePath("/toolbox-meetings");
  redirect(`/toolbox-meetings/templates/${data.id}`);
}

export async function updateToolboxTemplateMetadata(companyId: string, templateId: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = toolboxTemplateEditFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireToolboxTemplateManageAccess(companyId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("toolbox_templates")
    .update(
      {
        title: parsed.data.title,
        category: parsed.data.category,
        language: parsed.data.language,
        description: parsed.data.description ?? null,
        updated_by: user.id,
      },
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .eq("id", templateId);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    return { ok: false, error: { code: "server_error", message: "Couldn't save changes. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Toolbox template not found." } };
  }

  revalidatePath(`/toolbox-meetings/templates/${templateId}`);
  return { ok: true, data: null };
}

export async function setToolboxTemplateStatus(companyId: string, templateId: string, status: "active" | "archived"): Promise<ActionResult<null>> {
  const { user } = await requireToolboxTemplateManageAccess(companyId);
  const supabase = await createClient();

  const { error, count } = await supabase.from("toolbox_templates").update({ status, updated_by: user.id }, { count: "exact" }).eq("company_id", companyId).eq("id", templateId);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    return { ok: false, error: { code: "server_error", message: "Couldn't update the status. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Toolbox template not found." } };
  }

  revalidatePath("/toolbox-meetings");
  revalidatePath(`/toolbox-meetings/templates/${templateId}`);
  return { ok: true, data: null };
}

/** Controlled "upload a replacement as a new controlled version" — mirrors modules/toolbox-meetings/actions.ts's replaceToolboxMeetingFile exactly. */
export async function replaceToolboxTemplateFile(companyId: string, templateId: string, formData: FormData): Promise<ActionResult<null>> {
  const reasonParsed = replaceFileReasonSchema.safeParse({ reason: String(formData.get("reason") ?? "") });
  if (!reasonParsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A reason is required.", fieldErrors: flattenFieldErrors(reasonParsed.error) } };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: { code: "validation_error", message: "Attach the replacement PDF.", fieldErrors: { file: "A PDF file is required" } } };
  }
  const pdfCheck = await validatePdfFile(file);
  if (!pdfCheck.ok) {
    return { ok: false, error: { code: "validation_error", message: pdfCheck.message, fieldErrors: { file: pdfCheck.message } } };
  }

  await requireToolboxTemplateManageAccess(companyId);
  const supabase = await createClient();

  const objectPath = buildToolboxTemplateObjectPath(companyId, templateId, file.name);
  const uploadResult = await uploadPdfToToolboxBucket(supabase, objectPath, file);
  if (!uploadResult.ok) {
    return { ok: false, error: { code: "server_error", message: uploadResult.message } };
  }
  const checksum = await computeSha256Checksum(file);

  const { error } = await supabase.rpc("replace_toolbox_template_file", {
    target_template_id: templateId,
    new_storage_object_path: objectPath,
    new_original_filename: file.name,
    new_mime_type: "application/pdf",
    new_file_size_bytes: file.size,
    new_file_checksum_sha256: checksum,
    reason: reasonParsed.data.reason,
  });

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't replace the file. Try again." } };
  }

  revalidatePath(`/toolbox-meetings/templates/${templateId}`);
  return { ok: true, data: null };
}
