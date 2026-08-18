import { getTranslations } from "next-intl/server";
import { requirePlatformSuperAdmin } from "@/lib/auth/session";
import { CreateCompanyWizard } from "@/modules/platform-admin/components/create-company-wizard";
import { PageHeader } from "@/components/shared/page-header";

/** Onboarding items 1/2 — the platform-super-admin-only entry point to create a brand-new company and assign its first administrator. */
export default async function CreateCompanyPage() {
  await requirePlatformSuperAdmin();
  const t = await getTranslations("PlatformAdmin.createCompany");

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="max-w-lg">
        <CreateCompanyWizard />
      </div>
    </div>
  );
}
