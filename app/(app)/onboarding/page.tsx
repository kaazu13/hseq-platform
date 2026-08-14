import Link from "next/link";
import { forbidden } from "next/navigation";
import { FolderKanban, UserPlus, Upload } from "lucide-react";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { createClient } from "@/lib/supabase/server";
import { getCompanyLogoPublicUrl } from "@/lib/storage/company-logos";
import { canAdministerCompany } from "@/modules/admin/permissions";
import { getOnboardingChecklist } from "@/modules/onboarding/queries";
import { OnboardingChecklist } from "@/modules/onboarding/components/onboarding-checklist";
import { CompanyBrandingSection } from "@/modules/companies/components/company-branding-section";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Items 3/4/26 — the onboarding checklist page. Item 6's explicit
 * "onboarding must not create a separate permanent project-admin system"
 * — this page only links to the EXISTING canonical destinations
 * (/projects/new, /employees/new, /employees/import, /admin/members); it
 * has no project/employee management of its own.
 */
export default async function OnboardingPage() {
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);
  if (!currentCompanyId) forbidden();

  const roleNames = await getUserRoleNames(currentCompanyId);
  if (!canAdministerCompany(roleNames)) forbidden();

  const [checklist, supabase] = await Promise.all([getOnboardingChecklist(currentCompanyId), createClient()]);
  const { data: companyRow } = await supabase.from("companies").select("logo_storage_path").eq("id", currentCompanyId).maybeSingle();
  const logoUrl = companyRow?.logo_storage_path ? getCompanyLogoPublicUrl(supabase, companyRow.logo_storage_path) : null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Company Setup" description="Get this company from zero to fully usable." />

      <OnboardingChecklist checklist={checklist} />

      <Card>
        <CardContent className="flex flex-wrap gap-2 pt-4">
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/projects/new" />}>
            <FolderKanban />
            Create a project
          </Button>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/employees/new" />}>
            <UserPlus />
            Add an employee
          </Button>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/employees/import" />}>
            <Upload />
            Import employees
          </Button>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/admin/members" />}>
            <UserPlus />
            Invite a member
          </Button>
        </CardContent>
      </Card>

      <CompanyBrandingSection companyId={currentCompanyId} companyName={checklist.companyName} logoUrl={logoUrl} />
    </div>
  );
}
