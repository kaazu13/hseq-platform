import type { Database, Enums } from "@/types/database";

/**
 * Platform Administrator account/security controls — Phases 12-14. Global,
 * NOT company-scoped — see supabase/migrations/20260819095000_platform_admin.sql's
 * header comment for why this is a genuinely new authorization tier
 * (platform_super_admins), not a repurposing of company_admin.
 */

export type AccountStatus = Enums<"account_status">;
export type SecurityEventType = Enums<"security_event_type">;
export type SecurityEvent = Database["public"]["Tables"]["security_events"]["Row"];
export type PlatformWarning = Database["public"]["Tables"]["platform_warnings"]["Row"];

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  banned: "Banned",
};

export const SECURITY_EVENT_TYPE_LABELS: Record<SecurityEventType, string> = {
  login_success: "Login",
  login_failed: "Failed login attempt",
  logout: "Logout",
  account_suspended: "Account suspended",
  account_banned: "Account banned",
  account_restored: "Account restored",
  platform_warning_issued: "Platform warning issued",
  sessions_revoked: "Sessions revoked",
};

export type PlatformAccountSearchResult = {
  id: string;
  full_name: string;
  email: string;
  account_status: AccountStatus;
  account_status_reason: string | null;
  created_at: string;
};

export type PlatformAccountMembership = {
  company_id: string;
  company_name: string;
  membership_status: Database["public"]["Enums"]["membership_status"];
  role_names: string[] | null;
};
