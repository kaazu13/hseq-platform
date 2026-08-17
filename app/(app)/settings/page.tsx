import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { createClient } from "@/lib/supabase/server";
import { getCompanyLogoPublicUrl } from "@/lib/storage/company-logos";
import { CompanyBrandingSection } from "@/modules/companies/components/company-branding-section";
import { AppearanceSection } from "@/modules/appearance/components/appearance-section";
import { LanguageRegionSection } from "@/modules/locale-preference/components/language-region-section";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Settings as SettingsIcon } from "lucide-react";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/i18n/locale";

const COMPANY_BRANDING_ROLES = ["company_admin", "operations_manager"];

/** Settings — company branding (Phase 15, company_admin/operations_manager only) + Appearance (Phase 18, every user). */
export default async function SettingsPage() {
  const { user } = await requireUser();
  const { companies, currentCompanyId } = await resolveCurrentCompany(user.id);
  const current = companies.find((company) => company.id === currentCompanyId) ?? companies[0];

  if (!current) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title="Settings" />
        <EmptyState icon={SettingsIcon} title="No company selected" className="flex-1" />
      </div>
    );
  }

  const [roleNames, supabase] = await Promise.all([getUserRoleNames(current.id), createClient()]);
  const canManageBranding = roleNames.some((role) => COMPANY_BRANDING_ROLES.includes(role));

  let logoUrl: string | null = null;
  if (canManageBranding) {
    const { data: companyRow } = await supabase.from("companies").select("logo_storage_path").eq("id", current.id).maybeSingle();
    if (companyRow?.logo_storage_path) logoUrl = getCompanyLogoPublicUrl(supabase, companyRow.logo_storage_path);
  }

  const { data: profileRow } = await supabase.from("profiles").select("locale").eq("id", user.id).maybeSingle();
  const currentLocale = profileRow && isSupportedLocale(profileRow.locale) ? profileRow.locale : DEFAULT_LOCALE;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Settings" />

      <AppearanceSection />

      <LanguageRegionSection currentLocale={currentLocale} />

      {canManageBranding && <CompanyBrandingSection companyId={current.id} companyName={current.name} logoUrl={logoUrl} />}
    </div>
  );
}
