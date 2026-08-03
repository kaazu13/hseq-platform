"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";
import { requireOrganizationMembership, getUserRoleNames } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import { validatePdfFile, computeSha256Checksum, buildToolboxMeetingObjectPath, uploadPdfToToolboxBucket } from "@/lib/storage/toolbox-documents";
import { canManageToolboxMeeting } from "./permissions";
import { isCallerProjectAccessible } from "./queries";
import { toolboxMeetingMetadataSchema, toolboxMeetingEditFormSchema, replaceFileReasonSchema } from "./validation";

/**
 * Server Functions for Toolbox Meetings — same fixed recipe as every
 * other module (docs/API_CONVENTIONS.md §3), extended for file upload:
 * these accept a FormData (metadata fields + the PDF) rather than a plain
 * JSON input object, since a File isn't JSON-serializable.
 */

async function requireToolboxMeetingManageAccess(organizationId: string, projectId: string) {
  const { user } = await requireOrganizationMembership(organizationId);
  const [roleNames, hasProjectAccess] = await Promise.all([getUserRoleNames(organizationId), isCallerProjectAccessible(projectId)]);

  if (!canManageToolboxMeeting(roleNames, hasProjectAccess)) {
    forbidden();
  }

  return { user, roleNames };
}

export async function createToolboxMeeting(organizationId: string, formData: FormData): Promise<ActionResult<{ meetingId: string }>> {
  const metadata = {
    projectId: String(formData.get("projectId") ?? ""),
    title: String(formData.get("title") ?? ""),
    meetingDate: String(formData.get("meetingDate") ?? ""),
    workArea: String(formData.get("workArea") ?? ""),
    heldByEmployeeId: String(formData.get("heldByEmployeeId") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
  const parsed = toolboxMeetingMetadataSchema.safeParse(metadata);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: { code: "validation_error", message: "Attach the completed PDF.", fieldErrors: { file: "A PDF file is required" } } };
  }
  const pdfCheck = await validatePdfFile(file);
  if (!pdfCheck.ok) {
    return { ok: false, error: { code: "validation_error", message: pdfCheck.message, fieldErrors: { file: pdfCheck.message } } };
  }

  const { user } = await requireToolboxMeetingManageAccess(organizationId, parsed.data.projectId);
  const supabase = await createClient();

  const meetingId = randomUUID();
  const objectPath = buildToolboxMeetingObjectPath(organizationId, parsed.data.projectId, meetingId, file.name);
  const uploadResult = await uploadPdfToToolboxBucket(supabase, objectPath, file);
  if (!uploadResult.ok) {
    return { ok: false, error: { code: "server_error", message: uploadResult.message } };
  }
  const checksum = await computeSha256Checksum(file);

  const { data, error } = await supabase
    .from("toolbox_meetings")
    .insert({
      id: meetingId,
      organization_id: organizationId,
      project_id: parsed.data.projectId,
      title: parsed.data.title,
      meeting_date: parsed.data.meetingDate,
      work_area: parsed.data.workArea ?? null,
      held_by_employee_id: parsed.data.heldByEmployeeId,
      uploaded_by: user.id,
      storage_bucket: "toolbox-documents",
      storage_object_path: objectPath,
      original_filename: file.name,
      mime_type: "application/pdf",
      file_size_bytes: file.size,
      file_checksum_sha256: checksum,
      notes: parsed.data.notes ?? null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    // The uploaded object is intentionally left in place even on failure —
    // authenticated has no DELETE grant on storage.objects at all (see the
    // storage migration's header comment), so a harmless orphaned object
    // is accepted rather than opening a delete path that could also
    // remove real evidence.
    if (error && isRlsViolation(error)) forbidden();
    if (error && isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save the toolbox meeting record. Try again." } };
  }

  revalidatePath("/toolbox-meetings");
  redirect(`/toolbox-meetings/${data.id}`);
}

export async function updateToolboxMeetingMetadata(organizationId: string, meetingId: string, projectId: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = toolboxMeetingEditFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireToolboxMeetingManageAccess(organizationId, projectId);
  const supabase = await createClient();

  const { error, count } = await supabase
    .from("toolbox_meetings")
    .update(
      {
        title: parsed.data.title,
        meeting_date: parsed.data.meetingDate,
        work_area: parsed.data.workArea ?? null,
        held_by_employee_id: parsed.data.heldByEmployeeId,
        notes: parsed.data.notes ?? null,
        updated_by: user.id,
      },
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .eq("id", meetingId);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) {
      return { ok: false, error: { code: "validation_error", message: error.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save changes. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Toolbox meeting not found." } };
  }

  revalidatePath(`/toolbox-meetings/${meetingId}`);
  return { ok: true, data: null };
}

export async function setToolboxMeetingStatus(organizationId: string, meetingId: string, projectId: string, status: "active" | "archived"): Promise<ActionResult<null>> {
  const { user } = await requireToolboxMeetingManageAccess(organizationId, projectId);
  const supabase = await createClient();

  const { error, count } = await supabase.from("toolbox_meetings").update({ status, updated_by: user.id }, { count: "exact" }).eq("organization_id", organizationId).eq("id", meetingId);

  if (error) {
    if (isRlsViolation(error)) forbidden();
    return { ok: false, error: { code: "server_error", message: "Couldn't update the status. Try again." } };
  }
  if (count === 0) {
    return { ok: false, error: { code: "not_found", message: "Toolbox meeting not found." } };
  }

  revalidatePath("/toolbox-meetings");
  revalidatePath(`/toolbox-meetings/${meetingId}`);
  return { ok: true, data: null };
}

/** Controlled replacement of an incorrectly-uploaded PDF — records who/when/why and the previous+new storage references via replace_toolbox_meeting_file(), never a silent overwrite. */
export async function replaceToolboxMeetingFile(organizationId: string, meetingId: string, projectId: string, formData: FormData): Promise<ActionResult<null>> {
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

  await requireToolboxMeetingManageAccess(organizationId, projectId);
  const supabase = await createClient();

  const objectPath = buildToolboxMeetingObjectPath(organizationId, projectId, meetingId, file.name);
  const uploadResult = await uploadPdfToToolboxBucket(supabase, objectPath, file);
  if (!uploadResult.ok) {
    return { ok: false, error: { code: "server_error", message: uploadResult.message } };
  }
  const checksum = await computeSha256Checksum(file);

  const { error } = await supabase.rpc("replace_toolbox_meeting_file", {
    target_meeting_id: meetingId,
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

  revalidatePath(`/toolbox-meetings/${meetingId}`);
  return { ok: true, data: null };
}
