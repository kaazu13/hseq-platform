import { UserCog } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/session";
import { resolveCurrentCompany } from "@/modules/companies/queries";
import { getMyEmployeeId } from "@/modules/daily-workforce/queries";
import { ChangePasswordDialog } from "@/modules/account-security/components/change-password-dialog";
import { AccountSubnav } from "@/modules/account/components/account-subnav";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/** Part 14 — Account & Security split out of the single long Account page into its own tab. */
export default async function AccountSecurityPage() {
  const { user } = await requireUser();
  const { currentCompanyId } = await resolveCurrentCompany(user.id);
  const t = await getTranslations("Account");

  if (!currentCompanyId) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 sm:p-6">
        <PageHeader title={t("tabSecurity")} />
        <EmptyState icon={UserCog} title={t("noCompanyTitle")} description={t("noCompanyDescription")} className="flex-1" />
      </div>
    );
  }

  const showRates = Boolean(await getMyEmployeeId(currentCompanyId, user.id));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={t("tabSecurity")} description={t("description")} />
      <AccountSubnav active="security" showRates={showRates} />

      <Card>
        <CardHeader>
          <CardTitle>{t("accountSecurity")}</CardTitle>
          <CardDescription>{t("accountSecurityDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{t("email")}</p>
              <p className="text-sm font-medium">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{t("password")}</p>
              <p className="text-sm font-medium tracking-widest">••••••••</p>
            </div>
            <ChangePasswordDialog />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
