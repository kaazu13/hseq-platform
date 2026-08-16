"use server";

import { revalidatePath } from "next/cache";
import { forbidden, notFound } from "next/navigation";
import { requireCompanyMembership, requireProjectAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import { validateScaffoldPhotoFile, buildScaffoldPhotoObjectPath, uploadScaffoldPhoto, removeScaffoldPhotoObject } from "@/lib/storage/scaffold-photos";
import { SCAFFOLD_PHOTOS_MAX_COUNT } from "./types";

/**
 * Server Functions for scaffold completion photos (Part 4F). Same fixed
 * recipe as modules/scaffolds/actions.ts (docs/API_CONVENTIONS.md §3),
 * split into its own file since photos are a genuinely separate
 * sub-resource with their own authorization function
 * (can_manage_scaffold_photos — narrower than general scaffold edit
 * rights, see the migration's own comment).
 *
 * Upload is validate-then-upload-then-insert, in that order, with an
 * explicit `can_manage_scaffold_photos` pre-check BEFORE the storage
 * upload — the point is to never leave an orphaned storage object behind
 * a permission failure. If the row insert still somehow fails after a
 * successful upload (e.g. a race pushed the count to 30 first), the
 * just-uploaded object is removed again (best-effort) rather than left
 * dangling with no referencing row.
 */

async function loadScaffoldForPhotoAccess(companyId: string, projectId: string, scaffoldId: string) {
  const supabase = await createClient();
  const { data: scaffold, error } = await supabase.from("scaffolds").select("id, project_id, tag_number").eq("company_id", companyId).eq("id", scaffoldId).maybeSingle();
  if (error) throw error;
  if (!scaffold || scaffold.project_id !== projectId) {
    notFound();
  }
  return scaffold;
}

export async function uploadScaffoldPhotoAction(companyId: string, projectId: string, scaffoldId: string, formData: FormData): Promise<ActionResult<{ photoId: string; url: string }>> {
  const { user } = await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);
  await loadScaffoldForPhotoAccess(companyId, projectId, scaffoldId);

  const supabase = await createClient();

  const { data: canManage, error: canManageError } = await supabase.rpc("can_manage_scaffold_photos", { target_scaffold_id: scaffoldId });
  if (canManageError) throw canManageError;
  if (!canManage) forbidden();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: { code: "validation_error", message: "No file was provided." } };
  }

  const { count: currentCount, error: countError } = await supabase.from("scaffold_photos").select("id", { count: "exact", head: true }).eq("scaffold_id", scaffoldId);
  if (countError) throw countError;
  if ((currentCount ?? 0) >= SCAFFOLD_PHOTOS_MAX_COUNT) {
    return { ok: false, error: { code: "conflict", message: `This scaffold already has the maximum of ${SCAFFOLD_PHOTOS_MAX_COUNT} completion photos.` } };
  }

  const validation = await validateScaffoldPhotoFile(file);
  if (!validation.ok) {
    return { ok: false, error: { code: "validation_error", message: validation.message } };
  }

  const objectPath = buildScaffoldPhotoObjectPath(companyId, projectId, scaffoldId, file.type);
  const uploadResult = await uploadScaffoldPhoto(supabase, objectPath, file);
  if (!uploadResult.ok) {
    return { ok: false, error: { code: "server_error", message: uploadResult.message } };
  }

  const { data: row, error: insertError } = await supabase
    .from("scaffold_photos")
    .insert({
      company_id: companyId,
      project_id: projectId,
      scaffold_id: scaffoldId,
      storage_object_path: objectPath,
      original_filename: file.name.slice(0, 255),
      mime_type: file.type,
      file_size_bytes: file.size,
      order_index: currentCount ?? 0,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !row) {
    await removeScaffoldPhotoObject(supabase, objectPath);
    if (insertError && isRlsViolation(insertError)) forbidden();
    if (insertError && isRaisedException(insertError)) {
      return { ok: false, error: { code: "validation_error", message: insertError.message } };
    }
    return { ok: false, error: { code: "server_error", message: "Couldn't save the photo. Try again." } };
  }

  const { data: signed, error: signedError } = await supabase.storage.from("scaffold-photos").createSignedUrl(objectPath, 60);
  if (signedError || !signed) throw signedError ?? new Error("Failed to sign newly uploaded scaffold photo");

  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffolds/${scaffoldId}`);
  return { ok: true, data: { photoId: row.id, url: signed.signedUrl } };
}

export async function deleteScaffoldPhotoAction(companyId: string, projectId: string, scaffoldId: string, photoId: string): Promise<ActionResult<null>> {
  await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);
  await loadScaffoldForPhotoAccess(companyId, projectId, scaffoldId);

  const supabase = await createClient();

  const { data: photo, error: photoError } = await supabase.from("scaffold_photos").select("storage_object_path").eq("id", photoId).eq("scaffold_id", scaffoldId).maybeSingle();
  if (photoError) throw photoError;
  if (!photo) {
    return { ok: false, error: { code: "not_found", message: "Photo not found." } };
  }

  const { error: deleteError } = await supabase.from("scaffold_photos").delete().eq("id", photoId).eq("scaffold_id", scaffoldId);
  if (deleteError) {
    if (isRlsViolation(deleteError)) forbidden();
    return { ok: false, error: { code: "server_error", message: "Couldn't delete the photo. Try again." } };
  }

  await removeScaffoldPhotoObject(supabase, photo.storage_object_path);

  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffolds/${scaffoldId}`);
  return { ok: true, data: null };
}

/** Reorders the gallery to exactly `orderedPhotoIds` (index in the array becomes the new order_index) — every id must already belong to this scaffold, or the whole reorder is rejected rather than applied partially. */
export async function reorderScaffoldPhotosAction(companyId: string, projectId: string, scaffoldId: string, orderedPhotoIds: string[]): Promise<ActionResult<null>> {
  await requireCompanyMembership(companyId);
  await requireProjectAccess(projectId);
  await loadScaffoldForPhotoAccess(companyId, projectId, scaffoldId);

  const supabase = await createClient();

  const { data: canManage, error: canManageError } = await supabase.rpc("can_manage_scaffold_photos", { target_scaffold_id: scaffoldId });
  if (canManageError) throw canManageError;
  if (!canManage) forbidden();

  const { data: existing, error: existingError } = await supabase.from("scaffold_photos").select("id").eq("scaffold_id", scaffoldId);
  if (existingError) throw existingError;
  const existingIds = new Set((existing ?? []).map((row) => row.id));

  if (orderedPhotoIds.length !== existingIds.size || orderedPhotoIds.some((id) => !existingIds.has(id))) {
    return { ok: false, error: { code: "validation_error", message: "The photo order is out of date. Refresh and try again." } };
  }

  for (let index = 0; index < orderedPhotoIds.length; index += 1) {
    const { error } = await supabase.from("scaffold_photos").update({ order_index: index }).eq("id", orderedPhotoIds[index]).eq("scaffold_id", scaffoldId);
    if (error) {
      return { ok: false, error: { code: "server_error", message: "Couldn't save the new photo order. Try again." } };
    }
  }

  revalidatePath(`/companies/${companyId}/projects/${projectId}/scaffolds/${scaffoldId}`);
  return { ok: true, data: null };
}
