"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import { requireOrganizationMembership, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import { validatePdfFile, computeSha256Checksum, buildSafetyFlashObjectPath, uploadPdfToToolboxBucket } from "@/lib/storage/toolbox-documents";
import { canManageSafetyFlash } from "./permissions";
import { isCallerProjectAccessible } from "./queries";
import { safetyFlashMetadataSchema, safetyFlashEditFormSchema, replaceFileReasonSchema } from "./validation";

async function requireSafetyFlashManageAccess(organizationId: string, projectId: string | null) {
  const { user } = await requireOrganizationMembership(organizationId);
  const [roleNames, hasProjectAccess] = await Promise.all([getUserRoleNames(organizationId), projectId ? isCallerProjectAccessible(projectId) : Promise.resolve(false)]);

  if (!canManageSafetyFlash(roleNames, projectId, hasProjectAccess)) {
    forbidden();
  }

  return { user, roleNames };
}

export async function createSafetyFlash(organizationId: string, formData: FormData): Promise<ActionResult<{ flashId: string }>> {
  const rawProjectId = String(formData.get("projectId") ?? "");
  const metadata = {
    projectId: rawProjectId,
    title: String(formData.get("title") ?? ""),
    dateIssued: String(formData.get("dateIssued") ?? ""),
    category: String(formData.get("category") ?? ""),
    language: String(formData.get("language") ?? ""),
    issuedByEmployeeId: String(formData.get("issuedByEmployeeId") ?? ""),
    summary: String(formData.get("summary") ?? ""),
  };
  const parsed = safetyFlashMetadataSchema.safeParse(metadata);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: { code: "validation_error", message: "Attach the Safety Flash PDF.", fieldErrors: { file: "A PDF file is required" } } };
  }
  const pdfCheck = await validatePdfFile(file);
  if (!pdfCheck.ok) {
    return { ok: false, error: { code: "validation_error", message: pdfCheck.message, fieldErrors: { file: pdfCheck.message } } };
  }

  const projectId = parsed.data.projectId ?? null;
  const { user } = await requireSafetyFlashManageAccess(organizationId, projectId);
  const supabase = await createClient();

  const flashId = randomUUID();
  const objectPath = buildSafetyFlashObjectPath(organizationId, projectId, flashId, file.name);
  const uploadResult = await uploadPdfToToolboxBucket(supabase, objectPath, file);
  if (!uploadResult.ok) {
    return { ok: false, error: { code: "server_error", message: uploadResult.message } };
  }
  const checksum = await computeSha256Checksum(file);

  const { data, error } = await supabase
    .from("safety_flashes")
    .insert({
      id: flashId,
      organization_id: organizationId,
      project_id: projectId,
      title: parsed.data.title,
      date_issued: parsed.data.dateIssued,
      category: parsed.data.category,
      language: parsed.data.language,
      issued_by_employee_id: parsed.data.issuedByEmployeeId,
      uploaded_by: user.id,
      storage_bucket: "toolbox-documents",
      storage_object_path: objectPath,
      original_filename: file.name,
      mime_type: "application/pdf",
      file_size_bytes: file.size,
      file_checksum_sha256: checksum,
      summary: parsed.data.summary ?? null,
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
    return { ok: false, error: { code: "server_error", message: "Couldn't save the Safety Flash. Try again." } };
  }

  revalidatePath("/toolbox-meetings");
  redirect(`/toolbox-meetings/safety-flash/${data.id}`);
}

export async function updateSafetyFlashMetadata(organizationId: string, flashId: string, projectId: string | null, input: unknown): Promise<ActionResult<null>> {
  const parsed = safetyFlashEditFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireSafetyFlashManageAccess(organizationId, projectId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("safety_flashes")
    .update(
      {
        title: parsed.data.title,
        date_issued: parsed.data.dateIssued,
        category: parsed.data.category,
        language: parsed.data.language,
        issued_by_employee_id: parsed.data.issuedByEmployeeId,
        summary: parsed.data.summary ?? null,
        updated_by: user.id,
      },
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .eq("id", flashId);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save changes. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Safety Flash not found." } };
  }

  revalidatePath(`/toolbox-meetings/safety-flash/${flashId}`);
  return { ok: true, data: null };
}

export async function setSafetyFlashStatus(organizationId: string, flashId: string, projectId: string | null, status: "active" | "archived"): Promise<ActionResult<null>> {
  const { user } = await requireSafetyFlashManageAccess(organizationId, projectId);
  const supabase = await createClient();

  const { error, count } = await supabase.from("safety_flashes").update({ status, updated_by: user.id }, { count: "exact" }).eq("organization_id", organizationId).eq("id", flashId);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    return { ok: false, error: { code: "server_error", message: "Couldn't update the status. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Safety Flash not found." } };
  }

  revalidatePath("/toolbox-meetings");
  revalidatePath(`/toolbox-meetings/safety-flash/${flashId}`);
  return { ok: true, data: null };
}

export async function replaceSafetyFlashFile(organizationId: string, flashId: string, projectId: string | null, formData: FormData): Promise<ActionResult<null>> {
  const reasonParsed = replaceFileReasonSchema.safeParse({ reason: String(formData.get("reason") ?? "") });
  if (!reasonParsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A reason is required.", fieldErrors: flattenFieldErrors(reasonParsed.error) } };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: { code: "validation_error", message: "Attach the corrected PDF.", fieldErrors: { file: "A PDF file is required" } } };
  }
  const pdfCheck = await validatePdfFile(file);
  if (!pdfCheck.ok) {
    return { ok: false, error: { code: "validation_error", message: pdfCheck.message, fieldErrors: { file: pdfCheck.message } } };
  }

  await requireSafetyFlashManageAccess(organizationId, projectId);
  const supabase = await createClient();

  const objectPath = buildSafetyFlashObjectPath(organizationId, projectId, flashId, file.name);
  const uploadResult = await uploadPdfToToolboxBucket(supabase, objectPath, file);
  if (!uploadResult.ok) {
    return { ok: false, error: { code: "server_error", message: uploadResult.message } };
  }
  const checksum = await computeSha256Checksum(file);

  const { error } = await supabase.rpc("replace_safety_flash_file", {
    target_flash_id: flashId,
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

  revalidatePath(`/toolbox-meetings/safety-flash/${flashId}`);
  return { ok: true, data: null };
}
