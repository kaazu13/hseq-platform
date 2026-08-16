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

/**
 * Part 2 additions — Platform Admin console (Overview, Companies, Users,
 * Roles & Permissions, Security, Audit Log, Usage & Billing, Settings).
 * These are thin row-shape aliases over the platform_admin_* RPCs added in
 * supabase/migrations/20260901090000_platform_admin_console.sql, mirroring
 * PlatformAccountSearchResult/PlatformAccountMembership's own convention
 * exactly — friendly labels, never raw enums/uuids, in front of the UI.
 */

export type CompanyStatus = Enums<"company_status">;
export type ProjectStatus = Enums<"project_status">;
export type EmployeeAccountStatus = Enums<"employee_account_status">;
export type MembershipStatus = Enums<"membership_status">;
export type CompanySubscriptionStatus = Enums<"company_subscription_status">;
export type AuditAction = Enums<"audit_action">;
export type PermissionScopeType = Enums<"permission_scope_type">;

export const COMPANY_STATUS_LABELS: Record<CompanyStatus, string> = {
  trial: "Trial",
  active: "Active",
  suspended: "Suspended",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

export const EMPLOYEE_ACCOUNT_STATUS_LABELS: Record<EmployeeAccountStatus, string> = {
  draft: "Draft (no login)",
  invited: "Invited",
  pending_activation: "Pending activation",
  active: "Active",
  suspended: "Suspended",
  archived: "Archived",
};

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  invited: "Invited",
  active: "Active",
  suspended: "Suspended",
  removed: "Removed",
};

export const COMPANY_SUBSCRIPTION_STATUS_LABELS: Record<CompanySubscriptionStatus, string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
  paused: "Paused",
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  restore: "Restored",
  approve: "Approved",
  reject: "Rejected",
  sign: "Signed",
  close: "Closed",
  amend: "Amended",
  archive: "Archived",
  end_employment: "Ended employment",
  rehire: "Rehired",
};

/** Friendly domain labels for the permission catalogue — falls back to the raw key if a new domain is added to the seeded catalogue without a matching label here. */
export const PERMISSION_DOMAIN_LABELS: Record<string, string> = {
  scaffold: "Scaffold Register",
  scaffold_inspections: "Scaffold Inspections",
  today_teams: "Today's Teams",
  attendance: "Attendance",
  worked_hours: "Worked Hours",
  lmra: "LMRA",
  observations: "Safety Observations",
  corrective_actions: "Corrective Actions",
  equipment: "Equipment",
  employees: "Employees",
  projects: "Projects",
  reporting: "Reporting",
  company_admin: "Company Administration",
};

export type OverviewStats = {
  active_companies: number;
  trial_companies: number;
  suspended_companies: number;
  active_projects: number;
  total_employees: number;
  active_employees: number;
  activated_users: number;
  pending_invitations: number;
  suspended_accounts: number;
  banned_accounts: number;
  active_platform_warnings: number;
  companies_without_admin_count: number;
};

export type CompanyWithoutAdmin = { id: string; name: string; status: CompanyStatus; created_at: string };

export type AdminCompanyListItem = {
  id: string;
  name: string;
  slug: string;
  status: CompanyStatus;
  logo_storage_path: string | null;
  created_at: string;
  active_employee_count: number;
  activated_user_count: number;
  active_project_count: number;
  pending_invitation_count: number;
  admin_names: string[];
  subscription_plan_name: string | null;
  subscription_status: CompanySubscriptionStatus | null;
  employee_limit: number | null;
  project_limit: number | null;
  total_count: number;
};

export type AdminCompanySearchResult = { id: string; name: string; status: CompanyStatus };

export type AdminCompanyDetail = {
  id: string;
  name: string;
  slug: string;
  status: CompanyStatus;
  logo_storage_path: string | null;
  employee_number_prefix: string;
  created_at: string;
  total_employees: number;
  active_employees: number;
  active_memberships: number;
  active_projects: number;
  pending_invitations: number;
  admin_names: string[];
};

export type AdminCompanyMember = {
  membership_id: string;
  user_id: string;
  full_name: string;
  email: string;
  status: MembershipStatus;
  role_names: string[];
  role_ids: string[];
  joined_at: string | null;
};

export type AdminCompanyProject = { id: string; name: string; status: ProjectStatus; created_at: string };

export type AdminCompanyEmployee = {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  employment_status: Database["public"]["Enums"]["employment_status"];
  account_status: EmployeeAccountStatus;
  position_title: string | null;
  profile_id: string | null;
};

export type AdminAccountListItem = {
  id: string;
  full_name: string;
  email: string;
  account_status: AccountStatus;
  account_status_reason: string | null;
  created_at: string;
  total_count: number;
};

export type AdminSecurityEventItem = {
  id: string;
  user_id: string | null;
  user_full_name: string | null;
  event_type: SecurityEventType;
  actor_user_id: string | null;
  actor_full_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  detail: string | null;
  created_at: string;
  total_count: number;
};

export type AdminAuditEventItem = {
  id: string;
  company_id: string | null;
  company_name: string | null;
  actor_user_id: string | null;
  actor_full_name: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  changes: unknown;
  created_at: string;
  total_count: number;
};

export type PlatformSuperAdminRosterItem = {
  user_id: string;
  full_name: string;
  email: string;
  granted_at: string;
  granted_by: string | null;
  granted_by_name: string | null;
  notes: string | null;
};

export type PermissionCatalogueItem = Database["public"]["Tables"]["permissions"]["Row"];
export type RoleRow = Database["public"]["Tables"]["roles"]["Row"];
export type CompanySubscription = Database["public"]["Tables"]["company_subscriptions"]["Row"];
