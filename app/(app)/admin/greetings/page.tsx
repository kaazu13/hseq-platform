import { forbidden } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PartyPopper } from "lucide-react";
import { requireUser, getUserRoleNames } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { listGreetingSettings } from "@/modules/greetings/queries";
import { canManageGreetingSettings } from "@/modules/greetings/permissions";
import { GreetingSettingCard } from "@/modules/greetings/components/greeting-setting-card";
import { PageHeader } from "@/components/shared/page-header";

/**
 * Task 3 Part 8 — company_admin-only configuration for the automated
 * birthday/Christmas/New Year/Easter greetings. Every setting row already
 * exists (seeded automatically at company creation) — this page only ever
 * edits, never creates.
 */
export default async function AdminGreetingsPage() {
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);

  if (!currentCompanyId) {
    forbidden();
  }

  const roleNames = await getUserRoleNames(currentCompanyId);
  if (!canManageGreetingSettings(roleNames)) {
    forbidden();
  }

  const [settings, t] = await Promise.all([listGreetingSettings(currentCompanyId), getTranslations("CompanyGreetings")]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {settings.map((setting) => (
          <GreetingSettingCard key={setting.id} companyId={currentCompanyId} setting={setting} />
        ))}
      </div>

      {settings.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <PartyPopper className="size-8" />
          <p className="text-sm">{t("noSettingsFound")}</p>
        </div>
      )}
    </div>
  );
}
