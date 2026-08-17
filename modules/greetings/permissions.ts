import type { RoleName } from "@/modules/companies/types";

/** Greeting settings are company_admin only — mirrors company_greeting_settings_manage's RLS exactly (supabase/migrations/20260901112000_company_greetings.sql). Deliberately narrower than modules/admin/permissions.ts's COMPANY_ADMIN_ROLES (which also includes operations_manager) — greetings are branding/culture configuration, not workforce administration. */
export function canManageGreetingSettings(roleNames: RoleName[]): boolean {
  return roleNames.includes("company_admin");
}
