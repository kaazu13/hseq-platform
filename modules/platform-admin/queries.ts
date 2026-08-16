import { createClient } from "@/lib/supabase/server";
import type {
  PlatformAccountSearchResult,
  PlatformAccountMembership,
  SecurityEvent,
  PlatformWarning,
  OverviewStats,
  CompanyWithoutAdmin,
  AdminCompanyListItem,
  AdminCompanySearchResult,
  AdminCompanyDetail,
  AdminCompanyMember,
  AdminCompanyProject,
  AdminCompanyEmployee,
  AdminAccountListItem,
  AdminSecurityEventItem,
  AdminAuditEventItem,
  PlatformSuperAdminRosterItem,
  PermissionCatalogueItem,
  RoleRow,
  CompanySubscription,
  AuditAction,
} from "./types";
import type { Database } from "@/types/database";

/** Server-only data access for Platform Administrator views (Phases 12-14). Every RPC here is itself gated by is_platform_super_admin() server-side — these are thin wrappers, not an independent authorization layer. */

/**
 * Non-throwing "is the CURRENT caller a platform super admin" check — used
 * purely for UI decisions (showing the /platform-admin nav link and the
 * Onboarding "Create Company" entry point to the right people) where a
 * boolean is what's needed, not requirePlatformSuperAdmin()'s throw/forbid
 * behavior. Every actual mutation still goes through requirePlatformSuperAdmin()
 * or a SECURITY DEFINER RPC's own is_platform_super_admin() check — this
 * is never the authorization boundary itself.
 */
export async function isCurrentUserPlatformSuperAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_platform_super_admin");
  if (error) return false;
  return data ?? false;
}

export async function searchPlatformAccounts(query: string | null, limit = 50): Promise<PlatformAccountSearchResult[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_admin_search_accounts", { search_query: query ?? undefined, limit_count: limit });
  if (error) throw error;
  return data ?? [];
}

export async function getPlatformAccountMemberships(userId: string): Promise<PlatformAccountMembership[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_admin_get_memberships", { target_user_id: userId });
  if (error) throw error;
  return (data ?? []).map((row) => ({ company_id: row.company_id, company_name: row.company_name, membership_status: row.membership_status, role_names: row.role_names }));
}

/** Full security/login history for a user — platform-admin view (Phase 14). */
export async function listSecurityEventsForUser(userId: string, limit = 100): Promise<SecurityEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("security_events").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** The calling user's OWN security history — "a user can see their own events only" (RLS-enforced, this query just reflects that). */
export async function listMySecurityEvents(userId: string, limit = 50): Promise<SecurityEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("security_events").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listPlatformWarningsForUser(userId: string): Promise<PlatformWarning[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("platform_warnings").select("*").eq("user_id", userId).order("issued_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** The calling user's own platform warnings — never surfaced inside project HSEQ observation statistics (Phase 13). */
export async function listMyPlatformWarnings(userId: string): Promise<PlatformWarning[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("platform_warnings").select("*").eq("user_id", userId).order("issued_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Part 2 — Platform Admin console data access. Every function below wraps
 * a platform_admin_* RPC (supabase/migrations/20260901090000_platform_admin_console.sql),
 * each independently gated by is_platform_super_admin() server-side —
 * these are thin wrappers, not an independent authorization layer, same
 * discipline as every function above. None of these tables' plain RLS
 * grants a platform admin (who is usually not a member of the company in
 * question) a bypass — confirmed by inspection before writing the RPCs —
 * so a raw `.from(...)` select here would silently return an empty result
 * instead of throwing; every one of these MUST go through its RPC.
 */

export async function getPlatformOverviewStats(): Promise<OverviewStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_admin_get_overview_stats").single();
  if (error) throw error;
  return data as OverviewStats;
}

export async function listCompaniesWithoutAdmin(limit = 100): Promise<CompanyWithoutAdmin[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_admin_list_companies_without_admin", { limit_count: limit });
  if (error) throw error;
  return data ?? [];
}

export async function listAdminCompanies(query: string | null, page: number, pageSize = 20): Promise<{ items: AdminCompanyListItem[]; totalCount: number }> {
  const supabase = await createClient();
  const offset = Math.max(0, (page - 1) * pageSize);
  const { data, error } = await supabase.rpc("platform_admin_list_companies", { search_query: query ?? undefined, limit_count: pageSize, offset_count: offset });
  if (error) throw error;
  const rows = (data ?? []) as AdminCompanyListItem[];
  return { items: rows, totalCount: rows[0]?.total_count ?? 0 };
}

export async function searchAdminCompanies(query: string | null, limit = 20): Promise<AdminCompanySearchResult[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_admin_search_companies", { search_query: query ?? undefined, limit_count: limit });
  if (error) throw error;
  return data ?? [];
}

export async function getAdminCompanyDetail(companyId: string): Promise<AdminCompanyDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_admin_get_company_detail", { target_company_id: companyId });
  if (error) throw error;
  return (data ?? [])[0] ?? null;
}

export async function listAdminCompanyMembers(companyId: string): Promise<AdminCompanyMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_admin_list_company_members", { target_company_id: companyId });
  if (error) throw error;
  return data ?? [];
}

export async function listAdminCompanyProjects(companyId: string): Promise<AdminCompanyProject[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_admin_list_company_projects", { target_company_id: companyId });
  if (error) throw error;
  return data ?? [];
}

export async function listAdminCompanyEmployees(companyId: string): Promise<AdminCompanyEmployee[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_admin_list_company_employees", { target_company_id: companyId });
  if (error) throw error;
  return data ?? [];
}

export type AdminAccountFilters = {
  query?: string | null;
  accountStatus?: Database["public"]["Enums"]["account_status"] | null;
  companyId?: string | null;
  roleName?: string | null;
};

export async function listAdminAccounts(filters: AdminAccountFilters, page: number, pageSize = 25): Promise<{ items: AdminAccountListItem[]; totalCount: number }> {
  const supabase = await createClient();
  const offset = Math.max(0, (page - 1) * pageSize);
  const { data, error } = await supabase.rpc("platform_admin_list_accounts", {
    search_query: filters.query || undefined,
    filter_account_status: filters.accountStatus ?? undefined,
    filter_company_id: filters.companyId ?? undefined,
    filter_role_name: filters.roleName ?? undefined,
    limit_count: pageSize,
    offset_count: offset,
  });
  if (error) throw error;
  const rows = (data ?? []) as AdminAccountListItem[];
  return { items: rows, totalCount: rows[0]?.total_count ?? 0 };
}

export async function listAdminSecurityEvents(page: number, pageSize = 50): Promise<{ items: AdminSecurityEventItem[]; totalCount: number }> {
  const supabase = await createClient();
  const offset = Math.max(0, (page - 1) * pageSize);
  const { data, error } = await supabase.rpc("platform_admin_list_security_events", { limit_count: pageSize, offset_count: offset });
  if (error) throw error;
  const rows = (data ?? []) as AdminSecurityEventItem[];
  return { items: rows, totalCount: rows[0]?.total_count ?? 0 };
}

export type AdminAuditFilters = {
  actorUserId?: string | null;
  action?: AuditAction | null;
  entityType?: string | null;
  companyId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
};

export async function listAdminAuditEvents(filters: AdminAuditFilters, page: number, pageSize = 50): Promise<{ items: AdminAuditEventItem[]; totalCount: number }> {
  const supabase = await createClient();
  const offset = Math.max(0, (page - 1) * pageSize);
  const { data, error } = await supabase.rpc("platform_admin_list_audit_events", {
    filter_actor_user_id: filters.actorUserId ?? undefined,
    filter_action: filters.action ?? undefined,
    filter_entity_type: filters.entityType || undefined,
    filter_company_id: filters.companyId ?? undefined,
    filter_date_from: filters.dateFrom ?? undefined,
    filter_date_to: filters.dateTo ?? undefined,
    limit_count: pageSize,
    offset_count: offset,
  });
  if (error) throw error;
  const rows = (data ?? []) as AdminAuditEventItem[];
  return { items: rows, totalCount: rows[0]?.total_count ?? 0 };
}

export async function listPlatformSuperAdminRoster(): Promise<PlatformSuperAdminRosterItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_admin_list_super_admins");
  if (error) throw error;
  return data ?? [];
}

/**
 * Roles & Permissions page. `roles`/`permissions`/`role_permissions` all
 * already grant a platform admin a direct RLS bypass (added in
 * 20260831092000_roles_permissions_foundation.sql) — no RPC wrapper
 * needed, plain `.from()` queries work.
 */
export async function listSystemRoles(): Promise<RoleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("roles").select("*").eq("is_system", true).order("name");
  if (error) throw error;
  return data ?? [];
}

export async function listCustomRolesForCompany(companyId: string): Promise<RoleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("roles").select("*").eq("company_id", companyId).eq("is_system", false).order("name");
  if (error) throw error;
  return data ?? [];
}

export async function listPermissionsCatalogue(): Promise<PermissionCatalogueItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("permissions").select("*").order("domain").order("key");
  if (error) throw error;
  return data ?? [];
}

export async function listRolePermissionKeys(roleId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("role_permissions").select("permissions(key)").eq("role_id", roleId);
  if (error) throw error;
  return (data ?? []).map((row) => (row.permissions as { key: string } | null)?.key).filter((key): key is string => Boolean(key));
}

/** Batched form of listRolePermissionKeys — one round trip for the whole system-roles list, instead of 11. */
export async function listRolePermissionsForRoles(roleIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (roleIds.length === 0) return result;
  const supabase = await createClient();
  const { data, error } = await supabase.from("role_permissions").select("role_id, permissions(key)").in("role_id", roleIds);
  if (error) throw error;
  for (const row of data ?? []) {
    const key = (row.permissions as { key: string } | null)?.key;
    if (!key) continue;
    const list = result.get(row.role_id) ?? [];
    list.push(key);
    result.set(row.role_id, list);
  }
  return result;
}

export async function getCompanySubscription(companyId: string): Promise<CompanySubscription | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("company_subscriptions").select("*").eq("company_id", companyId).maybeSingle();
  if (error) throw error;
  return data;
}
