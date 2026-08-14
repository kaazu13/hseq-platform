import { createClient } from "@/lib/supabase/server";
import type { PlatformAccountSearchResult, PlatformAccountMembership, SecurityEvent, PlatformWarning } from "./types";

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
