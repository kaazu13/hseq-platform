import { createClient } from "@/lib/supabase/server";
import type { PageSize } from "@/lib/pagination";
import { offsetFor } from "@/lib/pagination";
import type {
  EquipmentItem,
  EquipmentAssignmentWithDetail,
  EquipmentRequestWithDetail,
  EquipmentHistoryEntryWithDetail,
  EquipmentStatus,
  EquipmentCondition,
  EquipmentRequestStatus,
  BasicEmployee,
} from "./types";
import { describeEquipmentExpiry } from "./types";

/**
 * Server-only data access for the Equipment domain — see
 * docs/API_CONVENTIONS.md §7. No PostgREST embeds, same convention as
 * every other module this codebase — batched follow-up queries via
 * get_basic_employee_info(), merged in JS.
 */

const HISTORY_LIST_LIMIT = 200;
const REQUESTS_LIST_LIMIT = 200;
const ASSIGNMENTS_LIST_LIMIT = 200;

export type EquipmentOwnershipFilter = "all" | "company" | "project";

export type EquipmentItemListFilters = {
  search?: string;
  category?: string;
  status?: EquipmentStatus | "all";
  condition?: EquipmentCondition | "all";
  ownership?: EquipmentOwnershipFilter;
  includeArchived?: boolean;
};

/** A single page of equipment items visible in `projectId`'s context (company-wide items plus this project's own, or filtered to just one via `filters.ownership`) — item 3's "design for hundreds/thousands" requirement, paginated via lib/pagination.ts. */
export async function listEquipmentItems(companyId: string, projectId: string, filters: EquipmentItemListFilters, page: number, pageSize: PageSize): Promise<EquipmentItem[]> {
  const supabase = await createClient();
  const offset = offsetFor(page, pageSize);

  let query = supabase.from("equipment_items").select("*").eq("company_id", companyId);
  const ownership = filters.ownership ?? "all";
  if (ownership === "company") query = query.is("project_id", null);
  else if (ownership === "project") query = query.eq("project_id", projectId);
  else query = query.or(`project_id.eq.${projectId},project_id.is.null`);

  if (!filters.includeArchived) query = query.is("archived_at", null);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.condition && filters.condition !== "all") query = query.eq("condition", filters.condition);
  if (filters.search?.trim()) {
    const term = filters.search.trim();
    query = query.or(`name.ilike.%${term}%,category.ilike.%${term}%,reference_number.ilike.%${term}%,description.ilike.%${term}%`);
  }

  const { data, error } = await query.order("name", { ascending: true }).range(offset, offset + pageSize - 1);
  if (error) throw error;
  return data ?? [];
}

export async function countEquipmentItems(companyId: string, projectId: string, filters: EquipmentItemListFilters): Promise<number> {
  const supabase = await createClient();

  let query = supabase.from("equipment_items").select("id", { count: "exact", head: true }).eq("company_id", companyId);
  const ownership = filters.ownership ?? "all";
  if (ownership === "company") query = query.is("project_id", null);
  else if (ownership === "project") query = query.eq("project_id", projectId);
  else query = query.or(`project_id.eq.${projectId},project_id.is.null`);

  if (!filters.includeArchived) query = query.is("archived_at", null);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.condition && filters.condition !== "all") query = query.eq("condition", filters.condition);
  if (filters.search?.trim()) {
    const term = filters.search.trim();
    query = query.or(`name.ilike.%${term}%,category.ilike.%${term}%,reference_number.ilike.%${term}%,description.ilike.%${term}%`);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/** Every distinct category currently in use for `companyId` — powers the filter dropdown without a separate lookup table. */
export async function listEquipmentCategories(companyId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("equipment_items").select("category").eq("company_id", companyId).is("archived_at", null);
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.category))].sort((a, b) => a.localeCompare(b));
}

export async function getEquipmentItem(companyId: string, itemId: string): Promise<EquipmentItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("equipment_items").select("*").eq("company_id", companyId).eq("id", itemId).maybeSingle();
  if (error) throw error;
  return data;
}

const EXPORT_ROW_LIMIT = 10000;

/** Every item visible in `projectId`'s context, unpaginated (capped at EXPORT_ROW_LIMIT) — for the Excel export only, which needs the full set rather than one page. */
export async function listAllEquipmentItemsForExport(companyId: string, projectId: string): Promise<EquipmentItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_items")
    .select("*")
    .eq("company_id", companyId)
    .or(`project_id.eq.${projectId},project_id.is.null`)
    .order("name", { ascending: true })
    .limit(EXPORT_ROW_LIMIT);
  if (error) throw error;
  return data ?? [];
}

/** Candidate items a request/issue picker can select from — available (not retired/lost/out_of_service), visible in this project's context. Never a raw unfiltered list of every historical item. */
export async function listEquipmentCandidateItems(companyId: string, projectId: string): Promise<EquipmentItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_items")
    .select("*")
    .eq("company_id", companyId)
    .or(`project_id.eq.${projectId},project_id.is.null`)
    .is("archived_at", null)
    .in("status", ["available", "issued"])
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Employee ids currently rostered onto `projectId` — the same "only project-assigned employees are selectable" convention as modules/lmra/queries.ts's listLmraCandidateEmployees, reused for the Issue Equipment employee picker. */
export async function listEquipmentCandidateEmployees(companyId: string, projectId: string): Promise<BasicEmployee[]> {
  const supabase = await createClient();
  const { data: roster, error: rosterError } = await supabase.from("project_assignments").select("employee_id").eq("company_id", companyId).eq("project_id", projectId).is("end_at", null);
  if (rosterError) throw rosterError;
  const employeeIds = [...new Set((roster ?? []).map((row) => row.employee_id))];
  if (employeeIds.length === 0) return [];

  const { data, error } = await supabase.rpc("get_basic_employee_info", { target_employee_ids: employeeIds });
  if (error) throw error;
  return (data ?? []).sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
}

async function resolveEmployeesById(companyId: string, employeeIds: string[]): Promise<Map<string, BasicEmployee>> {
  const supabase = await createClient();
  const ids = [...new Set(employeeIds)];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.rpc("get_basic_employee_info", { target_employee_ids: ids });
  if (error) throw error;
  return new Map((data ?? []).map((e) => [e.id, e]));
}

/** Resolves "issued by" display names — same sanctioned channel as modules/leave-requests/queries.ts's resolveDeciderNames (get_basic_profile_info), scoped to companyId. */
async function resolveProfileNames(companyId: string, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_basic_profile_info", { target_company_id: companyId, target_user_ids: ids });
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row.full_name]));
}

export type EquipmentAssignmentListFilters = {
  status?: "active" | "returned" | "lost" | "written_off" | "all";
  search?: string;
  /** Part 10's "Expiring soon / Expired" quick filters — computed in JS from expires_at (describeEquipmentExpiry's own thresholds), not a DB column filter. */
  expiry?: "all" | "expiring_soon" | "expired";
};

/** The "Issued" tab — every assignment for items in `projectId`'s context, resolved with employee + item display fields. */
export async function listEquipmentAssignments(companyId: string, projectId: string, filters: EquipmentAssignmentListFilters = {}): Promise<EquipmentAssignmentWithDetail[]> {
  const supabase = await createClient();

  const { data: itemRows, error: itemsError } = await supabase
    .from("equipment_items")
    .select("id, name, reference_number, category, tracking_mode")
    .eq("company_id", companyId)
    .or(`project_id.eq.${projectId},project_id.is.null`);
  if (itemsError) throw itemsError;
  const itemById = new Map((itemRows ?? []).map((item) => [item.id, item]));
  const itemIds = [...itemById.keys()];
  if (itemIds.length === 0) return [];

  let query = supabase.from("equipment_assignments").select("*").eq("company_id", companyId).in("equipment_item_id", itemIds);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  const { data: assignmentRows, error: assignmentsError } = await query.order("issued_at", { ascending: false }).limit(ASSIGNMENTS_LIST_LIMIT);
  if (assignmentsError) throw assignmentsError;

  const employeeById = await resolveEmployeesById(companyId, (assignmentRows ?? []).map((row) => row.employee_id));
  const issuedByNameById = await resolveProfileNames(companyId, (assignmentRows ?? []).map((row) => row.issued_by).filter((id): id is string => Boolean(id)));

  return (assignmentRows ?? [])
    .map((row) => {
      const employee = employeeById.get(row.employee_id);
      const item = itemById.get(row.equipment_item_id);
      if (!employee || !item) return null;
      return { ...row, employee, item, issuedByName: row.issued_by ? (issuedByNameById.get(row.issued_by) ?? null) : null };
    })
    .filter((row): row is EquipmentAssignmentWithDetail => row !== null)
    .filter((row) => {
      if (!filters.search?.trim()) return true;
      const term = filters.search.trim().toLowerCase();
      return (
        row.item.name.toLowerCase().includes(term) ||
        (row.item.reference_number ?? "").toLowerCase().includes(term) ||
        `${row.employee.first_name} ${row.employee.last_name}`.toLowerCase().includes(term)
      );
    })
    .filter((row) => {
      if (!filters.expiry || filters.expiry === "all") return true;
      if (!row.expires_at) return false;
      const tone = describeEquipmentExpiry(row.expires_at).tone;
      if (filters.expiry === "expired") return tone === "negative";
      if (filters.expiry === "expiring_soon") return tone === "attention";
      return true;
    });
}

/** An employee's own currently-issued equipment — item 6/13's "employees see their own issued equipment" requirement. Active assignments only, unless includeHistory is set. */
export async function listMyEquipmentAssignments(companyId: string, employeeId: string, includeHistory = false): Promise<EquipmentAssignmentWithDetail[]> {
  const supabase = await createClient();
  let query = supabase.from("equipment_assignments").select("*").eq("company_id", companyId).eq("employee_id", employeeId);
  if (!includeHistory) query = query.eq("status", "active");
  const { data: assignmentRows, error } = await query.order("issued_at", { ascending: false }).limit(ASSIGNMENTS_LIST_LIMIT);
  if (error) throw error;
  if (!assignmentRows || assignmentRows.length === 0) return [];

  const itemIds = [...new Set(assignmentRows.map((row) => row.equipment_item_id))];
  const { data: itemRows, error: itemsError } = await supabase.from("equipment_items").select("id, name, reference_number, category, tracking_mode").in("id", itemIds);
  if (itemsError) throw itemsError;
  const itemById = new Map((itemRows ?? []).map((item) => [item.id, item]));

  const employeeById = await resolveEmployeesById(companyId, [employeeId]);
  const employee = employeeById.get(employeeId);
  if (!employee) return [];

  const issuedByNameById = await resolveProfileNames(companyId, assignmentRows.map((row) => row.issued_by).filter((id): id is string => Boolean(id)));

  return assignmentRows
    .map((row) => {
      const item = itemById.get(row.equipment_item_id);
      if (!item) return null;
      return { ...row, employee, item, issuedByName: row.issued_by ? (issuedByNameById.get(row.issued_by) ?? null) : null };
    })
    .filter((row): row is EquipmentAssignmentWithDetail => row !== null);
}

export type EquipmentRequestListFilters = {
  status?: EquipmentRequestStatus | "all";
};

/** The "Requests" review tab — every request for `projectId`, resolved with employee display fields. */
export async function listEquipmentRequests(companyId: string, projectId: string, filters: EquipmentRequestListFilters = {}): Promise<EquipmentRequestWithDetail[]> {
  const supabase = await createClient();
  let query = supabase.from("equipment_requests").select("*").eq("company_id", companyId).eq("project_id", projectId);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  const { data: rows, error } = await query.order("created_at", { ascending: false }).limit(REQUESTS_LIST_LIMIT);
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const employeeById = await resolveEmployeesById(companyId, rows.map((row) => row.employee_id));
  return rows.map((row) => ({ ...row, employee: employeeById.get(row.employee_id) as BasicEmployee })).filter((row) => Boolean(row.employee));
}

/** An employee's own requests — item 13's "My Equipment" personal view. */
export async function listMyEquipmentRequests(companyId: string, employeeId: string): Promise<EquipmentRequestWithDetail[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase.from("equipment_requests").select("*").eq("company_id", companyId).eq("employee_id", employeeId).order("created_at", { ascending: false }).limit(REQUESTS_LIST_LIMIT);
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const employeeById = await resolveEmployeesById(companyId, [employeeId]);
  const employee = employeeById.get(employeeId);
  if (!employee) return [];
  return rows.map((row) => ({ ...row, employee }));
}

/** Full item-level history for one equipment item, newest first — item 14's "every meaningful lifecycle action reconstructable" requirement. */
export async function listEquipmentHistory(companyId: string, itemId: string): Promise<EquipmentHistoryEntryWithDetail[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase.from("equipment_history").select("*").eq("company_id", companyId).eq("equipment_item_id", itemId).order("created_at", { ascending: false }).limit(HISTORY_LIST_LIMIT);
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const employeeIds = rows.map((row) => row.employee_id).filter((id): id is string => Boolean(id));
  const employeeById = await resolveEmployeesById(companyId, employeeIds);
  return rows.map((row) => ({ ...row, employee: row.employee_id ? (employeeById.get(row.employee_id) ?? null) : null }));
}

export type EquipmentOverviewCounts = {
  pendingRequests: number;
  activeAssignments: number;
  itemsRequiringAttention: number;
};

/** Compact counts for the Equipment page header/badges — every number here is a real, scoped query result, never a fabricated metric. */
export async function getEquipmentOverviewCounts(companyId: string, projectId: string): Promise<EquipmentOverviewCounts> {
  const supabase = await createClient();

  const [pendingRequests, itemsAttention] = await Promise.all([
    supabase.from("equipment_requests").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("project_id", projectId).eq("status", "pending"),
    supabase.from("equipment_items").select("id", { count: "exact", head: true }).eq("company_id", companyId).or(`project_id.eq.${projectId},project_id.is.null`).in("status", ["out_of_service", "lost"]).is("archived_at", null),
  ]);
  if (pendingRequests.error) throw pendingRequests.error;
  if (itemsAttention.error) throw itemsAttention.error;

  const { data: itemRows, error: itemsError } = await supabase.from("equipment_items").select("id").eq("company_id", companyId).or(`project_id.eq.${projectId},project_id.is.null`);
  if (itemsError) throw itemsError;
  const itemIds = (itemRows ?? []).map((row) => row.id);
  let activeAssignments = 0;
  if (itemIds.length > 0) {
    const { count, error } = await supabase.from("equipment_assignments").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "active").in("equipment_item_id", itemIds);
    if (error) throw error;
    activeAssignments = count ?? 0;
  }

  return {
    pendingRequests: pendingRequests.count ?? 0,
    activeAssignments,
    itemsRequiringAttention: itemsAttention.count ?? 0,
  };
}
