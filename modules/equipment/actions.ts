"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { requireCompanyMembership, getUserRoleNames, isPlatformSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import { flattenFieldErrors, isRlsViolation, isRaisedException } from "@/lib/supabase/errors";
import { getMyProjectAssignmentRoles } from "@/modules/projects/queries";
import { getMyEmployeeId } from "@/modules/daily-workforce/queries";
import { canManageEquipment, canManageEquipmentCatalog } from "./permissions";
import {
  createEquipmentItemSchema,
  updateEquipmentItemSchema,
  adjustEquipmentStockSchema,
  issueEquipmentSchema,
  returnEquipmentSchema,
  markEquipmentDamagedSchema,
  markEquipmentLostSchema,
  recoverEquipmentSchema,
  retireEquipmentItemSchema,
  submitEquipmentRequestSchema,
  decideEquipmentRequestSchema,
  denyOrReturnEquipmentRequestSchema,
  updateEquipmentAssignmentExpirySchema,
  type CreateEquipmentItemInput,
  type UpdateEquipmentItemInput,
  type AdjustEquipmentStockInput,
  type IssueEquipmentInput,
  type ReturnEquipmentInput,
  type MarkEquipmentDamagedInput,
  type MarkEquipmentLostInput,
  type RecoverEquipmentInput,
  type RetireEquipmentItemInput,
  type SubmitEquipmentRequestInput,
  type DecideEquipmentRequestInput,
  type DenyOrReturnEquipmentRequestInput,
  type UpdateEquipmentAssignmentExpiryInput,
} from "./validation";
import type { EquipmentItem, EquipmentAssignment, EquipmentRequest, EquipmentCondition } from "./types";

/**
 * Server Functions for the Equipment domain — same fixed recipe as every
 * other module (docs/API_CONVENTIONS.md §3). App-layer checks here are a
 * coarse pre-filter for a fast, clear error; RLS and each RPC's own
 * validation (supabase/migrations/20260827090000_equipment.sql) are the
 * real, authoritative enforcement.
 */

async function requireEquipmentManageAccess(companyId: string, projectId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, myProjectAssignmentRoles, isSuperAdmin] = await Promise.all([
    getUserRoleNames(companyId),
    getMyProjectAssignmentRoles(companyId, projectId, user.id),
    isPlatformSuperAdmin(),
  ]);
  if (!isSuperAdmin && !canManageEquipment(roleNames, projectId, myProjectAssignmentRoles)) forbidden();
  return { user, roleNames, myProjectAssignmentRoles };
}

/** Part 24/33 — the catalog/pricing/stock-adjustment gate (includes planner), distinct from requireEquipmentManageAccess above (issuing/returning/request-decision authority, planner excluded) — see canManageEquipmentCatalog's comment. */
async function requireEquipmentCatalogManageAccess(companyId: string, projectId: string) {
  const { user } = await requireCompanyMembership(companyId);
  const [roleNames, myProjectAssignmentRoles, isSuperAdmin] = await Promise.all([
    getUserRoleNames(companyId),
    getMyProjectAssignmentRoles(companyId, projectId, user.id),
    isPlatformSuperAdmin(),
  ]);
  if (!isSuperAdmin && !canManageEquipmentCatalog(roleNames, projectId, myProjectAssignmentRoles)) forbidden();
  return { user, roleNames, myProjectAssignmentRoles };
}

function revalidateEquipmentPaths(companyId: string, projectId: string) {
  revalidatePath(`/companies/${companyId}/projects/${projectId}/equipment`);
  revalidatePath("/dashboard");
  revalidatePath("/my-equipment");
}

export async function createEquipmentItem(companyId: string, projectId: string, input: CreateEquipmentItemInput): Promise<ActionResult<EquipmentItem>> {
  const parsed = createEquipmentItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireEquipmentCatalogManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("create_equipment_item", {
      target_company_id: companyId,
      // target_project_id has no SQL default (always sent) but IS a
      // genuinely nullable column (null = company-wide item) — the
      // generated Args type omits `| null` for required keys regardless,
      // so this cast is necessary to send a real null over the wire. Same
      // pattern as modules/lmra/actions.ts's target_daily_team_id.
      target_project_id: parsed.data.projectId as string,
      target_tracking_mode: parsed.data.trackingMode as EquipmentItem["tracking_mode"],
      target_category: parsed.data.category,
      target_name: parsed.data.name,
      target_description: parsed.data.description ?? undefined,
      target_reference_number: parsed.data.referenceNumber ?? undefined,
      target_manufacturer: parsed.data.manufacturer ?? undefined,
      target_model: parsed.data.model ?? undefined,
      target_specification: parsed.data.specification ?? undefined,
      target_quantity: parsed.data.quantity,
      target_condition: parsed.data.condition as EquipmentItem["condition"],
      target_location: parsed.data.location ?? undefined,
      target_notes: parsed.data.notes ?? undefined,
      target_default_validity_days: parsed.data.defaultValidityDays ?? undefined,
      target_unit_price: parsed.data.unitPrice ?? undefined,
      target_currency: parsed.data.currency ?? undefined,
      target_requestable: parsed.data.requestable ?? true,
      target_purchase_date: parsed.data.purchaseDate || undefined,
    })
    .single();

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't add this item. Try again." } };
  }

  revalidateEquipmentPaths(companyId, projectId);
  return { ok: true, data: data as EquipmentItem };
}

export async function updateEquipmentItem(companyId: string, projectId: string, itemId: string, input: UpdateEquipmentItemInput): Promise<ActionResult<EquipmentItem>> {
  const parsed = updateEquipmentItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireEquipmentCatalogManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("update_equipment_item", {
      target_item_id: itemId,
      target_project_id: parsed.data.projectId as string,
      target_category: parsed.data.category,
      target_name: parsed.data.name,
      target_description: parsed.data.description ?? undefined,
      target_reference_number: parsed.data.referenceNumber ?? undefined,
      target_manufacturer: parsed.data.manufacturer ?? undefined,
      target_model: parsed.data.model ?? undefined,
      target_specification: parsed.data.specification ?? undefined,
      target_location: parsed.data.location ?? undefined,
      target_notes: parsed.data.notes ?? undefined,
      target_default_validity_days: parsed.data.defaultValidityDays ?? undefined,
      target_unit_price: parsed.data.unitPrice ?? undefined,
      target_currency: parsed.data.currency ?? undefined,
      target_requestable: parsed.data.requestable ?? true,
      target_purchase_date: parsed.data.purchaseDate || undefined,
    })
    .single();

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't update this item. Try again." } };
  }

  revalidateEquipmentPaths(companyId, projectId);
  return { ok: true, data: data as EquipmentItem };
}

/** Part 26 — the missing manual stock-adjustment path. Management-tier only; adjust_equipment_stock() itself refuses a resulting negative stock and requires a non-blank reason. */
export async function adjustEquipmentStock(companyId: string, projectId: string, itemId: string, input: AdjustEquipmentStockInput): Promise<ActionResult<EquipmentItem>> {
  const parsed = adjustEquipmentStockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireEquipmentCatalogManageAccess(companyId, projectId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_equipment_stock", { target_item_id: itemId, target_delta: parsed.data.delta, target_reason: parsed.data.reason }).single();

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't adjust stock. Try again." } };
  }

  revalidateEquipmentPaths(companyId, projectId);
  return { ok: true, data: data as EquipmentItem };
}

export async function issueEquipment(companyId: string, projectId: string, itemId: string, input: IssueEquipmentInput, requestId?: string): Promise<ActionResult<EquipmentAssignment>> {
  const parsed = issueEquipmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireEquipmentManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("issue_equipment", {
      target_item_id: itemId,
      target_employee_id: parsed.data.employeeId,
      target_quantity: parsed.data.quantity,
      target_condition_at_issue: parsed.data.conditionAtIssue as EquipmentAssignment["condition_at_issue"],
      target_issued_at: parsed.data.issuedAt,
      target_expected_return_at: parsed.data.expectedReturnAt || undefined,
      target_note: parsed.data.note ?? undefined,
      target_request_id: requestId,
      target_expires_at: parsed.data.expiresAt || undefined,
      target_use_default_validity: parsed.data.useDefaultValidity ?? true,
    })
    .single();

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't issue this item. Try again." } };
  }

  revalidateEquipmentPaths(companyId, projectId);
  return { ok: true, data: data as EquipmentAssignment };
}

export async function updateEquipmentAssignmentExpiry(
  companyId: string,
  projectId: string,
  assignmentId: string,
  input: UpdateEquipmentAssignmentExpiryInput,
): Promise<ActionResult<EquipmentAssignment>> {
  const parsed = updateEquipmentAssignmentExpirySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireEquipmentManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("update_equipment_assignment_expiry", {
      target_assignment_id: assignmentId,
      target_expires_at: parsed.data.expiresAt || undefined,
      target_reason: parsed.data.reason ?? undefined,
    })
    .single();

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't update this assignment's expiry. Try again." } };
  }

  revalidateEquipmentPaths(companyId, projectId);
  return { ok: true, data: data as EquipmentAssignment };
}

export async function returnEquipment(companyId: string, projectId: string, assignmentId: string, input: ReturnEquipmentInput): Promise<ActionResult<EquipmentAssignment>> {
  const parsed = returnEquipmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireEquipmentManageAccess(companyId, projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("return_equipment", {
      target_assignment_id: assignmentId,
      target_returned_quantity: parsed.data.returnedQuantity,
      target_condition_at_return: parsed.data.conditionAtReturn as EquipmentCondition,
      target_returned_at: parsed.data.returnedAt,
      target_note: parsed.data.note ?? undefined,
    })
    .single();

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't process this return. Try again." } };
  }

  revalidateEquipmentPaths(companyId, projectId);
  return { ok: true, data: data as EquipmentAssignment };
}

export async function markEquipmentDamaged(companyId: string, projectId: string, itemId: string, input: MarkEquipmentDamagedInput): Promise<ActionResult<EquipmentItem>> {
  const parsed = markEquipmentDamagedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A reason is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireEquipmentManageAccess(companyId, projectId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_equipment_damaged", { target_item_id: itemId, target_quantity: parsed.data.quantity, target_note: parsed.data.note }).single();

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't mark this item damaged. Try again." } };
  }

  revalidateEquipmentPaths(companyId, projectId);
  return { ok: true, data: data as EquipmentItem };
}

export async function markEquipmentLost(companyId: string, projectId: string, itemId: string, input: MarkEquipmentLostInput): Promise<ActionResult<EquipmentItem>> {
  const parsed = markEquipmentLostSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A reason is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireEquipmentManageAccess(companyId, projectId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_equipment_lost", { target_item_id: itemId, target_quantity: parsed.data.quantity, target_note: parsed.data.note }).single();

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't mark this item lost. Try again." } };
  }

  revalidateEquipmentPaths(companyId, projectId);
  return { ok: true, data: data as EquipmentItem };
}

export async function recoverEquipment(companyId: string, projectId: string, itemId: string, input: RecoverEquipmentInput): Promise<ActionResult<EquipmentItem>> {
  const parsed = recoverEquipmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireEquipmentManageAccess(companyId, projectId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recover_equipment", { target_item_id: itemId, target_quantity: parsed.data.quantity, target_note: parsed.data.note ?? "" }).single();

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't recover this item. Try again." } };
  }

  revalidateEquipmentPaths(companyId, projectId);
  return { ok: true, data: data as EquipmentItem };
}

export async function retireEquipmentItem(companyId: string, projectId: string, itemId: string, input: RetireEquipmentItemInput): Promise<ActionResult<EquipmentItem>> {
  const parsed = retireEquipmentItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireEquipmentManageAccess(companyId, projectId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("retire_equipment_item", { target_item_id: itemId, target_note: parsed.data.note ?? "" }).single();

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't retire this item. Try again." } };
  }

  revalidateEquipmentPaths(companyId, projectId);
  return { ok: true, data: data as EquipmentItem };
}

/**
 * Item 9 — an employee submits a request FOR THEMSELVES only. `employeeId`
 * is resolved server-side from the caller's own linked employee record,
 * never accepted from the client — the same "no arbitrary employee id"
 * guarantee every other self-service action in this codebase (absences,
 * leave, LMRA "Add My Today's Team") already provides. A plain RLS-gated
 * insert, not an RPC — equipment_requests_insert's own WITH CHECK already
 * enforces "own employee record only."
 */
export async function submitEquipmentRequest(companyId: string, projectId: string, input: SubmitEquipmentRequestInput): Promise<ActionResult<EquipmentRequest>> {
  const parsed = submitEquipmentRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  const { user } = await requireCompanyMembership(companyId);
  const employeeId = await getMyEmployeeId(companyId, user.id);
  if (!employeeId) {
    return { ok: false, error: { code: "server_error", message: "No employee record is linked to your account." } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_requests")
    .insert({
      company_id: companyId,
      project_id: projectId,
      employee_id: employeeId,
      equipment_item_id: parsed.data.equipmentItemId ?? null,
      item_description: parsed.data.itemDescription,
      specification: parsed.data.specification ?? null,
      quantity: parsed.data.quantity,
      reason: parsed.data.reason,
    })
    .select()
    .single();

  if (error) {
    if (isRlsViolation(error)) forbidden();
    return { ok: false, error: { code: "server_error", message: "Couldn't submit your request. Try again." } };
  }

  revalidateEquipmentPaths(companyId, projectId);
  return { ok: true, data: data as EquipmentRequest };
}

export async function approveEquipmentRequest(companyId: string, projectId: string, requestId: string, input: DecideEquipmentRequestInput): Promise<ActionResult<EquipmentRequest>> {
  const parsed = decideEquipmentRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "Check the highlighted fields.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireEquipmentManageAccess(companyId, projectId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_equipment_request", { target_request_id: requestId, target_comment: parsed.data.comment ?? undefined }).single();

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't approve this request. Try again." } };
  }

  revalidateEquipmentPaths(companyId, projectId);
  return { ok: true, data: data as EquipmentRequest };
}

export async function denyEquipmentRequest(companyId: string, projectId: string, requestId: string, input: DenyOrReturnEquipmentRequestInput): Promise<ActionResult<EquipmentRequest>> {
  const parsed = denyOrReturnEquipmentRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A reason is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireEquipmentManageAccess(companyId, projectId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("deny_equipment_request", { target_request_id: requestId, target_comment: parsed.data.comment }).single();

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't deny this request. Try again." } };
  }

  revalidateEquipmentPaths(companyId, projectId);
  return { ok: true, data: data as EquipmentRequest };
}

export async function returnEquipmentRequestForChanges(companyId: string, projectId: string, requestId: string, input: DenyOrReturnEquipmentRequestInput): Promise<ActionResult<EquipmentRequest>> {
  const parsed = denyOrReturnEquipmentRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "validation_error", message: "A comment is required.", fieldErrors: flattenFieldErrors(parsed.error) } };
  }

  await requireEquipmentManageAccess(companyId, projectId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("return_equipment_request", { target_request_id: requestId, target_comment: parsed.data.comment }).single();

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't return this request for changes. Try again." } };
  }

  revalidateEquipmentPaths(companyId, projectId);
  return { ok: true, data: data as EquipmentRequest };
}

/** Callable by the requesting employee (self-service cancel) OR management — RLS (equipment_requests_update) is the real "who" gate, matching cancel_leave_request's exact precedent. */
export async function cancelEquipmentRequest(companyId: string, projectId: string, requestId: string): Promise<ActionResult<EquipmentRequest>> {
  await requireCompanyMembership(companyId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_equipment_request", { target_request_id: requestId }).single();

  if (error) {
    if (isRlsViolation(error)) forbidden();
    if (isRaisedException(error)) return { ok: false, error: { code: "validation_error", message: error.message } };
    return { ok: false, error: { code: "server_error", message: "Couldn't cancel this request. Try again." } };
  }

  revalidateEquipmentPaths(companyId, projectId);
  return { ok: true, data: data as EquipmentRequest };
}
